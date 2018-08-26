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

    vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
        clearTimeout(_timeout);
        _timeout = setTimeout( function() { 
            if(vscode.window.activeTextEditor && e && e.document === vscode.window.activeTextEditor.document) {
                provider.update(previewUri);
            }
        }, 1000);
    });
    if (config.get('reloadOnChangeEditor', false)) {
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
        return this._context.asAbsolutePath(path.join('resources', mediaFile));
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
                target = "new THREE.WebGLRenderTarget(canvas.clientWidth, canvas.clientHeight)";
            
            buffersScripts += `
            buffers.push({
                Name: "${buffer.Name}",
                File: "${buffer.File}",
                LineOffset: "${buffer.LineOffset}",
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
                    value = `THREE.ImageUtils.loadTexture('file://${texturePath}')`;
                else
                    value = `THREE.ImageUtils.loadTexture('https://${textureUrl}')`;
                textureScripts += `buffers[${i}].Shader.uniforms.iChannel${channel} = { type: 't', value: ${value} };\n`;
            }
        }

        let frameTimeScript = "";
        if (config.get('printShaderFrameTime', false)) {
            // TODO: Make stats.js use a local copy instead of remote, right now it won't work without internet connection
            frameTimeScript = `
            (function() {
                var script = document.createElement('script')
                script.onload = function() {
                    var stats = new Stats();
                    stats.showPanel(1);
                    document.body.appendChild(stats.dom);
                    requestAnimationFrame(function loop() {
                        stats.update();
                        requestAnimationFrame(loop);
                    });
                };
                script.src = 'https://rawgit.com/mrdoob/stats.js/master/build/stats.min.js';
                document.head.appendChild(script);
            }());\n`;
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
                </style>
            </head>
            <body>
                <div id="message"></div>
                <div id="container"></div>

            </body>
            <script src="file://${this.getResourcePath('jquery.min.js')}"></script>
            <script src="file://${this.getResourcePath('three.min.js')}"></script>
            <canvas id="canvas"></canvas>

            ${shaderScripts}

            <script type="text/javascript">
                ${frameTimeScript}

                var currentShader = {};
                (function(){
                    console.error = function (message) {
                        if('7' in arguments) {
                            $("#message").append('<h3>Shader failed to compile - ' + currentShader.Name + '</h3><ul>')
                            $("#message").append(arguments[7].replace(/ERROR: \\d+:(\\d+)/g, function(m, c) {
                                return '<li><a class="error" unselectable href="'+ encodeURI('command:shader-toy.onGlslError?' + JSON.stringify([Number(c) - currentShader.LineOffset, currentShader.File])) + '">Line ' + String(Number(c) - currentShader.LineOffset) + '</a>';
                            }));
                            $("#message").append('</ul>');
                        }
                    };
                })();

                var canvas = document.getElementById('canvas');
                var renderer = new THREE.WebGLRenderer({canvas: canvas, antialias: true});
                var clock = new THREE.Clock();
                var resolution = new THREE.Vector3(canvas.clientWidth, canvas.clientHeight, 1.0);
                var mouse = new THREE.Vector4(0, 0, 0, 0);
                var frameCounter = 0;

                var channelResolution = new THREE.Vector3(128.0, 128.0, 0.0);

                var buffers = [];
                ${buffersScripts}
                
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
                    var deltaTime = clock.getDelta();
                    var time = clock.getElapsedTime();
                    
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
        // console.log(content);
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
                var fs = require("fs");
                let bufferCode = fs.readFileSync(file, "utf-8");
    
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

        if (config.get('useInShaderTextures', false)) {
            // Find all #iChannel defines, which define textures and other shaders
            var texturePos = code.indexOf("#iChannel", 0);
            while (texturePos >= 0) {
                // Get channel number
                var channelPos = texturePos + 9;
                var spacePos = code.indexOf(" ", 0);
                var channel = parseInt(code.substring(channelPos, spacePos));
                var endlinePos = code.indexOf("\n", texturePos);

                // Get dependencies' name
                let texture = code.substr(channelPos + 2, endlinePos - channelPos - 3);
                
                // Load the dependency
                loadDependency(texture, channel);

                // Remove #iChannel define
                code = code.replace(code.substring(texturePos, endlinePos + 1), "");
                texturePos = code.indexOf("#iChannel", texturePos);
                line_offset--;
            }
        }
        else { // TODO: Ideally depracate this because it is counter-productive when working dependent shaders
            let textures = config.get('textures', {});
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