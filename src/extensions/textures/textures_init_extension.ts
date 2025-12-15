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
        const isDDSPath = (path: string | undefined) => {
            return path !== undefined && path.toLowerCase().endsWith('.dds');
        };

        let usesDDSTextureLoader = false;

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
    let errorText = '';
    try {
        // THREE.FileLoader errors are often ErrorEvent instances.
        if (err && err.message) {
            errorText = ': ' + err.message;
        }
        else if (err && err.target && typeof err.target.status === 'number') {
            errorText = ': HTTP ' + err.target.status;
        }
        else if (err) {
            errorText = ': ' + String(err);
        }
    } catch { /* ignore */ }
    if (vscode !== undefined) {
        vscode.postMessage({
            command: 'errorMessage',
            message: 'Failed loading texture file ${filename}' + errorText
        });
    }
}`;
        };

        const ddsFloatTextureLoaderScript = () => {
            return `\
let ddsRequestId = 0;
let ddsPendingRequests = new Map();

function ddsBase64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

function ddsReadLocalFileAsArrayBuffer(localPath) {
    return new Promise((resolve, reject) => {
        if (!vscode) {
            reject(new Error('VS Code API unavailable'));
            return;
        }

        const requestId = ++ddsRequestId;
        ddsPendingRequests.set(requestId, { resolve, reject });
        vscode.postMessage({
            command: 'readDDSFile',
            requestId,
            file: localPath
        });
    });
}

window.addEventListener('message', event => {
    const message = event.data;
    if (!message || message.command !== 'readDDSFileResult') {
        return;
    }

    const pending = ddsPendingRequests.get(message.requestId);
    if (!pending) {
        return;
    }
    ddsPendingRequests.delete(message.requestId);

    if (message.ok) {
        try {
            pending.resolve(ddsBase64ToArrayBuffer(message.base64));
        } catch (e) {
            pending.reject(e);
        }
    } else {
        pending.reject(new Error(message.error || 'Failed to read binary file'));
    }
});

function isDDSMagic(buffer) {
    // 'DDS '
    return (new DataView(buffer)).getUint32(0, true) === 0x20534444;
}

function parseDDS(buffer) {
    const dv = new DataView(buffer);

    if (dv.getUint32(0, true) !== 0x20534444) {
        throw new Error('Invalid DDS magic');
    }

    const DDPF_FOURCC = 0x4;
    const DDSD_PITCH = 0x8;
    const DDSCAPS2_CUBEMAP_MASK = 0x0000FE00;
    const DDSCAPS2_VOLUME = 0x00200000;
    const DDS_RESOURCE_MISC_TEXTURECUBE = 0x4;

    // DDS_HEADER starts right after magic
    const headerStart = 4;
    const headerSize = dv.getUint32(headerStart + 0, true);
    if (headerSize !== 124) {
        throw new Error('Invalid DDS header size');
    }

    const headerFlags = dv.getUint32(headerStart + 4, true);

    const height = dv.getUint32(headerStart + 8, true);
    const width = dv.getUint32(headerStart + 12, true);

    const pitchOrLinearSize = dv.getUint32(headerStart + 16, true);
    const mipMapCount = dv.getUint32(headerStart + 24, true);
    if (mipMapCount > 1) {
        throw new Error('Mipmaps not supported');
    }

    // Reject cubemaps / volume textures early (legacy DDS header flags).
    const caps2 = dv.getUint32(headerStart + 108, true);
    if ((caps2 & (DDSCAPS2_CUBEMAP_MASK | DDSCAPS2_VOLUME)) !== 0) {
        throw new Error('Cubemaps/volume textures not supported');
    }

    // DDS_PIXELFORMAT starts at offset 72 in DDS_HEADER
    const pfStart = headerStart + 72;
    const pfSize = dv.getUint32(pfStart + 0, true);
    if (pfSize !== 32) {
        throw new Error('Invalid DDS pixel format size');
    }

    const pfFlags = dv.getUint32(pfStart + 4, true);
    const pfFourCC = dv.getUint32(pfStart + 8, true);
    const hasDX10Header = pfFourCC === 0x30315844; // 'DX10'

    let dataOffset = headerStart + 124;
    let bytesPerPixel = 0;
    let channelCount = 0;
    let expandToRGBA = false;

    if (hasDX10Header) {
        if ((pfFlags & DDPF_FOURCC) === 0) {
            throw new Error('Invalid DDS pixel format flags for DX10 header');
        }

        // DDS_HEADER_DXT10 (20 bytes)
        const dx10Start = dataOffset;
        const dxgiFormat = dv.getUint32(dx10Start + 0, true);
        const resourceDimension = dv.getUint32(dx10Start + 4, true);
        const miscFlag = dv.getUint32(dx10Start + 8, true);
        const arraySize = dv.getUint32(dx10Start + 12, true);

        // Only support 2D textures, non-array
        if (resourceDimension !== 3 /* D3D10_RESOURCE_DIMENSION_TEXTURE2D */) {
            throw new Error('Unsupported DDS DX10 resource dimension');
        }
        if (arraySize !== 1) {
            throw new Error('Unsupported DDS DX10 arraySize');
        }
        if ((miscFlag & DDS_RESOURCE_MISC_TEXTURECUBE) !== 0) {
            throw new Error('Unsupported DDS DX10 cubemap');
        }

        // DXGI_FORMAT_R32G32B32A32_FLOAT = 2
        // DXGI_FORMAT_R32G32B32_FLOAT = 6
        // DXGI_FORMAT_R32G32_FLOAT = 16
        // DXGI_FORMAT_R32_FLOAT = 41
        if (dxgiFormat === 2) {
            bytesPerPixel = 16;
            channelCount = 4;
        }
        else if (dxgiFormat === 6) {
            bytesPerPixel = 12;
            channelCount = 3;
        }
        else if (dxgiFormat === 16) {
            // Expanded to RGBA32F on load.
            bytesPerPixel = 8;
            channelCount = 2;
            expandToRGBA = true;
        }
        else if (dxgiFormat === 41) {
            // Expanded to RGBA32F on load.
            bytesPerPixel = 4;
            channelCount = 1;
            expandToRGBA = true;
        }
        else {
            throw new Error('Unsupported DDS DX10 format (expected RGBA32F/RGB32F/RG32F/R32F)');
        }

        dataOffset += 20;
    }
    else {
        // Legacy FourCC float formats used by some tools
        // D3DFMT_A32B32G32R32F = 116
        // D3DFMT_A16B16G16R16F = 113 (not supported in this minimal loader)
        if (pfFourCC !== 116) {
            throw new Error('Unsupported DDS format (expected DX10 RGB32F/RGBA32F or FourCC 116)');
        }
        bytesPerPixel = 16;
        channelCount = 4;
    }

    const expectedByteSize = width * height * bytesPerPixel;
    if (dataOffset + expectedByteSize > buffer.byteLength) {
        throw new Error('DDS data truncated');
    }

    const expectedPitch = width * bytesPerPixel;
    if ((headerFlags & DDSD_PITCH) !== 0 || pitchOrLinearSize !== 0) {
        if (pitchOrLinearSize !== 0 && pitchOrLinearSize !== expectedPitch) {
            throw new Error('Unsupported DDS row pitch (padded rows not supported)');
        }
    }

    if ((dataOffset % 4) !== 0) {
        throw new Error('Unsupported DDS data alignment');
    }

    const floatCount = width * height * channelCount;
    const source = new Float32Array(buffer, dataOffset, floatCount);

    if (!expandToRGBA) {
        return { width, height, data: source, channelCount };
    }

    const pixelCount = width * height;
    const data = new Float32Array(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
        if (channelCount === 1) {
            data[i * 4 + 0] = source[i];
            data[i * 4 + 1] = 0.0;
            data[i * 4 + 2] = 0.0;
            data[i * 4 + 3] = 1.0;
        }
        else if (channelCount === 2) {
            const base = i * 2;
            data[i * 4 + 0] = source[base + 0];
            data[i * 4 + 1] = source[base + 1];
            data[i * 4 + 2] = 0.0;
            data[i * 4 + 3] = 1.0;
        }
        else {
            throw new Error('Internal error: expandToRGBA only supported for R32/RG32');
        }
    }
    return { width, height, data, channelCount: 4 };
}

function ddsMakeTextureFromBuffer(buffer, bufferIndex, channelIndex, onLoad, onError) {
    try {
        if (!isDDSMagic(buffer)) {
            throw new Error('Not a DDS file');
        }

        const parsed = parseDDS(buffer);

        // IMPORTANT: avoid resizing an already-uploaded DataTexture in-place.
        // Some WebGL2/THREE paths use immutable storage and later uploads may fail if dimensions change.
        const format = (parsed.channelCount === 3) ? THREE.RGBFormat : THREE.RGBAFormat;
        const loaded = new THREE.DataTexture(parsed.data, parsed.width, parsed.height, format, THREE.FloatType);
        loaded.generateMipmaps = false;
        loaded.flipY = false;

        try {
            if (loaded.internalFormat !== undefined) {
                loaded.internalFormat = (parsed.channelCount === 3) ? 'RGB32F' : 'RGBA32F';
            }
        } catch { /* ignore */ }

        // Keep float filtering safe across WebGL1/WebGL2.
        try {
            const floatLinear = gl.getExtension('OES_texture_float_linear') != null;
            if (!floatLinear) {
                loaded.magFilter = THREE.NearestFilter;
                loaded.minFilter = THREE.NearestFilter;
            }
        } catch { /* ignore */ }

        loaded.needsUpdate = true;

        // Swap the loaded texture into the uniform while keeping the uniform object stable.
        try {
            const uniformName = 'iChannel' + channelIndex;
            if (buffers && buffers[bufferIndex] && buffers[bufferIndex].Shader && buffers[bufferIndex].Shader.uniforms && buffers[bufferIndex].Shader.uniforms[uniformName]) {
                buffers[bufferIndex].Shader.uniforms[uniformName].value = loaded;
            }
        } catch { /* ignore */ }

        if (typeof onLoad === 'function') {
            onLoad(loaded);
        }
    }
    catch (err) {
        console.log(err);
        if (typeof onError === 'function') {
            onError(err);
        }
    }
}

function loadDDSTextureFromLocalFile(localPath, bufferIndex, channelIndex, onLoad, onError) {
    // Placeholder texture; updated in-place after async fetch.
    const placeholder = new THREE.DataTexture(new Float32Array([0, 0, 0, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    placeholder.generateMipmaps = false;
    placeholder.flipY = false;
    // Float textures require OES_texture_float_linear for linear filtering (WebGL1 and WebGL2).
    // Fall back to nearest when the extension is unavailable.
    try {
        const floatLinear = gl.getExtension('OES_texture_float_linear') != null;
        const filter = floatLinear ? THREE.LinearFilter : THREE.NearestFilter;
        placeholder.magFilter = filter;
        placeholder.minFilter = filter;
    } catch { /* ignore */ }
    placeholder.needsUpdate = true;

    // Try to request the correct internal format when running on a newer THREE/WebGL2.
    try {
        if (placeholder.internalFormat !== undefined) {
            placeholder.internalFormat = 'RGBA32F';
        }
    } catch { /* ignore */ }

    // Float textures are always supported for sampling in WebGL2; WebGL1 needs OES_texture_float.
    try {
        if (!isWebGL2) {
            const floatExt = gl.getExtension('OES_texture_float');
            if (floatExt == null) {
                throw new Error('OES_texture_float not supported (required for DDS RGBA32F in WebGL1)');
            }
        }
    }
    catch (err) {
        console.log(err);
        if (typeof onError === 'function') {
            onError(err);
        }
        return placeholder;
    }

    try {
        (async () => {
            try {
                const buffer = await ddsReadLocalFileAsArrayBuffer(localPath);
                ddsMakeTextureFromBuffer(buffer, bufferIndex, channelIndex, onLoad, onError);
            }
            catch (err) {
                console.log(err);
                if (typeof onError === 'function') {
                    onError(err);
                }
            }
        })();
    } catch { /* ignore */ }

    return placeholder;
}

function loadDDSTexture(url, bufferIndex, channelIndex, onLoad, onError) {
    // Remote DDS (https://...) still uses THREE.FileLoader.
    const placeholder = new THREE.DataTexture(new Float32Array([0, 0, 0, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    placeholder.generateMipmaps = false;
    placeholder.flipY = false;
    placeholder.needsUpdate = true;

    const requestUrl = String(url);
    const fileLoader = new THREE.FileLoader();
    fileLoader.setResponseType('arraybuffer');
    fileLoader.load(
        requestUrl,
        (data) => {
            const buffer = data;
            if (buffer instanceof ArrayBuffer) {
                ddsMakeTextureFromBuffer(buffer, bufferIndex, channelIndex, onLoad, onError);
            } else {
                if (typeof onError === 'function') {
                    onError(new Error('Unexpected DDS payload type'));
                }
            }
        },
        undefined,
        (err) => {
            console.log(err);
            if (typeof onError === 'function') {
                onError(err);
            }
        }
    );

    return placeholder;
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
                        if (isDDSPath(localPath) || isDDSPath(resolvedPath)) {
                            usesDDSTextureLoader = true;
                            textureLoadScript = `loadDDSTextureFromLocalFile(${JSON.stringify(localPath)}, ${Number(i)}, ${channel}, ${textureOnLoadScript(texture, Number(i), channel)}, ${makeTextureLoadErrorScript(localPath)})`;
                        }
                        else {
                            textureLoadScript = `texLoader.load('${resolvedPath}', ${textureOnLoadScript(texture, Number(i), channel)}, undefined, ${makeTextureLoadErrorScript(resolvedPath)})`;
                        }
                    }
                    else if (remotePath !== undefined && texture.Mag !== undefined && texture.Min !== undefined && texture.Wrap !== undefined) {
                        if (isDDSPath(remotePath)) {
                            usesDDSTextureLoader = true;
                            textureLoadScript = `loadDDSTexture('${remotePath}', ${Number(i)}, ${channel}, ${textureOnLoadScript(texture, Number(i), channel)}, ${makeTextureLoadErrorScript(remotePath)})`;
                        }
                        else {
                            textureLoadScript = `texLoader.load('${remotePath}', ${textureOnLoadScript(texture, Number(i), channel)}, undefined, ${makeTextureLoadErrorScript(remotePath)})`;
                        }
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

        if (usesDDSTextureLoader) {
            this.content = `${ddsFloatTextureLoaderScript()}\n\n${this.content}`;
        }
    }

    public generateContent(): string {
        return this.content;
    }

    public addTextureContent(textureExtensionExtension: TextureExtensionExtension) {
        this.content += textureExtensionExtension.generateTextureContent();
    }
}
