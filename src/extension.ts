'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';

export function activate(context: ExtensionContext) {
    let previewUri = Uri.parse('glsl-preview://authority/glsl-preview');
    let provider = new GLSLDocumentContentProvider(context);
    let registration = vscode.workspace.registerTextDocumentContentProvider('glsl-preview', provider);
    const config = vscode.workspace.getConfiguration('shader-toy');
    var _timeout: number;
    var editor = vscode.window.activeTextEditor;

    if (config.get<boolean>('reloadOnEditText')) {
        vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
            clearTimeout(_timeout);
            _timeout = setTimeout( function() { 
                if(vscode.window.activeTextEditor && e && e.document === vscode.window.activeTextEditor.document) {
                    provider.update(previewUri);
                }
            }, config.get<number>('reloadOnEditTextDelay') * 1000);
        });
    }
    if (config.get<boolean>('reloadOnChangeEditor')) {
        vscode.window.onDidChangeActiveTextEditor((e: vscode.TextEditor) => {
            if(e && e.document === e.document) {
                provider.update(previewUri);
                editor = e;
            }
        });
    }

    let previewCommand = vscode.commands.registerCommand('shader-toy.showGlslPreview', () => {
        return vscode.commands.executeCommand('vscode.previewHtml', previewUri, ViewColumn.Two, 'GLSL Preview')
        .then((success) => {}, (reason) => { vscode.window.showErrorMessage(reason); });
    });
    let errorCommand = vscode.commands.registerCommand('shader-toy.onGlslError', (line: number, file: string) => {
        var highlightLine = (document: vscode.TextDocument, line: number) => {
            let range = document.lineAt(line - 1).range;
            vscode.window.showTextDocument(document, vscode.ViewColumn.One, true);
            editor.selection = new vscode.Selection(range.start, range.end);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        };

        if (editor) {
            var currentFile = editor.document.fileName;
            currentFile = currentFile.replace(/\\/g, '/');
            if (currentFile == file) {
                highlightLine(editor.document, line);
                return;
            }
        }

        var newDocument = vscode.workspace.openTextDocument(file);
        newDocument.then((document: vscode.TextDocument) => {
            highlightLine(document, line);
        }, (reason) => {
            vscode.window.showErrorMessage(`Could not open ${file} because ${reason}`);
        });
    });
    
    context.subscriptions.push(previewCommand, registration);
    context.subscriptions.push(errorCommand);
}
export function deactivate() {
}


class GLSLDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
    private _context: ExtensionContext;

    constructor(context: ExtensionContext) {
        this._context = context;
    }

    private getResourcePath(mediaFile) : string {
        var resourcePath = this._context.asAbsolutePath(path.join('resources', mediaFile));
        resourcePath = resourcePath.replace(/\\/g, '/');
        return resourcePath;
    }
    
    public provideTextDocumentContent(uri: Uri): string {
        let activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage("Select a TextEditor to show GLSL Preview.");
            return "";
        }
        
        let shader = activeEditor.document.getText();
        let shaderName = activeEditor.document.fileName;
        const config = vscode.workspace.getConfiguration('shader-toy');

        let shaderPreamble = `
        uniform vec3        iResolution;
        uniform float       iGlobalTime;
        uniform float       iTime;
        uniform float       iTimeDelta;
        uniform int         iFrame;
        uniform float       iChannelTime[4];
        uniform vec3        iChannelResolution[4];
        uniform vec4        iMouse;
        uniform sampler2D   iChannel0;
        uniform sampler2D   iChannel1;
        uniform sampler2D   iChannel2;
        uniform sampler2D   iChannel3;
        uniform sampler2D   iChannel4;
        uniform sampler2D   iChannel5;
        uniform sampler2D   iChannel6;
        uniform sampler2D   iChannel7;
        uniform sampler2D   iChannel8;
        uniform sampler2D   iChannel9;

        #define SHADER_TOY`

        shaderName = shaderName.replace(/\\/g, '/');
        var buffers = this.parseShaderCode(shaderName, shader);
        const numShaders = buffers.length;

        // Write all the shaders
        var shaderScripts = "";
        var buffersScripts = "";
        for (let i in buffers) {
            const buffer = buffers[i];
            shaderScripts += `
            <script id="${buffer.Name}" type="x-shader/x-fragment">
                ${shaderPreamble}
                ${buffer.Code}
            </script>`

            // Create a RenderTarget for all but the final buffer
            var target = "null";
            if (buffer != buffers[numShaders - 1])
                target = "new THREE.WebGLRenderTarget(canvas.clientWidth, canvas.clientHeight, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: framebufferType })";
            
            buffersScripts += `
            buffers.push({
                Name: "${buffer.Name}",
                File: "${buffer.File}",
                LineOffset: ${buffer.LineOffset},
                Target: ${target},
                Shader: new THREE.ShaderMaterial({
                    fragmentShader: document.getElementById('${buffer.Name}').textContent,
                    depthWrite: false,
                    depthTest: false,
                    uniforms: {
                        iResolution: { type: "v3", value: resolution },
                        iGlobalTime: { type: "f", value: 0.0 },
                        iTime: { type: "f", value: 0.0 },
                        iTimeDelta: { type: "f", value: 0.0 },
                        iFrame: { type: "i", value: 0 },
                        iMouse: { type: "v4", value: mouse },
                    }
                })
            });`;
        }

        
        var textureScripts = "\n";
        var textureLoadScript = `function(texture){ texture.minFilter = THREE.LinearFilter; }`;
        for (let i in buffers) {
            const textures =  buffers[i].Textures;
            for (let j in textures) {
                const texture = textures[j];
                const channel = texture.Channel;
                const bufferIndex = texture.Buffer;
                const texturePath = texture.LocalTexture;
                const textureUrl = texture.RemoteTexture;

                var value;
                if (bufferIndex != null)
                    value = `buffers[${bufferIndex}].Target.texture`;
                else if (texturePath != null)
                    value = `texLoader.load('file://${texturePath}', ${textureLoadScript})`;
                else
                    value = `texLoader.load('https://${textureUrl}', ${textureLoadScript})`;
                textureScripts += `buffers[${i}].Shader.uniforms.iChannel${channel} = { type: 't', value: ${value} };\n`;
            }
        }

        var frameTimeScript = "";
        if (config.get<boolean>('printShaderFrameTime')) {
            frameTimeScript = `
            <script src="file://${this.getResourcePath('stats.min.js')}" onload="
                var stats = new Stats();
                stats.showPanel(1);
                document.body.appendChild(stats.dom);
                requestAnimationFrame(function loop() {
                    stats.update();
                    requestAnimationFrame(loop);
                });
            "></script>`;
        }

        var pauseButtonScript = "";
        if (config.get<boolean>('showPauseButton')) {
            pauseButtonScript = `
            <label class="button-container">
                <input id="pause-button" type="checkbox">
                <span class="pause-play"></span>
            </div>`;
        }

        var pauseWholeScript = "";
        var advanceTimeScript = `
        deltaTime = clock.getDelta();
        time = clock.getElapsedTime() - pausedTime;`;
        if (config.get<boolean>('pauseWholeRender')) {
            pauseWholeScript = `if (paused) return;`;
        }
        else {
            advanceTimeScript = `
            if (paused == false) {
                deltaTime = clock.getDelta();
                time = clock.getElapsedTime() - pausedTime;
            }`;
        }

        // http://threejs.org/docs/api/renderers/webgl/WebGLProgram.html
        const content = `
            <head>
                <style>
                    html, body, #canvas {
                        margin: 0;
                        padding: 0;
                        width: 100%;
                        height: 100%;
                        display: block;
                    }
                    
                    .error {
                        font-family: Consolas;
                        font-size: 1.2em;
                        color: black;
                        box-sizing: border-box;
                        background-color: lightcoral;
                        border-radius: 2px;
                        border-color: lightblue;
                        border-width: thin;
                        border-style: solid;
                        line-height: 1.4em;
                    }
                    .error:hover {
                        color: black;
                        background-color: brown;
                        border-color: blue;
                    }
                    #message {
                        font-family: Consolas;
                        font-size: 1.2em;
                        color: #ccc;
                        background-color: black;
                        font-weight: bold;
                        z-index: 2;
                        position: absolute;
                    }
                    
                    /* Container for pause button */
                    .button-container, .container {
                        text-align: center;
                        position: absolute;
                        bottom: 0;
                        width: 100%;
                        height: 80px;
                        margin: auto;
                    }
                    /* Hide the browser's default checkbox */
                    .button-container input {
                        position: absolute;
                        opacity: 0;
                        cursor: pointer;
                    }
            
                    /* Custom checkmark style */
                    .pause-play {
                        position: absolute;
                        border: none;
                        padding: 30px;
                        text-align: center;
                        text-decoration: none;
                        font-size: 16px;
                        border-radius: 8px;
                        margin: auto;
                        transform: translateX(-50%);
                        background: url("file://${this.getResourcePath('pause.png')}");
                        background-size: 40px;
                        background-repeat: no-repeat;
                        background-position: center;
                        background-color: rgba(128, 128, 128, 0.5);
                    }
                    .button-container:hover input ~ .pause-play {
                        background-color: lightgray;
                        transition-duration: 0.2s;
                    }
                    .button-container:hover input:checked ~ .pause-play {
                        background-color: lightgray;
                        transition-duration: 0.2s;
                    }
                    .button-container input:checked ~ .pause-play {
                        background: url("file://${this.getResourcePath('play.png')}");
                        background-size: 40px;
                        background-repeat: no-repeat;
                        background-position: center;
                        background-color: rgba(128, 128, 128, 0.5);
                    }
                </style>
            </head>
            <body>
                <div id="message"></div>
                <div id="container">
                    ${pauseButtonScript}
                </div>
            </body>
            <script src="file://${this.getResourcePath('jquery.min.js')}"></script>
            <script src="file://${this.getResourcePath('three.min.js')}"></script>
            ${frameTimeScript}
            <canvas id="canvas"></canvas>

            ${shaderScripts}

            <script type="text/javascript">
                var currentShader = {};
                (function(){
                    console.error = function (message) {
                        if('7' in arguments) {
                            $("#message").append('<h3>Shader failed to compile - ' + currentShader.Name + '</h3><ul>');
                            $("#message").append(arguments[7].replace(/ERROR: \\d+:(\\d+)/g, function(m, c) {
                                return '<li><a class="error" unselectable href="'+ encodeURI('command:shader-toy.onGlslError?' + JSON.stringify([Number(c) - currentShader.LineOffset, currentShader.File])) + '">Line ' + String(Number(c) - currentShader.LineOffset) + '</a>';
                            }));
                            $("#message").append('</ul>');
                        }
                    };
                })();
                // Development feature: Output warnings from third-party libraries
                // (function(){
                //     console.warn = function (message) {
                //         $("#message").append(message + '<br>');
                //     };
                // })();

                var clock = new THREE.Clock();
                var pausedTime = 0.0;
                var deltaTime = 0.0;
                var time = 0.0;

                var paused = false;
                var pauseButton = document.getElementById('pause-button');
                pauseButton.onclick = function(){
                    paused = pauseButton.checked;
                    if (!paused)
                        pausedTime += clock.getDelta();
                };

                var canvas = document.getElementById('canvas');
                var gl = canvas.getContext('webgl2');
                var isWebGL2 = gl != null;
                if (gl == null) gl = canvas.getContext('webgl');
                var supportsFloatFramebuffer = (gl.getExtension('EXT_color_buffer_float') != null) || (gl.getExtension('WEBGL_color_buffer_float') != null);
                var supportsHalfFloatFramebuffer = (gl.getExtension('EXT_color_buffer_half_float') != null);
                var framebufferType = THREE.UnsignedByteType;
                if (supportsFloatFramebuffer) framebufferType = THREE.FloatType;
                else if (supportsHalfFloatFramebuffer) framebufferType = THREE.HalfFloatType;

                var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, context: gl });
                var resolution = new THREE.Vector3(canvas.clientWidth, canvas.clientHeight, 1.0);
                var mouse = new THREE.Vector4(0, 0, 0, 0);
                var frameCounter = 0;

                var channelResolution = new THREE.Vector3(128.0, 128.0, 0.0);

                var buffers = [];
                ${buffersScripts}

                // WebGL2 inserts more lines into the shader
                if (isWebGL2) {
                    for (let i in buffers) {
                        buffers[i].LineOffset += 16;
                    }
                }
                
                var texLoader = new THREE.TextureLoader();
                ${textureScripts}
                
                var scene = new THREE.Scene();
                var quad = new THREE.Mesh(
                    new THREE.PlaneGeometry(resolution.x, resolution.y),
                    null
                );
                scene.add(quad);
                
                var camera = new THREE.OrthographicCamera(-resolution.x / 2.0, resolution.x / 2.0, resolution.y / 2.0, -resolution.y / 2.0, 1, 1000);
                camera.position.set(0, 0, 10);

                // Run every shader once to check for compile errors
                for (let i in buffers) {
                    let buffer = buffers[i];
                    currentShader = {
                        Name: buffer.Name,
                        File: buffer.File,
                        LineOffset: buffer.LineOffset
                    };
                    quad.material = buffer.Shader;
                    renderer.render(scene, camera, buffer.Target);
                }
                currentShader = {};

                render();

                function render() {
                    requestAnimationFrame(render);
                    ${pauseWholeScript}
            
                    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
                        resolution.x = canvas.clientWidth;
                        resolution.y = canvas.clientHeight;
                        for (let i in buffers) {
                            if (buffers[i].Target) {
                                buffers[i].Target.setSize(resolution.x, resolution.y);
                            }
                        }
                        renderer.setSize(resolution.x, resolution.y, false);
                        
                        // Update Camera and Mesh
                        quad.geometry = new THREE.PlaneGeometry(resolution.x, resolution.y);
                        camera.left = -resolution.x / 2.0;
                        camera.right = resolution.x / 2.0;
                        camera.top = resolution.y / 2.0;
                        camera.bottom = -resolution.y / 2.0;
                        camera.updateProjectionMatrix();
                    }
                    
                    frameCounter++;
                    ${advanceTimeScript}

                    for (let i in buffers) {
                        let buffer = buffers[i];
                        buffer.Shader.uniforms['iResolution'].value = resolution;
                        buffer.Shader.uniforms['iTimeDelta'].value = deltaTime;
                        buffer.Shader.uniforms['iGlobalTime'].value = time;
                        buffer.Shader.uniforms['iTime'].value = time;
                        buffer.Shader.uniforms['iFrame'].value = frameCounter;
                        buffer.Shader.uniforms['iMouse'].value = mouse;

                        quad.material = buffer.Shader;
                        renderer.render(scene, camera, buffer.Target);
                    }
                }
                canvas.addEventListener('mousemove', function(evt) {
                    if (mouse.z + mouse.w != 0) {
                        var rect = canvas.getBoundingClientRect();
                        mouse.x = evt.clientX - rect.left;
                        mouse.y = resolution.y - evt.clientY - rect.top;
                    } 
                }, false);
                canvas.addEventListener('mousedown', function(evt) {
                    if (evt.button == 0)
                        mouse.z = 1;
                    if (evt.button == 2)
                        mouse.w = 1;
                }, false);
                canvas.addEventListener('mouseup', function(evt) {
                    if (evt.button == 0)
                        mouse.z = 0;
                    if (evt.button == 2)
                        mouse.w = 0;
                }, false);
            </script>
        `;
        console.log(content);
        return content;
    }

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    public update(uri: Uri) {
        this._onDidChange.fire(uri);
    }

    parseShaderCode(name: string, code: string) {
        const config = vscode.workspace.getConfiguration('shader-toy');

        var bufferDependencies = [];

        var line_offset = 121;
        var textures = [];

        const loadDependency = (file: string, channel: number) => {
            // Get type and name of file
            var colonPos = file.indexOf('://', 0);
            let textureType = file.substring(0, colonPos);

            // Fix path to use '/' over '\\' and relative to the current working directory
            file = file.substring(colonPos + 3, file.length);
            const origFile = file;
            file = ((file: string) => {
                const relFile = vscode.workspace.asRelativePath(file);
                const herePos = relFile.indexOf("./");
                if (vscode.workspace.rootPath == null && herePos == 0) vscode.window.showErrorMessage("To use relative paths please open a workspace!");
                if (relFile != file || herePos == 0) return vscode.workspace.rootPath + '/' + relFile;
                else return file;
            })(file);
            file = file.replace(/\\/g, '/');
            file = file.replace(/\.\//g, "");

            if (textureType == "buf") {
                // TODO: Allow using _self_ as a buffer, this will require some more refactoring though

                // Read the whole file of the shader
                let bufferCode = "";
                var fs = require("fs");
                try {
                    bufferCode = fs.readFileSync(file, "utf-8");
                }
                catch (error) {
                    vscode.window.showErrorMessage(`Could not open file: ${origFile}`);
                    return [];
                }

                // Parse the shader
                var currentNumBuffers = bufferDependencies.length;
                var buffers = this.parseShaderCode(file, bufferCode);
    
                // Push new buffers
                for (let i in buffers) {
                    let buffer = buffers[i];
                    // Offset depending buffers by currently used amount of buffers
                    if (buffer.Buffer) {
                        buffer.Buffer += currentNumBuffers;
                    }
                    bufferDependencies.push(buffer);
                }
                // Push buffers as textures
                textures.push({
                    Channel: channel,
                    Buffer: bufferDependencies.length - 1,
                    LocalTexture: null,
                    RemoteTexture: null
                });
            }
            else if (textureType == "file") {
                // Push texture
                textures.push({
                    Channel: channel,
                    Buffer: null,
                    LocalTexture: file,
                    RemoteTexture: null
                });
            }
            else {
                textures.push({
                    Channel: channel,
                    Buffer: null,
                    LocalTexture: null,
                    RemoteTexture: file
                });
            }
        };

        const stripPath = (name: string) => {
            var lastSlash = name.lastIndexOf('/');
            return name.substring(lastSlash + 1);
        };

        var useTextureDefinitionInShaders = config.get<boolean>('useInShaderTextures');
        if (useTextureDefinitionInShaders) {
            // Find all #iChannel defines, which define textures and other shaders
            var channelMatch, texturePos, matchLength;

            const findNextMatch = () => {
                channelMatch = code.match(/^\s*#iChannel/m);
                texturePos = channelMatch ? channelMatch.index : -1;
                matchLength = channelMatch ? channelMatch[0].length : 0;
            };
            findNextMatch();
            while (texturePos >= 0) {
                // Get channel number
                var channelPos = texturePos + matchLength;
                var spacePos = code.indexOf(" ", texturePos + matchLength);
                var channel = parseInt(code.substring(channelPos, spacePos));
                var endlinePosSize = 2;
                var endlinePos = code.indexOf("\r\n", spacePos + 1);
                if (endlinePos < 0) {
                    endlinePosSize = 1;
                    endlinePos = code.indexOf("\n", spacePos + 1);
                }
                var afterSpacePos = code.indexOf(" ", spacePos + 1);
                var afterCommentPos = code.indexOf("//", code.indexOf("://", spacePos)  + 3);
                var textureEndPos = Math.min(endlinePos,
                    afterSpacePos > 0 ? afterSpacePos : code.length,
                    afterCommentPos > 0 ? afterCommentPos : code.length);

                // Get dependencies' name
                let texture = code.substring(spacePos + 1, textureEndPos);
                
                // Load the dependency
                loadDependency(texture, channel);

                // Remove #iChannel define
                code = code.replace(code.substring(texturePos, endlinePos + endlinePosSize), "");
                findNextMatch();
                line_offset--;
            }
        }
        else { // TODO: Ideally depracate this because it is counter-productive when working dependent shaders
            let textures = config.get('textures');
            for(let i in textures) {
                const texture = textures[i];
                if (textures[i].length > 0) {
                    // Check for buffer to load to avoid circular loading
                    if (stripPath(texture) != stripPath(name)) {
                        loadDependency(texture, parseInt(i));
                    }
                }
            }
        }

        // If there is no void main() in the shader we assume it is a shader-toy style shader
        var mainPos = code.search(/void\s+main\s*\(\s*\)\s*\{/g);
        var mainImagePos = code.search(/void\s+mainImage\s*\(\s*out\s+vec4\s+\w+,\s*in\s+vec2\s+\w+\s*\)\s*\{/g);
        if (mainPos == -1 && mainImagePos >= 0) {
            code += `
            void main() {
                mainImage(gl_FragColor, gl_FragCoord.xy);
            }
            `
        }

        var definedTextures = {};
        for (let i in textures) {
            const texture = textures[i];
            definedTextures[texture.Channel] = true;
        }
        for (let i = 0; i < 9; i++) {
            if (code.search("iChannel" + i) > 0) {
                if (definedTextures[i] == null) {
                    if (useTextureDefinitionInShaders) {
                        vscode.window.showWarningMessage(`iChannel${i} in use but there is no definition #iChannel${i} in shader`, "Details")
                            .then((option: string) => {
                                vscode.window.showInformationMessage(`To use this channel add to your shader a line "#iChannel${i}" followed by a space and the path to your texture. Use "file://" for local textures, "https://" for remote textures or "buf://" for other shaders.`);
                            });
                    }
                    else {
                        vscode.window.showWarningMessage(`iChannel${i} in use but there is no definition "${i}" in settings.json`, "Details")
                            .then((option: string) => {
                                vscode.window.showInformationMessage(`To use this channel you will need to open your "settings.json" file and set the option "shader-toy.textures.${i}" to the path to your texture. Use "file://" for local textures, "https://" for remote textures or "buf://" for other shaders. It is advised to set the option "shader-toy.textures.useInShaderTextures" to true and define your texture path directly inside your shader.`);
                            });
                    }
                }
            }
        } 

        // Push yourself after all your dependencies
        bufferDependencies.push({
            Name: stripPath(name),
            File: name,
            Code: code,
            Textures: textures,
            LineOffset: line_offset
        });
        
        return bufferDependencies;
    }
}