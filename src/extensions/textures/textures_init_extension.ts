'use strict';

import * as Types from '../../typenames';
import { Context } from '../../context';
import { WebviewExtension } from '../webview_extension';
import { TextureExtensionExtension } from '../textures/texture_extension_extension';
import { DiagnosticSeverity } from 'vscode';
import * as fs from 'fs';

export class TexturesInitExtension implements WebviewExtension {
    private content: string;

    constructor() {
        this.content = '';
    }

    public async init(buffers: Types.BufferDefinition[], context: Context, makeAvailableResource: (localUri: string) => string) {
        await this.processBuffers(buffers, context, makeAvailableResource);
    }

    private async processBuffers(buffers: Types.BufferDefinition[], context: Context, makeAvailableResource: (localUri: string) => string) {
        const convertMagFilter = (mag: Types.TextureMagFilter | undefined) => {
            switch(mag) {
            case Types.TextureMagFilter.Nearest:
                return 'THREE.NearestFilter';
            case Types.TextureMagFilter.Linear:
            default:
                return 'THREE.LinearFilter';
            }
        };
        const convertMinFilter = (min: Types.TextureMinFilter | undefined) => {
            switch(min) {
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
        };
        const convertWrapMode = (wrap: Types.TextureWrapMode | undefined) => {
            switch(wrap) {
            case Types.TextureWrapMode.Clamp:
                return 'THREE.ClampToEdgeWrapping';
            case Types.TextureWrapMode.Repeat:
            default:
                return 'THREE.RepeatWrapping';
            case Types.TextureWrapMode.Mirror:
                return 'THREE.MirroredRepeatWrapping';
            }
        };

        const textureOnLoadScript = (texture: Types.TextureDefinition, bufferIndex: number, textureChannel: number) => {
            const magFilter = convertMagFilter(texture.Mag);
            const minFilter = convertMinFilter(texture.Min);
            const wrapMode = convertWrapMode(texture.Wrap);

            const textureFileOrigin = texture.File;
            const hasCustomSettings = texture.MagLine !== undefined || texture.MinLine !== undefined || texture.WrapLine !== undefined || textureFileOrigin !== undefined;
            const powerOfTwoWarning = `\
function isPowerOfTwo(n) {
    return n && (n & (n - 1)) === 0;
};
if (!isPowerOfTwo(texture.image.width) || !isPowerOfTwo(texture.image.height)) {
    let diagnostics = [];
    ${texture.MagLine !== undefined ? `diagnostics.push({
            line: ${texture.MagLine},
            message: 'Texture is not power of two, custom texture settings may not work.'
        });` : ''
}
    ${texture.MinLine !== undefined ? `diagnostics.push({
            line: ${texture.MinLine},
            message: 'Texture is not power of two, custom texture settings may not work.'
        });` : ''
}
    ${texture.WrapLine !== undefined ? `diagnostics.push({
            line: ${texture.WrapLine},
            message: 'Texture is not power of two, custom texture settings may not work.'
        });` : ''
}
    let diagnosticBatch = {
        filename: '${textureFileOrigin}',
        diagnostics: diagnostics
    };
    if (vscode !== undefined) {
        vscode.postMessage({
            command: 'showGlslDiagnostic',
            type: 'warning',
            diagnosticBatch: diagnosticBatch
        });
    }
};
buffers[${bufferIndex}].ChannelResolution[${textureChannel}] = new THREE.Vector3(texture.image.width, texture.image.height, 1);
buffers[${bufferIndex}].Shader.uniforms.iChannelResolution.value = buffers[${bufferIndex}].ChannelResolution;
`;

            return `\
function(texture) {
    ${hasCustomSettings ? powerOfTwoWarning : ''}
    texture.magFilter = ${magFilter};
    texture.minFilter = ${minFilter};
    texture.wrapS = ${wrapMode};
    texture.wrapT = ${wrapMode};
}`;
        };
        const makeTextureLoadErrorScript = (filename: string) => { 
            return `\
function(err) {
    console.log(err);
    if (vscode !== undefined) {
        vscode.postMessage({
            command: 'errorMessage',
            message: 'Failed loading texture file ${filename}'
        });
    }
}`;
        };

        for (const i in buffers) {
            const buffer = buffers[i];
            const textures =  buffer.TextureInputs;
            for (const texture of textures) {
                const channel = texture.Channel;

                const textureBufferIndex = texture.BufferIndex;
                const localPath = texture.LocalTexture;
                const remotePath = texture.RemoteTexture;

                if (texture.Type !== undefined && texture.Type === Types.TextureType.CubeMap) {
                    if (localPath === undefined || (localPath.match(/{}/g) || []).length !== 1) {
                        const diagnosticBatch: Types.DiagnosticBatch = {
                            filename: texture.File,
                            diagnostics: [{
                                line: texture.TypeLine || 0,
                                message: 'Only local paths with a single wildcard "{}" are supported for the CubeMap texture type.'
                            }]
                        };
                        context.showDiagnostics(diagnosticBatch, DiagnosticSeverity.Error);
                        continue;
                    }

                    const getTexturesFromPrefixes = async (pattern: string, prefixes: [string, string, string, string, string, string]) => {
                        const textures = [];
                        for (const dir of prefixes) {
                            const directionFile = pattern.replace('{}', dir);
                            try {
                                await fs.promises.access(directionFile);
                            }
                            catch {
                                return;
                            }
                            textures.push(directionFile);
                        }
                        return textures;
                    };

                    const possiblePrefixes: [string, string, string, string, string, string][] = [
                        ['e', 'w', 'u', 'd', 'n', 's'],
                        ['east', 'west', 'up', 'down', 'north', 'south'],
                        ['px', 'nx', 'py', 'ny', 'pz', 'nz'],
                        ['posx', 'negx', 'posy', 'negy', 'posz', 'negz']
                    ];

                    let textures: string[] | undefined = undefined;
                    for (const prefixes of possiblePrefixes) {
                        textures = await getTexturesFromPrefixes(localPath, prefixes);
                        if (textures !== undefined) {
                            break;
                        }
                    }

                    if (textures === undefined) {
                        const diagnosticBatch: Types.DiagnosticBatch = {
                            filename: texture.File,
                            diagnostics: [{
                                line: texture.TypeLine || 0,
                                message: 'Could not find all cubemap files for the given path with wildcard.'
                            }]
                        };
                        context.showDiagnostics(diagnosticBatch, DiagnosticSeverity.Error);
                        continue;
                    }

                    textures = textures.map((texture: string) => { return  makeAvailableResource(texture); });
                    const textureLoadScript = `new THREE.CubeTextureLoader().load([ "${textures.join('", "')}" ], ${textureOnLoadScript(texture, Number(i), channel)}, undefined, ${makeTextureLoadErrorScript(localPath)})`;
                
                    this.content += `\
buffers[${i}].Shader.uniforms.iChannel${channel} = { type: 't', value: ${textureLoadScript} };`;
                }
                else {
                    let textureLoadScript: string | undefined;
                    let textureSizeScript: string = 'null';
                    if (textureBufferIndex !== undefined) {
                        const magFilter = convertMagFilter(texture.Mag);
                        const minFilter = convertMinFilter(texture.Min);
                        const wrapMode = convertWrapMode(texture.Wrap);
            
                        textureLoadScript = `\
(() => {
    let texture = buffers[${textureBufferIndex}].Target.texture;
    texture.magFilter = ${magFilter};
    texture.minFilter = ${minFilter};
    texture.wrapS = ${wrapMode};
    texture.wrapT = ${wrapMode};
    return texture;
})()`;
                        textureSizeScript = `new THREE.Vector3(buffers[${textureBufferIndex}].Target.width, buffers[${textureBufferIndex}].Target.height, 1)`;
                    }
                    else if (localPath !== undefined && texture.Mag !== undefined && texture.Min !== undefined && texture.Wrap !== undefined) {
                        const resolvedPath = makeAvailableResource(localPath);
                        textureLoadScript = `texLoader.load('${resolvedPath}', ${textureOnLoadScript(texture, Number(i), channel)}, undefined, ${makeTextureLoadErrorScript(resolvedPath)})`;
                    }
                    else if (remotePath !== undefined && texture.Mag !== undefined && texture.Min !== undefined && texture.Wrap !== undefined) {
                        textureLoadScript = `texLoader.load('${remotePath}', ${textureOnLoadScript(texture, Number(i), channel)}, undefined, ${makeTextureLoadErrorScript(remotePath)})`;
                    }

                    if (textureLoadScript !== undefined) {
                        this.content += `\
buffers[${i}].ChannelResolution[${channel}] = ${textureSizeScript};
buffers[${i}].Shader.uniforms.iChannelResolution.value = buffers[${i}].ChannelResolution;
buffers[${i}].Shader.uniforms.iChannel${channel} = { type: 't', value: ${textureLoadScript} };`;
                    }
                }
            }

            if (buffer.UsesSelf) {
                this.content += `
buffers[${i}].Shader.uniforms.iChannel${buffer.SelfChannel} = { type: 't', value: buffers[${i}].PingPongTarget.texture };\n`;
            }

            if (buffer.UsesKeyboard) {
                this.content += `
buffers[${i}].Shader.uniforms.iKeyboard = { type: 't', value: keyBoardTexture };\n`;
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
