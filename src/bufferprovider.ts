'use strict';

import * as vscode from 'vscode';
import mime from 'mime';
import * as path from 'path';
import * as fs from 'fs';
import * as Types from './typenames';
import { Context } from './context';
import { ShaderParser, ObjectType } from './shaderparser';
import { URL } from 'url';

type ChannelId = number;
type InputTexture = {
    Channel: ChannelId,
    Local: boolean,
    UserPath: string,
    Path: string
};
type InputTextureSettings = {
    Mag?: Types.TextureMagFilter,
    MagLine?: number,
    Min?: Types.TextureMinFilter,
    MinLine?: number,
    Wrap?: Types.TextureWrapMode
    WrapLine?: number,
    Type?: Types.TextureType
    TypeLine?: number,
};

export class BufferProvider {
    private context: Context;
    private visitedFiles: string[];
    constructor(context: Context) {
        this.context = context;
        this.visitedFiles = [];
    }

    public async parseShaderCode(file: string, code: string, buffers: Types.BufferDefinition[], commonIncludes: Types.IncludeDefinition[], generateStandalone: boolean) {
        await this.parseShaderCodeInternal(file, file, code, buffers, commonIncludes, generateStandalone);

        const findByName = (path: string) => {
            const name = this.makeName(path);
            return (value: { Name: string }) => {
                if (value.Name === name) {
                    return true;
                }
                return false;
            };
        };

        // Translate buffer names to indices including self reads
        for (let i = 0; i < buffers.length; i++) {
            const buffer = buffers[i];
            let usesSelf = false;
            let selfChannel = 0;
            for (let j = 0; j < buffer.TextureInputs.length; j++) {
                const texture = buffer.TextureInputs[j];
                if (texture.Buffer) {
                    texture.BufferIndex = buffers.findIndex(findByName(texture.Buffer));
                }
                else if (texture.Self) {
                    texture.Buffer = buffer.Name;
                    texture.BufferIndex = i;
                    usesSelf = true;
                    selfChannel = j;
                }
            }

            buffer.UsesSelf = usesSelf;
            buffer.SelfChannel = selfChannel;
        }

        // Resolve dependencies between passes
        for (let i = 0; i < buffers.length; i++) {
            const buffer = buffers[i];
            for (const texture of buffer.TextureInputs) {
                if (!texture.Self && texture.Buffer !== undefined && texture.BufferIndex !== undefined) {
                    const dependencyBuffer = buffers[texture.BufferIndex];
                    if (dependencyBuffer.UsesSelf) {
                        dependencyBuffer.Dependents.push({
                            Index: i,
                            Channel: texture.Channel
                        });
                    }
                }
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async readShaderFile(file: string): Promise<{ success: boolean, error: any, bufferCode: string }> {
        for (const editor of vscode.window.visibleTextEditors) {
            let editorFile = editor.document.fileName;
            editorFile = editorFile.replace(/\\/g, '/');
            if (editorFile === file) {
                return { success: true, error: null, bufferCode: editor.document.getText() };
            }
        }

        // Read the whole file of the shader
        let success = false;
        let bufferCode = '';
        let error = null;
        try {
            bufferCode = Buffer.from(await fs.promises.readFile(file, 'utf-8')).toString();
            success = true;
        }
        catch (e) {
            error = e;
        }

        return { success, error, bufferCode };
    }

    private makeName(path: string): string {
        const name = JSON.stringify(path);
        const trim = (name: string) => {
            return name.replace(/^["]+|["]+$/g, '');
        };
        return trim(name);
    }

    private async parseShaderCodeInternal(rootFile: string, file: string, code: string, buffers: Types.BufferDefinition[], commonIncludes: Types.IncludeDefinition[], generateStandalone: boolean) {
        const found = this.visitedFiles.find((visitedFile: string) => visitedFile === file);
        if (found) {
            return;
        }
        this.visitedFiles.push(file);

        const boxedLineOffset: Types.BoxedValue<number> = { Value: 0 };
        const pendingTextures: InputTexture[] = [];
        const pendingTextureSettings = new Map<ChannelId, InputTextureSettings>();
        const pendingUniforms: Types.UniformDefinition[] = [];
        const includes: Types.IncludeDefinition[] = [];
        const boxedUsesKeyboard: Types.BoxedValue<boolean> = { Value: false };
        const boxedFirstPersonControls: Types.BoxedValue<boolean> = { Value: false };
        const strictComp: Types.BoxedValue<boolean> = { Value: false };

        code = await this.transformCode(rootFile, file, code, boxedLineOffset, pendingTextures, pendingTextureSettings, pendingUniforms, includes, commonIncludes, boxedUsesKeyboard, boxedFirstPersonControls, strictComp, generateStandalone);

        const lineOffset = boxedLineOffset.Value;
        const textures: Types.TextureDefinition[] = [];
        const audios: Types.AudioDefinition[] = [];
        const uniforms: Types.UniformDefinition[] = [];
        const usesKeyboard = boxedUsesKeyboard.Value;
        const usesFirstPersonControls = boxedFirstPersonControls.Value;

        // Resolve textures
        for (const pendingTexture of pendingTextures) {
            const depFile = pendingTexture.Path;
            const userPath = pendingTexture.UserPath;
            const channel = pendingTexture.Channel;
            const local = pendingTexture.Local;

            const fullMime = mime.getType(path.extname(depFile) || 'txt') || 'text/plain';
            const mimeType = fullMime.split('/')[0] || 'text';
            switch (mimeType) {
            case 'text': {
                if (depFile === 'self' || depFile === file) {
                    // Push self as feedback-buffer
                    textures.push({
                        Channel: channel,
                        File: file,
                        Self: true
                    });
                }
                else {
                    // Read the whole file of the shader
                    const shaderFile = await this.readShaderFile(depFile);
                    if (shaderFile.success === false) {
                        vscode.window.showErrorMessage(`Could not open file: ${userPath}`);
                        return;
                    }

                    // Parse the shader
                    await this.parseShaderCodeInternal(rootFile, depFile, shaderFile.bufferCode, buffers, commonIncludes, generateStandalone);

                    // Push buffers as textures
                    textures.push({
                        Channel: channel,
                        File: file,
                        Buffer: this.makeName(depFile),
                    });
                }
                break;
            }
            case 'image': {
                if (local) {
                    textures.push({
                        Channel: channel,
                        File: file,
                        LocalTexture: depFile,
                        Mag: Types.TextureMagFilter.Linear,
                        Min: Types.TextureMinFilter.Linear,
                        Wrap: Types.TextureWrapMode.Repeat
                    });
                }
                else {
                    textures.push({
                        Channel: channel,
                        File: file,
                        RemoteTexture: depFile,
                        Mag: Types.TextureMagFilter.Linear,
                        Min: Types.TextureMinFilter.Linear,
                        Wrap: Types.TextureWrapMode.Repeat
                    });
                }
                break;
            }
            case 'audio': {
                if (this.context.getConfig<boolean>('enabledAudioInput')) {
                    if (local) {
                        audios.push({
                            Channel: channel,
                            LocalPath: depFile,
                            UserPath: userPath
                        });
                    }
                    else {
                        audios.push({
                            Channel: channel,
                            RemotePath: depFile,
                            UserPath: userPath
                        });
                    }
                }
                else {
                    vscode.window.showWarningMessage('You are trying to use an audio file, which is currently disabled in the settings.');
                }
                break;
            }
            default: {
                vscode.window.showWarningMessage(`You are trying to use an unsupported file ${depFile}`);
            }
            }
        }

        // Assign pending texture settings
        for (const texture of textures) {
            const pendingSettings = pendingTextureSettings.get(texture.Channel);
            if (pendingSettings !== undefined) {
                texture.Mag = pendingSettings.Mag || Types.TextureMagFilter.Linear;
                texture.MagLine = pendingSettings.MagLine;
                texture.Min = pendingSettings.Min || Types.TextureMinFilter.Linear;
                texture.MinLine = pendingSettings.MinLine;
                texture.Wrap = pendingSettings.Wrap || Types.TextureWrapMode.Repeat;
                texture.WrapLine = pendingSettings.WrapLine;
                texture.Type = pendingSettings.Type || Types.TextureType.Texture2D;
                texture.TypeLine = pendingSettings.TypeLine;
            }
        }

        // Transfer uniforms
        for (const pendingUniform of pendingUniforms) {
            const uniform = Object.create(pendingUniform);
            uniforms.push(uniform);
        }

        {
            const versionPos = code.search(/^#version/g);
            if (versionPos === 0) {
                const newLinePos = code.search('\n');
                const versionDirective = code.substring(versionPos, newLinePos - 1);
                code = code.replace(versionDirective, '');

                this.showInformationAtLine(file, `Version directive '${versionDirective}' ignored by shader-toy extension`, 0);
            }
        }

        {
            const insertMainImageCode = () => {
                code += `
void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    mainImage(gl_FragColor, fragCoord);
}`;
            };

            if (this.context.getConfig<boolean>('shaderToyStrictCompatibility') || strictComp.Value) {
                insertMainImageCode();
            }
            else {
                // If there is no void main() in the shader we assume it is a shader-toy style shader
                const mainPos = code.search(/void\s+main\s*\(\s*\)\s*\{/g);
                const mainImagePos = code.search(/void\s+mainImage\s*\(\s*out\s+vec4\s+\w+,\s*(in\s)?\s*vec2\s+\w+\s*\)\s*\{/g);
                if (mainPos === -1 && mainImagePos >= 0) {
                    insertMainImageCode();
                }
            }
        }

        {
            // Check if defined textures are used in shader
            const definedTextures = new Set<number>;
            for (const texture of textures) {
                definedTextures.add(texture.Channel);
            }
            for (const audio of audios) {
                definedTextures.add(audio.Channel);
            }
            if (this.context.getConfig<boolean>('warnOnUndefinedTextures')) {
                for (let i = 0; i < 9; i++) {
                    if (code.search('iChannel' + i) > 0) {
                        if (!definedTextures.has(i)) {
                            vscode.window.showWarningMessage(`iChannel${i} in use but there is no definition #iChannel${i} in shader`, 'Details')
                                .then(() => {
                                    vscode.window.showInformationMessage(`To use this channel add to your shader a line '#iChannel${i}' followed by a space and the path to your texture. Use 'file://' for local textures, 'https://' for remote textures or 'buf://' for other shaders.`);
                                });
                        }
                    }
                }
            }
        }

        if (this.context.getConfig<boolean>('enableGlslifySupport')) {
            let baseDir = path.dirname(rootFile);
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
            {
                baseDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
            }

            this.showInformationAtLine(file, `Using root path '${baseDir}' for glslify`, 0);

            // glslify the code
            const glsl = require('glslify'); // eslint-disable-line @typescript-eslint/no-var-requires
            try {
                code = glsl.compile(code, {basedir: baseDir});
            }
            catch (e) {
                vscode.window.showErrorMessage((e as Error).message);
            }
        }

        // Push yourself after all your dependencies
        buffers.push({
            Name: this.makeName(file),
            File: file,
            Code: code,
            Includes: includes,
            TextureInputs: textures,
            AudioInputs: audios,
            CustomUniforms: uniforms,
            UsesSelf: false,
            SelfChannel: -1,
            Dependents: [],
            UsesKeyboard: usesKeyboard,
            UsesFirstPersonControls: usesFirstPersonControls,
            LineOffset: lineOffset
        });
    }

    private async transformCode(rootFile: string, file: string, code: string, lineOffset: Types.BoxedValue<number>, textures: InputTexture[], textureSettings: Map<ChannelId, InputTextureSettings>,
        uniforms: Types.UniformDefinition[], includes: Types.IncludeDefinition[], sharedIncludes: Types.IncludeDefinition[], usesKeyboard: Types.BoxedValue<boolean>, usesFirstPersonControls: Types.BoxedValue<boolean>, strictComp: Types.BoxedValue<boolean>, generateStandalone: boolean): Promise<string> {

        const addTextureSettingIfNew = (channel: number) => {
            if (textureSettings.get(channel) === undefined) {
                textureSettings.set(channel, {});
            }
        };

        const parser = new ShaderParser(code);

        const replaceLastObject = (source: string) => {
            const lastRange = parser.getLastObjectRange();
            if (lastRange !== undefined) {
                code = parser.mutate(lastRange, source);
                parser.reset(lastRange.Begin + source.length);
            }
        };
        const removeLastObject = () => {
            replaceLastObject('');
        };

        let thisTextureSettings: InputTextureSettings | undefined;
        while (!parser.eof()) {
            const nextObject = parser.next();
            if (nextObject === undefined) {
                break;
            }

            switch (nextObject.Type) {
            case ObjectType.Error:
                this.showErrorAtLine(file, nextObject.Message, parser.line());
                break;
            case ObjectType.Texture: {
                let userPath = nextObject.Path;
                let textureFile: string;
                let local = false;

                // Note: This is sorta cursed
                try {
                    const textureUrl = new URL(userPath);
                    if (textureUrl.protocol === 'file:') {
                        local = true;
                    }
                }
                catch {
                    local = true;
                }

                if (local) {
                    userPath = userPath.replace('file://', '');
                    if (userPath === 'self') {
                        textureFile = userPath;
                    }
                    else {
                        ({ file: textureFile, userPath: userPath } = await this.context.mapUserPath(userPath, file));
                        if (generateStandalone) {
                            textureFile = path.relative(path.dirname(rootFile), textureFile);
                        }
                    }
                }
                else {
                    textureFile = nextObject.Path;
                }

                const texture: InputTexture = {
                    Channel: nextObject.Index,
                    Local: local,
                    UserPath: userPath,
                    Path: textureFile
                };
                textures.push(texture);
                removeLastObject();
                break;
            }
            case ObjectType.TextureMagFilter:
                addTextureSettingIfNew(nextObject.Index);
                thisTextureSettings = textureSettings.get(nextObject.Index);
                if (thisTextureSettings !== undefined) {
                    thisTextureSettings.Mag = nextObject.Value;
                    thisTextureSettings.MagLine = parser.line();
                }
                removeLastObject();
                break;
            case ObjectType.TextureMinFilter:
                addTextureSettingIfNew(nextObject.Index);
                thisTextureSettings = textureSettings.get(nextObject.Index);
                if (thisTextureSettings !== undefined) {
                    thisTextureSettings.Min = nextObject.Value;
                    thisTextureSettings.MinLine = parser.line();
                }
                removeLastObject();
                break;
            case ObjectType.TextureWrapMode:
                addTextureSettingIfNew(nextObject.Index);
                thisTextureSettings = textureSettings.get(nextObject.Index);
                if (thisTextureSettings !== undefined) {
                    thisTextureSettings.Wrap = nextObject.Value;
                    thisTextureSettings.WrapLine = parser.line();
                }
                removeLastObject();
                break;
            case ObjectType.TextureType:
                addTextureSettingIfNew(nextObject.Index);
                thisTextureSettings = textureSettings.get(nextObject.Index);
                if (thisTextureSettings !== undefined) {
                    thisTextureSettings.Type = nextObject.Value;
                    thisTextureSettings.TypeLine = parser.line();
                }
                removeLastObject();
                break;
            case ObjectType.Include: {
                const includeFile = (await this.context.mapUserPath(nextObject.Path, file)).file;

                let sharedIncludeIndex = sharedIncludes.findIndex((value: Types.IncludeDefinition) => {
                    if (value.File === includeFile) {
                        return true;
                    }
                    return false;
                });

                if (sharedIncludeIndex < 0) {
                    const includeCode = await this.readShaderFile(includeFile);
                    if (includeCode.success) {
                        const include_line_offset: Types.BoxedValue<number> = { Value: 0 };
                        const transformedIncludeCode = await this.transformCode(rootFile, includeFile, includeCode.bufferCode, include_line_offset, textures, textureSettings,
                            uniforms, includes, sharedIncludes, usesKeyboard, usesFirstPersonControls, strictComp, generateStandalone);
                        const newInclude: Types.IncludeDefinition = {
                            Name: this.makeName(includeFile),
                            File: includeFile,
                            Code: transformedIncludeCode,
                            LineCount: transformedIncludeCode.split(/\r\n|\n/).length
                        };
                        sharedIncludes.push(newInclude);
                        sharedIncludeIndex = sharedIncludes.length - 1;
                    }
                    else {
                        this.showErrorAtLine(file, `Failed opening include file "${includeFile}"`, parser.line());
                    }
                }

                if (sharedIncludeIndex >= 0) {
                    const include = sharedIncludes[sharedIncludeIndex];
                    includes.push(include);
                    lineOffset.Value += include.LineCount - 1;
                    replaceLastObject(include.Code);
                }

                break;
            }
            case ObjectType.Uniform:
                if (nextObject.Default !== undefined && nextObject.Min !== undefined && nextObject.Max !== undefined) {
                    const range = [nextObject.Min, nextObject.Max];
                    for (const i of [0, 1]) {
                        const value = range[i];
                        if (value.length !== nextObject.Default.length) {
                            if (value.length !== 1) {
                                const mismatchType = value.length < nextObject.Default.length ?
                                    'missing values will be replaced with first value given' :
                                    'redundant values will be removed';
                                const valueType = i === 0 ? 'minimum' : 'maximum';
                                this.showDiagnosticAtLine(file, `Type mismatch in ${valueType} value, ${mismatchType}.`, parser.line(), vscode.DiagnosticSeverity.Information);
                            }

                            for (const j of [0, 1, 2, 3]) {
                                if (range[i][j] === undefined) {
                                    range[i][j] = range[i][0];
                                }
                            }
                        }
                    }
                }

                if (nextObject.Default === undefined && nextObject.Min !== undefined) {
                    nextObject.Default = nextObject.Min;
                    this.showDiagnosticAtLine(file, 'Custom uniform specifies no default value, the minimum of its range will be used.', parser.line(), vscode.DiagnosticSeverity.Information);
                }

                if (nextObject.Default === undefined) {
                    this.showErrorAtLine(file, 'Can not deduce default value for custom uniform, either define a default value or range', parser.line());
                }
                else {
                    const uniform: Types.UniformDefinition = {
                        Name: nextObject.Name,
                        Typename: nextObject.Typename,
                        Default: nextObject.Default,
                        Min: nextObject.Min,
                        Max: nextObject.Max,
                        Step: nextObject.Step
                    };
                    uniforms.push(uniform);
                }
                removeLastObject();
                break;
            case ObjectType.Keyboard:
                usesKeyboard.Value = true;
                removeLastObject();
                break;
            case ObjectType.FirstPersonControls:
                usesFirstPersonControls.Value = true;
                removeLastObject();
                break;
            case ObjectType.StrictCompatibility:
                strictComp.Value = true;
                removeLastObject();
                break;
            default:
                break;
            }
        }

        return code;
    }

    private showDiagnosticAtLine(file: string, message: string, line: number, severity: vscode.DiagnosticSeverity) {
        const diagnosticBatch: Types.DiagnosticBatch = {
            filename: file,
            diagnostics: [{
                line: line,
                message: message
            }]
        };
        this.context.showDiagnostics(diagnosticBatch, severity);
    }
    private showErrorAtLine(file: string, message: string, line: number) {
        this.showDiagnosticAtLine(file, message, line, vscode.DiagnosticSeverity.Error);
    }
    private showWarningAtLine(file: string, message: string, line: number) {
        this.showDiagnosticAtLine(file, message, line, vscode.DiagnosticSeverity.Warning);
    }
    private showInformationAtLine(file: string, message: string, line: number) {
        this.showDiagnosticAtLine(file, message, line, vscode.DiagnosticSeverity.Information);
    }
}
