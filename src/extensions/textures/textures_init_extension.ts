'use strict';

import * as Types from '../../typenames';
import { Context } from '../../context';
import { WebviewExtension } from '../webview_extension';
import { TextureExtensionExtension } from '../textures/texture_extension_extension';

export class TexturesInitExtension implements WebviewExtension {
    private content: string;

    constructor(buffers: Types.BufferDefinition[], context: Context) {
        this.content = '';
        this.processBuffers(buffers, context);
    }

    private processBuffers(buffers: Types.BufferDefinition[], context: Context) {
        let textureOnLoadScript = (texture: Types.TextureDefinition, bufferIndex: number, textureChannel: number) => {
            let magFilter: string = (() => {
                switch(texture.Mag) {
                case Types.TextureMagFilter.Nearest:
                    return 'THREE.NearestFilter';
                case Types.TextureMagFilter.Linear:
                default:
                    return 'THREE.LinearFilter';
                }
            })();

            let minFilter: string = (() => {
                switch(texture.Min) {
                    case Types.TextureMinFilter.Nearest:
                        return'THREE.NearestFilter';
                    case Types.TextureMinFilter.NearestMipMapNearest:
                        return'THREE.NearestMipmapNearestFilter';
                    case Types.TextureMinFilter.NearestMipMapLinear:
                        return'THREE.NearestMipmapLinearFilter';
                    case Types.TextureMinFilter.Linear:
                    default:
                        return'THREE.LinearFilter';
                    case Types.TextureMinFilter.LinearMipMapNearest:
                        return'THREE.LinearMipmapNearestFilter';
                    case Types.TextureMinFilter.LinearMipMapLinear:
                        return'THREE.LinearMipmapLinearFilter';
                }
            })();

            let wrapMode: string = (() => {
                switch(texture.Wrap) {
                case Types.TextureWrapMode.Clamp:
                    return 'THREE.ClampToEdgeWrapping';
                case Types.TextureWrapMode.Repeat:
                default:
                    return 'THREE.RepeatWrapping';
                case Types.TextureWrapMode.Mirror:
                    return 'THREE.MirroredRepeatWrapping';
                }
            })();

            let textureFileOrigin = (texture.MagLine ? texture.MagLine.File : undefined)
                || (texture.MinLine ? texture.MinLine.File : undefined)
                || (texture.WrapLine ? texture.WrapLine.File : undefined);
            let hasCustomSettings = texture.MagLine !== undefined || texture.MinLine !== undefined || texture.WrapLine !== undefined || textureFileOrigin !== undefined;
            let powerOfTwoWarning = `
            function isPowerOfTwo(n) {
                return n && (n & (n - 1)) === 0;
            };
            if (!isPowerOfTwo(texture.image.width) || !isPowerOfTwo(texture.image.height)) {
                let diagnostics = [];
                ${texture.MagLine !== undefined ? `diagnostics.push({
                        line: ${texture.MagLine.Line},
                        message: 'Texture is not power of two, custom texture settings may not work.'
                    });` : ''
                }
                ${texture.MinLine !== undefined ? `diagnostics.push({
                        line: ${texture.MinLine.Line},
                        message: 'Texture is not power of two, custom texture settings may not work.'
                    });` : ''
                }
                ${texture.WrapLine !== undefined ? `diagnostics.push({
                        line: ${texture.WrapLine.Line},
                        message: 'Texture is not power of two, custom texture settings may not work.'
                    });` : ''
                }
                let diagnosticBatch = {
                    filename: '${textureFileOrigin}',
                    diagnostics: diagnostics
                };
                vscode.postMessage({
                    command: 'showGlslDiagnostic',
                    type: 'warning',
                    diagnosticBatch: diagnosticBatch
                });
            };
            buffers[${bufferIndex}].ChannelResolution[${textureChannel}] = new THREE.Vector3(texture.image.width, texture.image.height, 1);
            buffers[${bufferIndex}].Shader.uniforms.iChannelResolution.value = buffers[${bufferIndex}].ChannelResolution;
            `;

            return `function(texture) {
                ${hasCustomSettings ? powerOfTwoWarning : ''}
                texture.magFilter = ${magFilter};
                texture.minFilter = ${minFilter};
                texture.wrapS = ${wrapMode};
                texture.wrapT = ${wrapMode};
            }`;
        };
        let makeTextureLoadErrorScript = (filename: string) => { 
            return `function(err) {
                vscode.postMessage({
                    command: 'errorMessage',
                    message: 'Failed loading texture file ${filename}'
                });
            }`;
        };

        for (let i in buffers) {
            const buffer = buffers[i];
            const textures =  buffer.TextureInputs;
            for (let texture of textures) {
                const channel = texture.Channel;

                const textureBufferIndex = texture.BufferIndex;
                const localPath = texture.LocalTexture;
                const remotePath = texture.RemoteTexture;

                let textureLoadScript: string | undefined;
                let textureSizeScript: string = 'null';
                if (textureBufferIndex !== undefined) {
                    textureLoadScript = `buffers[${textureBufferIndex}].Target.texture`;
                    textureSizeScript = `new THREE.Vector3(buffers[${textureBufferIndex}].Target.width, buffers[${textureBufferIndex}].Target.height, 1)`;
                }
                else if (localPath !== undefined && texture.Mag !== undefined && texture.Min !== undefined && texture.Wrap !== undefined) {
                    const resolvedPath = context.makeWebviewResource(context.makeUri(localPath));
                    const resolvedPathString = resolvedPath.toString();
                    textureLoadScript = `texLoader.load('${resolvedPathString}', ${textureOnLoadScript(texture, Number(i), channel)}, undefined, ${makeTextureLoadErrorScript(resolvedPathString)})`;
                }
                else if (remotePath !== undefined && texture.Mag !== undefined && texture.Min !== undefined && texture.Wrap !== undefined) {
                    textureLoadScript = `texLoader.load('https://${remotePath}', ${textureOnLoadScript(texture, Number(i), channel)}, undefined, ${makeTextureLoadErrorScript(`https://${remotePath}`)})`;
                }

                if (textureLoadScript !== undefined) {
                    this.content += `\
buffers[${i}].ChannelResolution[${channel}] = ${textureSizeScript};
buffers[${i}].Shader.uniforms.iChannelResolution.value = buffers[${i}].ChannelResolution;
buffers[${i}].Shader.uniforms.iChannel${channel} = { type: 't', value: ${textureLoadScript} };`;
                }
            }

            if (buffer.UsesSelf) {
                this.content += `buffers[${i}].Shader.uniforms.iChannel${buffer.SelfChannel} = { type: 't', value: buffers[${i}].PingPongTarget.texture };\n`;
            }

            if (buffer.UsesKeyboard) {
                this.content += `buffers[${i}].Shader.uniforms.iKeyboard = { type: 't', value: keyBoardTexture };\n`;
            }
        }
    }

    public generateContent(): string {
        return this.content;
    }

    public addTextureContent(textureExtensionExtension: TextureExtensionExtension) {
        this.content += textureExtensionExtension.generateTextureContent();
    }
}
