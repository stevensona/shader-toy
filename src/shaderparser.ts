'use strict';

import * as vscode from 'vscode';
import * as mime from 'mime';
import * as fs from 'fs';
import * as path from 'path';
import * as Types from'./typenames';
import { Context } from './context';

export class ShaderParser {
    private context: Context;
    private visitedFiles: string[];
    constructor(context: Context) {
        this.context = context;
        this.visitedFiles = [];
    }

    public parseShaderCode(file: string, code: string, buffers: Types.BufferDefinition[], commonIncludes: Types.IncludeDefinition[]) {
        this.parseShaderCodeInternal(file, code, buffers, commonIncludes);

        const findByName = (bufferName: string) => {
            let strippedName = this.stripPath(bufferName);
            return (value: any) => {
                if (value.Name === strippedName) {
                    return true;
                }
                return false;
            };
        };

        // Translate buffer names to indices including self reads
        for (let i = 0; i < buffers.length; i++) {
            let buffer = buffers[i];
            let usesSelf = false;
            let selfChannel = 0;
            for (let j = 0; j < buffer.TextureInputs.length; j++) {
                let texture = buffer.TextureInputs[j];
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
            let buffer = buffers[i];
            for (let texture of buffer.TextureInputs) {
                if (!texture.Self && texture.Buffer !== undefined && texture.BufferIndex !== undefined) {
                    let dependencyBuffer = buffers[texture.BufferIndex];
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

    private readShaderFile(file: string): { success: boolean, error: any, bufferCode: string } {
        // Read the whole file of the shader
        let success = false;
        let bufferCode = '';
        let error = null;
        try {
            bufferCode = fs.readFileSync(file, 'utf-8');
            success = true;
        }
        catch (e) {
            error = e;
        }

        return { success, error, bufferCode };
    }
    private stripPath(name: string): string{
        let lastSlash = name.lastIndexOf('/');
        return name.substring(lastSlash + 1);
    }

    private mapUserPathToWorkspacePath(userPath: string): { file: string, userPath: string } {
        userPath = userPath.replace(/\\/g, '/');

        let file = ((file: string) => {
            const relFile = vscode.workspace.asRelativePath(file);
            const herePos = relFile.indexOf('./');
            if (vscode.workspace.workspaceFolders === undefined && herePos === 0) {
                vscode.window.showErrorMessage('To use relative paths please open a workspace!');
            }
            if ((relFile !== file || herePos === 0) && vscode.workspace.workspaceFolders !== undefined) {
                let fileCandidates: string[] = [];
                for (let worspaceFolder of vscode.workspace.workspaceFolders) {
                    let fileCandidate = worspaceFolder.uri.fsPath + '/' + relFile;
                    fileCandidate = fileCandidate.replace(/\\/g, '/');
                    fileCandidate = fileCandidate.replace(/\.\//g, '');
                    if (fs.existsSync(fileCandidate)) {
                        fileCandidates.push(fileCandidate);
                    }
                }

                if (fileCandidates.length === 0) {
                    vscode.window.showErrorMessage(`No candidates for file '${userPath}' were found in your workspace folders.`);
                }
                else if (fileCandidates.length > 1) {
                    vscode.window.showErrorMessage(`Multiple candidates for file '${userPath}' were found in your workspace folders, first option was picked: '${fileCandidates[0]}'`);
                }

                return fileCandidates[0];
            }
            else {
                return file;
            }
        })(userPath);
        return { file, userPath };
    }

    private parseIncludeCodeInternal(file: string, commonIncludes: Types.IncludeDefinition[]): Types.IncludeDefinition {
        let userPath = file;
        ({ file, userPath } = this.mapUserPathToWorkspacePath(userPath));

        const name = path.basename(file);
        
        // Read the whole file of the shader
        const shaderFile = this.readShaderFile(file);
        if(shaderFile.success === false){
            vscode.window.showErrorMessage(`Could not open file: ${userPath}`);
            return {
                Name: name,
                File: file,
                Code: '',
                LineCount: 0
            };
        }
        let code = shaderFile.bufferCode;

        let includeMatch = code.match(/#include/m);
        while (includeMatch && includeMatch.index !== undefined && includeMatch.index >= 0) {
            let includePos = includeMatch.index;
            let endlineMatch = code.substring(includePos).match(/\r\n|\r|\n/);
            if (endlineMatch !== null && endlineMatch.index !== undefined) {
                endlineMatch.index += includePos;
                let endlinePos = endlineMatch.index + endlineMatch[0].length;
                let line = code.substring(includePos, endlineMatch.index);

                let leftQuotePos = line.search(/"|'/);
                let rightQuotePos = line.substring(leftQuotePos + 1).search(/"|'/) + leftQuotePos + 1;

                if (leftQuotePos < 0 || rightQuotePos < 0) {
                    if (this.context.getConfig<boolean>('omitDeprecationWarnings') === false) {
                        vscode.window.showErrorMessage('Nested includes have to use non-deprecated syntax, i.e. use quotes and omit a scheme.');
                    }
                }
                else {
                    let quotedPart = line.substring(leftQuotePos + 1, rightQuotePos).trim();
                    let nestedInclude = this.parseIncludeCodeInternal(quotedPart, commonIncludes);
                    code = code.replace(line, nestedInclude.Code);
                }
            }
            includeMatch = code.match(/#include/m);
        }

        let include = {
            Name: name,
            File: file,
            Code: code,
            LineCount: code.split(/\r\n|\n/).length
        };

        commonIncludes.push(include);
        return include;
    }

    private parseShaderCodeInternal(file: string, code: string, buffers: Types.BufferDefinition[], commonIncludes: Types.IncludeDefinition[]) {
        const found = this.visitedFiles.find((visitedFile: string) => visitedFile === file);
        if (found) {
            return;
        }
        this.visitedFiles.push(file);

        let line_offset = 0;
        let textures: Types.TextureDefinition[] = [];
        let pendingTextureSettings: Types.TextureDefinition[] = [];
        let audios: Types.AudioDefinition[] = [];
        let uniforms: Types.UniformDefinition[] = [];
        let includes: string[] = [];

        const loadDependency = (depFile: string, channel: number, passType: string, codePosition: number) => {
            // Get type and name of file
            let colonPos = depFile.indexOf('://', 0);
            
            let inputType = 'file';
            let userPath = depFile;

            if (colonPos >= 0) {
                inputType = depFile.substring(0, colonPos);
                userPath = depFile.substring(colonPos + 3, depFile.length);
            }

            ({ file: depFile, userPath } = this.mapUserPathToWorkspacePath(userPath));

            if (inputType !== 'file' && inputType !== 'https') {
                if (this.context.getConfig<boolean>('omitDeprecationWarnings') === false) {
                    if (passType === 'include') {
                        vscode.window.showWarningMessage(`You are using deprecated input methods, no protocol is required for includes, simply use '#include './file.glsl''`);
                    }
                    else {
                        vscode.window.showWarningMessage(`You are using deprecated input methods, use 'file://' or 'https://', the type of input will be inferred.`);
                    }
                }
                inputType = 'file';
            }

            let isLocalFile: boolean = inputType === 'file';
            let fileType = depFile.split('.').pop();
            let fullMime = mime.getType(fileType || 'txt') || 'text/plain';
            let mimeType = fullMime.split('/')[0] || 'text';

            if (passType === 'include') {
                const name = path.basename(depFile);

                // Attempt to get the include if already exists
                let include = commonIncludes.find(include => include.File === depFile);
                if (include === undefined) {
                    include = this.parseIncludeCodeInternal(userPath, commonIncludes);
                }

                // offset the include line count
                line_offset += include.LineCount - 1;

                // Directly insert include into code
                code = code.substring(0, codePosition) + include.Code + code.substring(codePosition);

                // store the reference name for this include
                includes.push(name);
            }
            else {
                switch (mimeType) {
                    case 'text': {
                        if (depFile === 'self' || depFile === file) {
                            // Push self as feedback-buffer
                            textures.push({
                                Channel: channel,
                                Self: true
                            });
                        }
                        else {
                            // Read the whole file of the shader
                            const shaderFile = this.readShaderFile(depFile);
                            if(shaderFile.success === false){
                                vscode.window.showErrorMessage(`Could not open file: ${userPath}`);
                                return;
                            }
        
                            // Parse the shader
                            this.parseShaderCodeInternal(depFile, shaderFile.bufferCode, buffers, commonIncludes);
                
                            // Push buffers as textures
                            textures.push({
                                Channel: channel,
                                Buffer: this.stripPath(depFile),
                            });
                        }
                        break;
                    }
                    case 'image': {
                        if (isLocalFile) {
                            textures.push({
                                Channel: channel,
                                LocalTexture: depFile,
                                Mag: Types.TextureMagFilter.Linear,
                                Min: Types.TextureMinFilter.Linear,
                                Wrap: Types.TextureWrapMode.Clamp
                            });
                        }
                        else {
                            textures.push({
                                Channel: channel,
                                RemoteTexture: depFile,
                                Mag: Types.TextureMagFilter.Linear,
                                Min: Types.TextureMinFilter.Linear,
                                Wrap: Types.TextureWrapMode.Clamp
                            });
                        }
                        break;
                    }
                    case 'audio': {
                        if (this.context.getConfig<boolean>('enabledAudioInput')) {
                            if (isLocalFile) {
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
                            vscode.window.showWarningMessage(`You are trying to use an audio file, which is currently disabled in the settings.`);
                        }
                        break;
                    }
                    default: {
                        vscode.window.showWarningMessage(`You are trying to use an unsupported file ${depFile}`);
                    }
                }
            }
        };

        const getLineNumber = (position: number) => {
            let substr = code.substring(0, position);
            var count = (substr.match(/(\r\n|\r|\n)/g) || []).length;
            return count - line_offset;
        };

        const showDiagnosticAtPosition = (message: string, position: number) => {
            let diagnosticBatch: Types.DiagnosticBatch = {
                filename: file,
                diagnostics: [{
                    line: getLineNumber(position),
                    message: message
                }]
            };
            this.context.showDiagnostics(diagnosticBatch, vscode.DiagnosticSeverity.Information);
        };

        let usesKeyboard = false;
        let useTextureDefinitionInShaders = this.context.getConfig<boolean>('useInShaderTextures');
        if (useTextureDefinitionInShaders) {
            // Find all #iChannel defines, which define textures and other shaders
            type Match = {
                TexturePos: number;
                MatchLength: number;
                PassType: string;
            };

            const findNextMatch = (): Match | undefined => {
                let channelMatch = code.match(/#(iChannel|include|iKeyboard|iUniform)/m);
                if (channelMatch && channelMatch.index !== undefined && channelMatch.index >= 0) {
                    return {
                        TexturePos: channelMatch.index,
                        MatchLength: channelMatch[0].length,
                        PassType: channelMatch[1] || '',
                    };
                }
                return undefined;
            };
            let nextMatch: Match | undefined;
            while (nextMatch = findNextMatch()) {
                let channelPos = nextMatch.TexturePos + nextMatch.MatchLength;
                let endlineMatch = code.substring(channelPos).match(/\r\n|\r|\n/);
                if (endlineMatch !== null && endlineMatch.index !== undefined) {
                    endlineMatch.index += channelPos;
                    let endlinePos = endlineMatch.index + endlineMatch[0].length;

                    switch (nextMatch.PassType) {
                        case 'iKeyboard': {
                            usesKeyboard = true;
                            break;
                        }
                        case 'iUniform': {
                            let line = code.substring(channelPos, endlineMatch.index);
                            let uniform = this.parseUniformCode(line, (message: string) => showDiagnosticAtPosition(message, endlinePos));
                            if (uniform !== undefined) {
                                uniforms.push(uniform);
                            }
                            break;
                        }
                        case 'iChannel':
                        case 'include': {
                            let line = code.substring(channelPos, endlineMatch.index);

                            let leftQuotePos = line.search(/"|'/);
                            let rightQuotePos = line.substring(leftQuotePos + 1).search(/"|'/) + leftQuotePos + 1;

                            let channel: number | undefined;
                            let input: string | undefined;

                            if (leftQuotePos < 0 || rightQuotePos < 0) {
                                if (this.context.getConfig<boolean>('omitDeprecationWarnings') === false) {
                                    vscode.window.showWarningMessage('To use input, wrap the path/url of your input in quotes, omitting quotes is deprecated syntax.');
                                }

                                let spacePos = Math.min(code.indexOf(' ', channelPos), endlineMatch.index);
        
                                // Get channel number
                                channel = parseInt(code.substring(channelPos, spacePos));
        
                                let afterSpacePos = code.indexOf(' ', spacePos + 1);
                                let afterCommentPos = code.indexOf('//', code.indexOf('://', spacePos)  + 3);
                                let textureEndPos = Math.min(endlineMatch.index,
                                    afterSpacePos > 0 ? afterSpacePos : code.length,
                                    afterCommentPos > 0 ? afterCommentPos : code.length);

                                // Get dependencies' name
                                input = code.substring(spacePos + 1, textureEndPos);
                            }
                            else {
                                let leftPart = line.substring(0, leftQuotePos).trim();
                                let quotedPart = line.substring(leftQuotePos + 1, rightQuotePos).trim();
                                
                                let scopePos = leftPart.search(/^\d+::/);
                                if (scopePos < 0) {
                                    channel = parseInt(leftPart);
                                    input = quotedPart;
                                }
                                else {
                                    scopePos = leftPart.search('::');

                                    let magFilter: Types.TextureMagFilter | undefined;
                                    let minFilter: Types.TextureMinFilter | undefined;
                                    let wrapMode: Types.TextureWrapMode | undefined;

                                    let channelPart = leftPart.substring(0, scopePos);
                                    channel = parseInt(channelPart);

                                    let settingName = leftPart.substring(scopePos + 2);
                                    switch (settingName) {
                                        case 'MagFilter':
                                            magFilter = (() => {
                                                switch(quotedPart) {
                                                    case 'Nearest':
                                                        return Types.TextureMagFilter.Nearest;
                                                    case 'Linear':
                                                        return Types.TextureMagFilter.Linear;
                                                    default:
                                                        showDiagnosticAtPosition(`Valid MagFilter options are: 'Nearest' or 'Linear'`, endlinePos);
                                                }
                                            })();

                                            break;
                                        case 'MinFilter':
                                            minFilter = (() => {
                                                switch(quotedPart) {
                                                    case 'Nearest':
                                                        return Types.TextureMinFilter.Nearest;
                                                    case 'NearestMipMapNearest':
                                                        return Types.TextureMinFilter.NearestMipMapNearest;
                                                    case 'NearestMipMapLinear':
                                                        return Types.TextureMinFilter.NearestMipMapLinear;
                                                    case 'Linear':
                                                        return Types.TextureMinFilter.Linear;
                                                    case 'LinearMipMapNearest':
                                                        return Types.TextureMinFilter.LinearMipMapNearest;
                                                    case 'LinearMipMapLinear':
                                                        return Types.TextureMinFilter.LinearMipMapLinear;
                                                    default:
                                                        showDiagnosticAtPosition(`Valid MinFilter options are: 'Nearest', 'NearestMipMapNearest', 'NearestMipMapLinear', 'Linear', 'LinearMipMapNearest' or 'LinearMipMapLinear'`, endlinePos);
                                                }
                                            })();

                                            break;
                                        case 'WrapMode':
                                            wrapMode = (() => {
                                                switch(quotedPart) {
                                                    case 'Repeat':
                                                        return Types.TextureWrapMode.Repeat;
                                                    case 'Clamp':
                                                        return Types.TextureWrapMode.Clamp;
                                                    case 'Mirror':
                                                        return Types.TextureWrapMode.Mirror;
                                                    default:
                                                        showDiagnosticAtPosition(`Valid WrapMode options are: 'Clamp', 'Repeat' or 'Mirror'`, endlinePos);
                                                }
                                            })();
                                            
                                            break;
                                        default:
                                            vscode.window.showWarningMessage(`Unkown texture setting '${settingName}', choose either 'MinFilter', 'MagFilter' or 'WrapMode'`);
                                    }

                                    let texture = textures.find((texture: Types.TextureDefinition) => {
                                        return texture.Channel === channel;
                                    });
                                    if (texture === undefined) {
                                        texture = pendingTextureSettings.find((texture: Types.TextureDefinition) => {
                                            return texture.Channel === channel;
                                        });
                                    }

                                    let lineInformation = { File: file, Line: getLineNumber(endlinePos) };

                                    if (texture !== undefined) {
                                        texture.Mag = magFilter || texture.Mag;
                                        texture.MagLine = magFilter ? lineInformation : undefined;
                                        texture.Min = minFilter || texture.Min;
                                        texture.MinLine = minFilter ? lineInformation : undefined;
                                        texture.Wrap = wrapMode || texture.Wrap;
                                        texture.WrapLine = wrapMode ? lineInformation : undefined;
                                    }
                                    else {
                                        pendingTextureSettings.push({
                                            Channel: channel,
                                            Mag: magFilter || Types.TextureMagFilter.Linear,
                                            MagLine: magFilter ? lineInformation : undefined,
                                            Min: minFilter || Types.TextureMinFilter.Linear,
                                            MinLine: minFilter ? lineInformation : undefined,
                                            Wrap: wrapMode || Types.TextureWrapMode.Clamp,
                                            WrapLine: wrapMode ? lineInformation : undefined
                                        });
                                    }
                                }
                            }
                        
                            if (input !== undefined && channel !== undefined) {
                                // Load the dependency
                                loadDependency(input, channel, nextMatch.PassType, endlinePos);
                            }
                        }
                    }

                    // Remove #iChannel define
                    let channelDefine = code.substring(nextMatch.TexturePos, endlinePos - 1);
                    code = code.replace(channelDefine, '');
                }
            }
        }
        else {
            if (this.context.getConfig<boolean>('omitDeprecationWarnings') === false) {
                vscode.window.showWarningMessage('Loading textures through configuration is deprecated and will be removed in a future version. Please use inline texture definitions.');
            }
            let textures: any[] | undefined = this.context.getConfig('textures');
            if (textures) {
                for (let i in textures) {
                    const texture: any = textures[i];
                    if (texture.length > 0) {
                        // Check for buffer to load to avoid circular loading
                        if (this.stripPath(texture) !== this.stripPath(file)) {
                            loadDependency(texture, parseInt(i), 'iChannel', 0);
                        }
                    }
                }
            }
        }

        {
            let versionPos = code.search(/^#version/g);
            if (versionPos === 0) {
                let newLinePos = code.search('\n');
                let versionDirective = code.substring(versionPos, newLinePos - 1);
                code = code.replace(versionDirective, '');

                showDiagnosticAtPosition(`Version directive '${versionDirective}' ignored by shader-toy extension`, 0);
            }
        }

        // If there is no void main() in the shader we assume it is a shader-toy style shader
        let mainPos = code.search(/void\s+main\s*\(\s*\)\s*\{/g);
        let mainImagePos = code.search(/void\s+mainImage\s*\(\s*out\s+vec4\s+\w+,\s*(in\s)?\s*vec2\s+\w+\s*\)\s*\{/g);
        if (mainPos === -1 && mainImagePos >= 0) {
            code += `
            void main() {
                mainImage(gl_FragColor, gl_FragCoord.xy);
            }
            `;
        }

        // Assign pending texture settings
        for (let texture of textures) {
            let pendingSettings = pendingTextureSettings.find((pendingSettings: Types.TextureDefinition) => {
                return pendingSettings.Channel === texture.Channel;
            });
            if (pendingSettings !== undefined) {
                texture.Mag = pendingSettings.Mag || texture.Mag;
                texture.MagLine = pendingSettings.MagLine || texture.MagLine;
                texture.Min = pendingSettings.Min || texture.Min;
                texture.MinLine = pendingSettings.MinLine || texture.MinLine;
                texture.Wrap = pendingSettings.Wrap || texture.Wrap;
                texture.WrapLine = pendingSettings.WrapLine || texture.WrapLine;
            }
        }

        // Check if defined textures are used in shader
        let definedTextures: any = {};
        for (let texture of textures) {
            definedTextures[texture.Channel] = true;
        }
        for (let audio of audios) {
            definedTextures[audio.Channel] = true;
        }
        if (this.context.getConfig<boolean>('warnOnUndefinedTextures')) {
            for (let i = 0; i < 9; i++) {
                if (code.search('iChannel' + i) > 0) {
                    if (definedTextures[i] === undefined) {
                        if (useTextureDefinitionInShaders) {
                            vscode.window.showWarningMessage(`iChannel${i} in use but there is no definition #iChannel${i} in shader`, 'Details')
                                .then(() => {
                                    vscode.window.showInformationMessage(`To use this channel add to your shader a line '#iChannel${i}' followed by a space and the path to your texture. Use 'file://' for local textures, 'https://' for remote textures or 'buf://' for other shaders.`);
                                });
                        }
                        else {
                            vscode.window.showWarningMessage(`iChannel${i} in use but there is no definition '${i}' in settings.json`, 'Details')
                                .then(() => {
                                    vscode.window.showInformationMessage(`To use this channel you will need to open your 'settings.json' file and set the option 'shader-toy.textures.${i}' to the path to your texture. Use 'file://' for local textures, 'https://' for remote textures or 'buf://' for other shaders. It is advised to set the option 'shader-toy.textures.useInShaderTextures' to true and define your texture path directly inside your shader.`);
                                });
                        }
                    }
                }
            }
        }

        if (this.context.getConfig<boolean>('enableGlslifySupport')) {
            // glslify the code
            var glsl = require('glslify');
            try {
                code = glsl(code);
            }
            catch(e) {
                vscode.window.showErrorMessage(e.message);
            }
        }

        // Push yourself after all your dependencies
        buffers.push({
            Name: this.stripPath(file),
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
            LineOffset: line_offset
        });
    }

    private parseUniformCode(line: string, informationDiagnostic: (message: string) => void): Types.UniformDefinition | undefined {
        let uniformName = "(missing_uniform_name)";
        let defaultValue: number[] | undefined;
        let range: [ number[], number[] ] | undefined;

        // TODO: Verify types given, instead of just stripping float, vec2, vec3 and vec4

        let inPos = line.indexOf(' in ');
        if (inPos >= 0) {
            let rangeString = line.substring(inPos + 4).trim()
                .replace(/\(/g, '[')
                .replace(/\)/g, ']')
                .replace(/float/g, '')
                .replace(/vec2/g, '')
                .replace(/vec3/g, '')
                .replace(/vec4/g, '');
            let rangeDirect: [ number | number[], number | number[] ] = JSON.parse(`{"value": ${rangeString}}`).value;
            range = [[], []];
            for (let i of [ 0, 1 ]) {
                let value = rangeDirect[i];
                if (Array.isArray(value)) {
                    range[i] = value;
                }
                else {
                    range[i] = [ value ];
                }
            }

            line = line.substring(0, inPos).trim();
        }
        
        let equalPos = line.indexOf('=');
        if (equalPos >= 0) {
            uniformName = line.substring(0, equalPos).trim();
            let defaultValueString = line.substring(equalPos + 1).trim()
                .replace(/\(/g, '[')
                .replace(/\)/g, ']')
                .replace(/float/g, '')
                .replace(/vec2/g, '')
                .replace(/vec3/g, '')
                .replace(/vec4/g, '');
            if (defaultValueString.indexOf('[') < 0) {
                defaultValueString = '[' + defaultValueString + ']';
            }

            defaultValue = JSON.parse(`{"value": ${defaultValueString}}`).value;
        }
        else {
            uniformName = line.trim();
        }

        if (defaultValue !== undefined && range !== undefined) {
            for (let i of [ 0, 1 ]) {
                let value = range[i];
                if (value.length !== defaultValue.length) {
                    if (value.length !== 1) {
                        let mismatchType = value.length < defaultValue.length ?
                            'missing values will be replaced with first value given' :
                            'redundant values will be removed';
                        let valueType = i === 0 ? 'minimum' : 'maximum';
                        informationDiagnostic(`Type mismatch in ${valueType} value, ${mismatchType}.`);
                    }
                }
            }
        }

        if (defaultValue === undefined && range !== undefined) {
            defaultValue = range[0];
            informationDiagnostic(`Custom uniform specifies no default value, the minimum of its range will be used.`);
        }

        if (defaultValue !== undefined || range !== undefined) {
            return {
                Name: uniformName,
                Default: defaultValue !== undefined ? defaultValue : range !== undefined ? range[0] : [ NaN ],
                Min: range !== undefined ? range[0] : undefined,
                Max: range !== undefined ? range[1] : undefined,
            };
        }
        else {
            informationDiagnostic(`Custom uniform specifies neither a default value nor a range, it's type can thus not be deduced.`);
        }

        return undefined;
    }
}
