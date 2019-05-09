'use strict';

import * as vscode from 'vscode';
import * as mime from 'mime';
import * as fs from 'fs';
import * as path from 'path';
import * as types from'./typenames';
import { Context } from './context';

export class ShaderParser {
    private context: Context;
    
    constructor(context: Context) {
        this.context = context;
    }

    private readShaderFile(file: string): { success: boolean, error: any, bufferCode: string } {
        // Read the whole file of the shader
        let success = false;
        let bufferCode = "";
        let error = null;
        try {
            bufferCode = fs.readFileSync(file, "utf-8");
            success = true;
        }
        catch (e) {
            error = e;
        }

        return { success, error, bufferCode };
    }

    public parseShaderCode(name: string, code: string, buffers: types.BufferDefinition[], commonIncludes: types.IncludeDefinition[]) {
        const stripPath = (name: string) => {
            let lastSlash = name.lastIndexOf('/');
            return name.substring(lastSlash + 1);
        };
        const findByName = (bufferName: string) => {
            let strippedName = stripPath(bufferName);
            return (value: any) => {
                if (value.Name === strippedName) {
                    return true;
                }
                return false;
            };
        };

        const found = buffers.find(findByName(name));
        if (found) {
            return;
        }

        let line_offset = 127;
        let textures: types.TextureDefinition[] = [];
        let audios: types.AudioDefinition[] = [];
        let includeName: string | undefined;

        const loadDependency = (file: string, channel: number, passType: string) => {
            // Get type and name of file
            let colonPos = file.indexOf('://', 0);
            
            let inputType = "file";
            let userPath = file;

            if (colonPos >= 0) {
                inputType = file.substring(0, colonPos);
                userPath = file.substring(colonPos + 3, file.length);
            }

            // Fix path to use '/' over '\\' and relative to the current working directory
            file = ((file: string) => {
                const relFile = vscode.workspace.asRelativePath(file);
                const herePos = relFile.indexOf("./");
                if (vscode.workspace.rootPath === undefined && herePos === 0) {
                    vscode.window.showErrorMessage("To use relative paths please open a workspace!");
                }
                if (relFile !== file || herePos === 0) {
                    return vscode.workspace.rootPath + '/' + relFile;
                }
                else {
                    return file;
                }
            })(userPath);
            file = file.replace(/\\/g, '/');
            file = file.replace(/\.\//g, '');
            userPath = userPath.replace(/\\/g, '/');

            if (inputType !== "file" && inputType !== "https") {
                if (this.context.getConfig<boolean>("omitDeprecationWarnings") === true) {
                    if (passType === "include") {
                        vscode.window.showWarningMessage("You are using deprecated input methods, no protocol is required for includes, simply use '#include \"./file.glsl\"'");
                    }
                    else {
                        vscode.window.showWarningMessage("You are using deprecated input methods, use 'file://' or 'https://', the type of input will be inferred.");
                    }
                }
                inputType = "file";
            }

            let isLocalFile: boolean = inputType === "file";
            let fileType = file.split('.').pop();
            let fullMime = mime.getType(fileType || "txt") || "text/plain";
            let mimeType = fullMime.split('/')[0] || "text";

            if (passType === "include") {
                const name = path.basename(file);

                // Attempt to get the include if already exists
                let include = commonIncludes.find(include => include.File === file);
                if (include === undefined) {
                    // Read the whole file of the shader
                    const shaderFile = this.readShaderFile(file);
                    if(shaderFile.success === false){
                        vscode.window.showErrorMessage(`Could not open file: ${userPath}`);
                        return;
                    }

                    include = {
                        Name: name,
                        File: file,
                        Code: shaderFile.bufferCode,
                        LineCount: shaderFile.bufferCode.split(/\r\n|\n/).length
                    };

                    commonIncludes.push(include);
                }

                // offset the include line count
                line_offset += include.LineCount - 1;

                // store the reference name for this include
                includeName = name;
            }
            else {
                switch (mimeType) {
                    case "text": {
                        if (file === "self") {
                            // Push self as feedback-buffer
                            textures.push({
                                Channel: channel,
                                Self: true
                            });
                        }
                        else {
                            // Read the whole file of the shader
                            const shaderFile = this.readShaderFile(file);
                            if(shaderFile.success === false){
                                vscode.window.showErrorMessage(`Could not open file: ${userPath}`);
                                return;
                            }
        
                            // Parse the shader
                            this.parseShaderCode(file, shaderFile.bufferCode, buffers, commonIncludes);
                
                            // Push buffers as textures
                            textures.push({
                                Channel: channel,
                                Buffer: stripPath(file),
                            });
                        }
                        break;
                    }
                    case "image": {
                        if (isLocalFile) {
                            textures.push({
                                Channel: channel,
                                LocalTexture: file,
                            });
                        }
                        else {
                            textures.push({
                                Channel: channel,
                                RemoteTexture: file,
                            });
                        }
                        break;
                    }
                    case "audio": {
                        if (isLocalFile) {
                            audios.push({
                                Channel: channel,
                                LocalPath: file,
                                UserPath: userPath
                            });
                        }
                        else {
                            audios.push({
                                Channel: channel,
                                RemotePath: file,
                                UserPath: userPath
                            });
                        }
                        break;
                    }
                    default: {
                        vscode.window.showWarningMessage(`You are trying to use an unsupported file ${file}`);
                    }
                }
            }
        };

        let usesKeyboard = false;
        let useTextureDefinitionInShaders = this.context.getConfig<boolean>('useInShaderTextures');
        if (useTextureDefinitionInShaders) {
            // Find all #iChannel defines, which define textures and other shaders
            type Match = {
                TexturePos: number;
                MatchLength : number;
                PassType: string;
            };

            const findNextMatch = (): Match | undefined => {
                let channelMatch = code.match(/^\s*#(iChannel|include|iKeyboard)/m);
                if (channelMatch && channelMatch.index !== undefined && channelMatch.index >= 0) {
                    return {
                        TexturePos: channelMatch.index,
                        MatchLength: channelMatch[0].length,
                        PassType: channelMatch[1] || '',
                    };
                }
                return undefined;
            };
            let nextMatch = findNextMatch();
            while (nextMatch) {
                let channelPos = nextMatch.TexturePos + nextMatch.MatchLength;
                let endline = code.substring(channelPos).match(/\r\n|\r|\n/);
                if (endline !== null && endline.index !== undefined) {
                    endline.index += channelPos;

                    if (nextMatch.PassType === "iKeyboard") {
                        usesKeyboard = true;
                    }
                    else {
                        let line = code.substring(channelPos, endline.index);

                        let leftQuotePos = line.search(/"|'/);
                        let rightQuotePos = line.substring(leftQuotePos + 1).search(/"|'/) + leftQuotePos + 1;

                        let channel: number;
                        let input: string;

                        if (leftQuotePos < 0 || rightQuotePos < 0) {
                            if (this.context.getConfig<boolean>("omitDeprecationWarnings") === true) {
                                vscode.window.showWarningMessage("To use input, wrap the path/url of your input in quotes, omitting quotes is deprecated behaviour.");
                            }

                            let spacePos = Math.min(code.indexOf(" ", channelPos), endline.index);
    
                            // Get channel number
                            channel = parseInt(code.substring(channelPos, spacePos));
    
                            let afterSpacePos = code.indexOf(" ", spacePos + 1);
                            let afterCommentPos = code.indexOf("//", code.indexOf("://", spacePos)  + 3);
                            let textureEndPos = Math.min(endline.index,
                                afterSpacePos > 0 ? afterSpacePos : code.length,
                                afterCommentPos > 0 ? afterCommentPos : code.length);

                            // Get dependencies' name
                            input = code.substring(spacePos + 1, textureEndPos);
                        }
                        else {
                            channel = parseInt(line.substring(0, leftQuotePos).trim());
                            input = line.substring(leftQuotePos + 1, rightQuotePos).trim();
                        }
                        
                        // Load the dependency
                        loadDependency(input, channel, nextMatch.PassType);
                    }

                    // Remove #iChannel define
                    code = code.replace(code.substring(nextMatch.TexturePos, endline.index + endline[0].length), "");
                    nextMatch = findNextMatch();
                    line_offset--;
                }
            }
        }
        else {
            if (this.context.getConfig<boolean>("omitDeprecationWarnings") === true) {
                vscode.window.showWarningMessage("Loading textures through configuration is deprecated and will be removed in a future version. Please use inline texture definitions.");
            }
            let textures: any[] | undefined = this.context.getConfig('textures');
            if (textures) {
                for (let i in textures) {
                    const texture: any = textures[i];
                    if (texture.length > 0) {
                        // Check for buffer to load to avoid circular loading
                        if (stripPath(texture) !== stripPath(name)) {
                            loadDependency(texture, parseInt(i), "iChannel");
                        }
                    }
                }
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

        let definedTextures: any = {};
        for (let texture of textures) {
            definedTextures[texture.Channel] = true;
        }
        if (this.context.getConfig<boolean>('warnOnUndefinedTextures')) {
            for (let i = 0; i < 9; i++) {
                if (code.search("iChannel" + i) > 0) {
                    if (definedTextures[i] === null) {
                        if (useTextureDefinitionInShaders) {
                            vscode.window.showWarningMessage(`iChannel${i} in use but there is no definition #iChannel${i} in shader`, "Details")
                                .then(() => {
                                    vscode.window.showInformationMessage(`To use this channel add to your shader a line "#iChannel${i}" followed by a space and the path to your texture. Use "file://" for local textures, "https://" for remote textures or "buf://" for other shaders.`);
                                });
                        }
                        else {
                            vscode.window.showWarningMessage(`iChannel${i} in use but there is no definition "${i}" in settings.json`, "Details")
                                .then(() => {
                                    vscode.window.showInformationMessage(`To use this channel you will need to open your "settings.json" file and set the option "shader-toy.textures.${i}" to the path to your texture. Use "file://" for local textures, "https://" for remote textures or "buf://" for other shaders. It is advised to set the option "shader-toy.textures.useInShaderTextures" to true and define your texture path directly inside your shader.`);
                                });
                        }
                    }
                }
            }
        }

        // Translate buffer names to indices
        let usesSelf = false;
        let selfChannel = 0;
        for (let i = 0; i < textures.length; i++) {
            let texture = textures[i];
            if (texture.Buffer) {
                texture.BufferIndex = buffers.findIndex(findByName(texture.Buffer));
                let dependencyBuffer = buffers[texture.BufferIndex];
                if (dependencyBuffer.UsesSelf) {
                    dependencyBuffer.Dependents.push({
                        Index: buffers.length,
                        Channel: texture.Channel
                    });
                }
            }
            else if (texture.Self) {
                texture.Buffer = stripPath(name);
                texture.BufferIndex = buffers.length;
                usesSelf = true;
                selfChannel = i;
            }
        }

        // Push yourself after all your dependencies
        buffers.push({
            Name: stripPath(name),
            File: name,
            Code: code,
            IncludeName: includeName,
            TextureInputs: textures,
            AudioInputs: audios,
            UsesSelf: usesSelf,
            SelfChannel: selfChannel,
            Dependents: [],
            UsesKeyboard: usesKeyboard,
            LineOffset: line_offset
        });
    }
}
