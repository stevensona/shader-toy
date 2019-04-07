'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    let webviewPanel: vscode.WebviewPanel | undefined = undefined;
    const config = vscode.workspace.getConfiguration('shader-toy');
    let reloadDelay: number = config.get<number>('reloadOnEditTextDelay') || 1.0;
    let timeout: NodeJS.Timeout;
    let activeEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;

    const updateWebview = () => {
        if (webviewPanel !== undefined && activeEditor !== undefined) {
            webviewPanel.webview.html = new WebviewContentProvider(context, activeEditor).generateWebviewConent();
        }
        else if (webviewPanel !== undefined) {
            vscode.window.showErrorMessage("Select a TextEditor to show GLSL Preview.");
        }
    };

    if (config.get<boolean>('reloadOnEditText')) {
        vscode.workspace.onDidChangeTextDocument((changingEditor: vscode.TextDocumentChangeEvent) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => { 
                if (changingEditor !== undefined && activeEditor !== undefined && changingEditor.document === activeEditor.document) {
                    updateWebview();
                }
            }, reloadDelay * 1000);
        });
    }
    if (config.get<boolean>('reloadOnChangeEditor')) {
        vscode.window.onDidChangeActiveTextEditor((swappedEditor: vscode.TextEditor | undefined) => {
            if (swappedEditor !== undefined && swappedEditor.document.lineCount > 0) {
                activeEditor = swappedEditor;
                updateWebview();
            }
        });
    }

    let previewCommand = vscode.commands.registerCommand('shader-toy.showGlslPreview', () => {
        if (webviewPanel) {
            webviewPanel.dispose();
        }
        
        let options: vscode.WebviewOptions = {
            enableScripts: true,
            localResourceRoots: undefined
        };
        webviewPanel = vscode.window.createWebviewPanel(
            'shadertoy',
            'GLSL Preview',
            vscode.ViewColumn.Two,
            options
        );

        updateWebview();
    });
    let errorCommand = vscode.commands.registerCommand('shader-toy.onGlslError', (line: number, file: string) => {
        let highlightLine = (document: vscode.TextDocument, line: number) => {
            let range = document.lineAt(line - 1).range;
            vscode.window.showTextDocument(document, vscode.ViewColumn.One, true);
            if (activeEditor) {
                activeEditor.selection = new vscode.Selection(range.start, range.end);
                activeEditor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            }
        };

        if (activeEditor) {
            let currentFile = activeEditor.document.fileName;
            currentFile = currentFile.replace(/\\/g, '/');
            if (currentFile === file) {
                highlightLine(activeEditor.document, line);
                return;
            }
        }

        let newDocument = vscode.workspace.openTextDocument(file);
        newDocument.then((document: vscode.TextDocument) => {
            highlightLine(document, line);
        }, (reason) => {
            vscode.window.showErrorMessage(`Could not open ${file} because ${reason}`);
        });
    });
    
    context.subscriptions.push(previewCommand);
    context.subscriptions.push(errorCommand);
}
export function deactivate() {
}

type TextureDefinition = {
    Channel: number,
    Buffer?: string,
    BufferIndex?: number,
    LocalTexture?: string,
    RemoteTexture?: string,
    Self?: boolean
};
type BufferDependency = {
    Index: number,
    Channel: number
};
type BufferDefinition = {
    Name: string,
    File: string,
    Code: string,
    Textures: TextureDefinition[],
    UsesSelf: boolean,
    SelfChannel: number,
    Dependents: BufferDependency[],
    LineOffset: number
    IncludeName?: string,
    UsesKeyboard?: boolean,
};

type IncludeDefinition = {
    Name: string,
    File: string,
    Code: string,
    LineCount: number
};

class WebviewContentProvider {
    private context: vscode.ExtensionContext;
    private editor: vscode.TextEditor;

    constructor(context: vscode.ExtensionContext, editor: vscode.TextEditor) {
        this.context = context;
        this.editor = editor;
    }

    private getResourcePath(mediaFile: string) : string {
        const fullPath = vscode.Uri.file(
            path.join(this.context.extensionPath, 'resources', mediaFile)
        );
        const resourcePath = fullPath.with({ scheme: 'vscode-resource' });
        const pathAsString = resourcePath.toString();
        return pathAsString;
    }
    
    public generateWebviewConent(): string {
        let shader = this.editor.document.getText();
        let shaderName = this.editor.document.fileName;
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
        uniform vec4        iMouseButton;
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
        uniform sampler2D   iKeyboard;

        #define SHADER_TOY`;

        shaderName = shaderName.replace(/\\/g, '/');
        let buffers: BufferDefinition[] = [];
        let commonIncludes: IncludeDefinition[] = [];

        this.parseShaderCode(shaderName, shader, buffers, commonIncludes);

        // If final buffer uses feedback we need to add a last pass that renders it to the screen
        // because we can not ping-pong the screen
        {
            let finalBuffer = buffers[buffers.length - 1];
            if (finalBuffer.UsesSelf) {
                let finalBufferIndex = buffers.length - 1;
                finalBuffer.Dependents.push({
                    Index: buffers.length,
                    Channel: 0
                });
                buffers.push({
                    Name: "final-blit",
                    File: "final-blit",
                    Code: `void main() { gl_FragColor = texture2D(iChannel0, gl_FragCoord.xy / iResolution.xy); }`,
                    Textures: [{
                        Channel: 0,
                        Buffer: finalBuffer.Name,
                        BufferIndex: finalBufferIndex,
                    }],
                    UsesSelf: false,
                    SelfChannel: -1,
                    Dependents: [],
                    LineOffset: 0,
                });
            }
        }
        

        let useKeyboard = false;
        for (let buffer of buffers) {
            if (buffer.UsesKeyboard) {
                useKeyboard = true;
            }
        }

        let keyboard = {
            Init: "",
            Update: "",
            Callbacks: "",
            Shader: "",
            LineOffset: 0
        };
        if (useKeyboard) {
            keyboard.Init = `
            const numKeys = 256;
            const numStates = 4;
            let keyBoardData = new Uint8Array(numKeys * numStates);
            let keyBoardTexture = new THREE.DataTexture(keyBoardData, numKeys, numStates, THREE.LuminanceFormat, THREE.UnsignedByteType);
            keyBoardTexture.magFilter = THREE.NearestFilter;
            keyBoardTexture.needsUpdate = true;
            let pressedKeys = [];
            let releasedKeys = [];`;

            keyboard.Update = `
            // Update keyboard data
            if (pressedKeys.length > 0 || releasedKeys.length > 0) {
                for (let key of pressedKeys)
                    keyBoardData[key + 256] = 0;
                for (let key of releasedKeys)
                    keyBoardData[key + 768] = 0;
                keyBoardTexture.needsUpdate = true;
                pressedKeys = [];
                releasedKeys = [];
            }`;

            keyboard.Callbacks = `
            document.addEventListener('keydown', function(evt) {
                const i = evt.keyCode;
                if (i >= 0 && i <= 255) {
                    // Key is being held, don't register input
                    if (keyBoardData[i] == 0) {
                        keyBoardData[i] = 255; // Held
                        keyBoardData[i + 256] = 255; // Pressed
                        keyBoardData[i + 512] = (keyBoardData[i + 512] == 255 ? 0 : 255); // Toggled
                        pressedKeys.push(i);
                        keyBoardTexture.needsUpdate = true;
                    }
                }
            });
            document.addEventListener('keyup', function(evt) {
                const i = evt.keyCode;
                if (i >= 0 && i <= 255) {
                    keyBoardData[i] = 0; // Not held
                    keyBoardData[i + 768] = 255; // Released
                    releasedKeys.push(i);
                    keyBoardTexture.needsUpdate = true;
                }
            });`;
            
            keyboard.Shader = `
            const int Key_Backspace = 8, Key_Tab = 9, Key_Enter = 13, Key_Shift = 16, Key_Ctrl = 17, Key_Alt = 18, Key_Pause = 19, Key_Caps = 20, Key_Escape = 27, Key_PageUp = 33, Key_PageDown = 34, Key_End = 35,
                Key_Home = 36, Key_LeftArrow = 37, Key_UpArrow = 38, Key_RightArrow = 39, Key_DownArrow = 40, Key_Insert = 45, Key_Delete = 46, Key_0 = 48, Key_1 = 49, Key_2 = 50, Key_3 = 51, Key_4 = 52,
                Key_5 = 53, Key_6 = 54, Key_7 = 55, Key_8 = 56, Key_9 = 57, Key_A = 65, Key_B = 66, Key_C = 67, Key_D = 68, Key_E = 69, Key_F = 70, Key_G = 71, Key_H = 72,
                Key_I = 73, Key_J = 74, Key_K = 75, Key_L = 76, Key_M = 77, Key_N = 78, Key_O = 79, Key_P = 80, Key_Q = 81, Key_R = 82, Key_S = 83, Key_T = 84, Key_U = 85,
                Key_V = 86, Key_W = 87, Key_X = 88, Key_Y = 89, Key_Z = 90, Key_LeftWindow = 91, Key_RightWindows = 92, Key_Select = 93, Key_Numpad0 = 96, Key_Numpad1 = 97, Key_Numpad2 = 98, Key_Numpad3 = 99,
                Key_Numpad4 = 100, Key_Numpad5 = 101, Key_Numpad6 = 102, Key_Numpad7 = 103, Key_Numpad8 = 104, Key_Numpad9 = 105, Key_NumpadMultiply = 106, Key_NumpadAdd = 107, Key_NumpadSubtract = 109, Key_NumpadPeriod = 110, Key_NumpadDivide = 111, Key_F1 = 112, Key_F2 = 113, Key_F3 = 114, Key_F4 = 115, Key_F5 = 116, Key_F6 = 117, Key_F7 = 118, Key_F8 = 119, Key_F9 = 120, Key_F10 = 121, Key_F11 = 122, Key_F12 = 123, Key_NumLock = 144, Key_ScrollLock = 145,
                Key_SemiColon = 186, Key_Equal = 187, Key_Comma = 188, Key_Dash = 189, Key_Period = 190, Key_ForwardSlash = 191, Key_GraveAccent = 192, Key_OpenBracket = 219, Key_BackSlash = 220, Key_CloseBraket = 221, Key_SingleQuote = 222;

            bool isKeyDown(int key) {
                vec2 uv = vec2(float(key) / 255.0, 0.125);
                return texture2D(iKeyboard, uv).r > 0.0;
            }
            bool isKeyPressed(int key) {
                vec2 uv = vec2(float(key) / 255.0, 0.375);
                return texture2D(iKeyboard, uv).r > 0.0;
            }
            bool isKeyToggled(int key) {
                vec2 uv = vec2(float(key) / 255.0, 0.625);
                return texture2D(iKeyboard, uv).r > 0.0;
            }
            bool isKeyReleased(int key) {
                vec2 uv = vec2(float(key) / 255.0, 0.875);
                return texture2D(iKeyboard, uv).r > 0.0;
            }`;
            keyboard.LineOffset = keyboard.Shader.split(/\r\n|\n/).length - 1;
        }

        // Write all the shaders
        let shaderScripts = "";
        let buffersScripts = "";
        for (let buffer of buffers) {
            const include = buffer.IncludeName ? commonIncludes.find(include => include.Name === buffer.IncludeName) : '';
            shaderScripts += `
            <script id="${buffer.Name}" type="x-shader/x-fragment">
                ${shaderPreamble}
                ${keyboard.Shader}
                ${include ? include.Code : ''}
                ${buffer.Code}
            </script>`;

            // Create a RenderTarget for all but the final buffer
            let target = "null";
            let pingPongTarget = "null";
            if (buffer !== buffers[buffers.length - 1]) {
                target = "new THREE.WebGLRenderTarget(resolution.x, resolution.y, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: framebufferType })";
            }
            if (buffer.UsesSelf) {
                pingPongTarget = "new THREE.WebGLRenderTarget(resolution.x, resolution.y, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: framebufferType })";
            }

            if (buffer.UsesKeyboard) {
                buffer.LineOffset += keyboard.LineOffset;
            }

            buffersScripts += `
            buffers.push({
                Name: "${buffer.Name}",
                File: "${buffer.File}",
                LineOffset: ${buffer.LineOffset},
                Target: ${target},
                PingPongTarget: ${pingPongTarget},
                PingPongChannel: ${buffer.SelfChannel},
                Dependents: ${JSON.stringify(buffer.Dependents)},
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
                        iMouseButton: { type: "v2", value: mouseButton },

                        resolution: { type: "v2", value: resolution },
                        time: { type: "f", value: 0.0 },
                        mouse: { type: "v2", value: normalizedMouse },
                    }
                })
            });`;
        }

        // add the common includes for compilation checking
        for (let include of commonIncludes) {
            shaderScripts += `
                <script id="${include.Name}" type="x-shader/x-fragment">#version 300 es
                    precision highp float;
                    ${shaderPreamble}
                    ${include.Code}
                    void main() {}
                </script>`;

            buffersScripts += `
                commonIncludes.push({
                    Name: "${include.Name}",
                    File: "${include.File}"
                });`;
        }
        
        let textureScripts = "\n";
        let textureLoadScript = `function(texture) {
            texture.minFilter = THREE.LinearFilter;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
        }`;
        for (let i in buffers) {
            const buffer = buffers[i];
            const textures =  buffer.Textures;
            for (let texture of textures) {
                const channel = texture.Channel;
                const bufferIndex = texture.BufferIndex;
                const texturePath = texture.LocalTexture;
                const textureUrl = texture.RemoteTexture;

                let value: string;
                if (bufferIndex !== undefined) {
                    value = `buffers[${bufferIndex}].Target.texture`;
                }
                else if (texturePath !== undefined) {
                    value = `texLoader.load('${this.getResourcePath(texturePath)}', ${textureLoadScript})`;
                }
                else {
                    value = `texLoader.load('https://${textureUrl}', ${textureLoadScript})`;
                }
                textureScripts += `buffers[${i}].Shader.uniforms.iChannel${channel} = { type: 't', value: ${value} };\n`;
            }

            if (buffer.UsesSelf) {
                textureScripts += `buffers[${i}].Shader.uniforms.iChannel${buffer.SelfChannel} = { type: 't', value: buffers[${i}].PingPongTarget.texture };\n`;
            }

            if (buffer.UsesKeyboard) {
                useKeyboard = true;
                textureScripts += `buffers[${i}].Shader.uniforms.iKeyboard = { type: 't', value: keyBoardTexture };\n`;
            }
        }

        let frameTimeScript = "";
        if (config.get<boolean>('printShaderFrameTime')) {
            frameTimeScript = `
            <script src="${this.getResourcePath('stats.min.js')}" onload="
                let stats = new Stats();
                stats.showPanel(1);
                document.body.appendChild(stats.dom);
                requestAnimationFrame(function loop() {
                    stats.update();
                    requestAnimationFrame(loop);
                });
            "></script>`;
        }

        let pauseButtonScript = "";
        if (config.get<boolean>('showPauseButton')) {
            pauseButtonScript = `
                <label class="button-container">
                <input id="pause-button" type="checkbox">
                <span class="pause-play"></span>
            `;
        }

        let pauseWholeScript = "";
        let advanceTimeScript = `
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
            } else {
                deltaTime = 0.0;
            }`;
        }

        let screenshotButtonScript = "";
        if (config.get<boolean>('showScreenshotButton')) {
            screenshotButtonScript = `<span id="screenshot"></span>`;
        }

        // http://threejs.org/docs/api/renderers/webgl/WebGLProgram.html
        const content = `
            <head>
                <style>
                    html, body {
                        margin: 0;
                        padding: 0;
                        width: 100%;
                        height: 100%;
                        display: block;
                    }
                    #canvas {
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        text-align: center;
                        position: fixed;
                        position: relative;
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
                        z-index: 1;
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
                        background: url("${this.getResourcePath('pause.png')}");
                        background-size: 40px;
                        background-repeat: no-repeat;
                        background-position: center;
                        background-color: rgba(128, 128, 128, 0.5);
                        z-index: 1;
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
                        background: url("${this.getResourcePath('play.png')}");
                        background-size: 40px;
                        background-repeat: no-repeat;
                        background-position: center;
                        background-color: rgba(128, 128, 128, 0.5);
                    }
                    
                    /* Custom screenshot button */
                    #screenshot {
                        position: absolute;
                        border: none;
                        right: 0px;
                        padding: 26px;
                        text-align: center;
                        text-decoration: none;
                        font-size: 26px;
                        border-radius: 8px;
                        margin: 8px;
                        transform: translateX(0%);
                        background: url("${this.getResourcePath('screen.png')}");
                        background-size: 26px;
                        background-repeat: no-repeat;
                        background-position: center;
                        background-color: rgba(128, 128, 128, 0.5);
                        z-index: 1;
                    }
                    #screenshot:hover {
                        background-color: lightgray;
                        transition-duration: 0.1s;
                    }
                </style>
            </head>
            <body>
                <div id="message"></div>
                <div id="container">
                    ${pauseButtonScript}
                </div>
                ${screenshotButtonScript}
            </body>
            <script src="${this.getResourcePath('jquery.min.js')}"></script>
            <script src="${this.getResourcePath('three.min.js')}"></script>
            ${frameTimeScript}
            <canvas id="canvas"></canvas>

            ${shaderScripts}

            <script type="text/javascript">
                let currentShader = {};
                (function(){
                    console.error = function (message) {
                        if('7' in arguments) {
                            $("#message").append('<h3>Shader failed to compile - ' + currentShader.Name + '</h3><ul>');
                            $("#message").append(arguments[7].replace(/ERROR: \\d+:(\\d+)/g, function(m, c) {
                                let lineNumber = Number(c) - currentShader.LineOffset;
                                return '<li><a class="error" unselectable href="'+ encodeURI('command:shader-toy.onGlslError?' + JSON.stringify([lineNumber, currentShader.File])) + '">Line ' + String(lineNumber) + '</a>';
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

                let clock = new THREE.Clock();
                let pausedTime = 0.0;
                let deltaTime = 0.0;
                let time = 0.0;

                let paused = false;
                let pauseButton = document.getElementById('pause-button');
                if (pauseButton) {
                    pauseButton.onclick = function(){
                        paused = pauseButton.checked;
                        if (!paused)
                            pausedTime += clock.getDelta();
                    };
                }
                
                {
                    let screenshotButton = document.getElementById("screenshot");
                    if (screenshotButton) {
                        screenshotButton.addEventListener('click', saveScreenshot);
                    }
                }

                let canvas = document.getElementById('canvas');
                let gl = canvas.getContext('webgl2');
                let isWebGL2 = gl != null;
                if (gl == null) gl = canvas.getContext('webgl');
                let supportsFloatFramebuffer = (gl.getExtension('EXT_color_buffer_float') != null) || (gl.getExtension('WEBGL_color_buffer_float') != null);
                let supportsHalfFloatFramebuffer = (gl.getExtension('EXT_color_buffer_half_float') != null);
                let framebufferType = THREE.UnsignedByteType;
                if (supportsFloatFramebuffer) framebufferType = THREE.FloatType;
                else if (supportsHalfFloatFramebuffer) framebufferType = THREE.HalfFloatType;

                let renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, context: gl, preserveDrawingBuffer: true });
                let resolution = new THREE.Vector3();
                let mouse = new THREE.Vector4(-1, -1, -1, -1);
                let mouseButton = new THREE.Vector4(0, 0, 0, 0);
                let normalizedMouse = new THREE.Vector2(0, 0);
                let frameCounter = 0;

                let channelResolution = new THREE.Vector3(128.0, 128.0, 0.0);

                let buffers = [];
                let commonIncludes = [];
                ${buffersScripts}

                // WebGL2 inserts more lines into the shader
                if (isWebGL2) {
                    for (let buffer of buffers) {
                        buffer.LineOffset += 16;
                    }
                }

                ${keyboard.Init}
                
                let texLoader = new THREE.TextureLoader();
                ${textureScripts}
                
                let scene = new THREE.Scene();
                let quad = new THREE.Mesh(
                    new THREE.PlaneGeometry(resolution.x, resolution.y),
                    null
                );
                scene.add(quad);
                
                let camera = new THREE.OrthographicCamera(-resolution.x / 2.0, resolution.x / 2.0, resolution.y / 2.0, -resolution.y / 2.0, 1, 1000);
                camera.position.set(0, 0, 10);

                // Run every shader once to check for compile errors
                let failed=0;
                for (let include of commonIncludes) {
                    currentShader = {
                        Name: include.Name,
                        File: include.File,
                        LineOffset: ${shaderPreamble.split(/\r\n|\n/).length}  + 2 // add two for version and precision lines
                    };
                    // bail if there is an error found in the include script
                    if(compileFragShader(gl, document.getElementById(include.Name).textContent) == false) throw Error(\`Failed to compile \${include.Name}\`);
                }

                for (let buffer of buffers) {
                    currentShader = {
                        Name: buffer.Name,
                        File: buffer.File,
                        LineOffset: buffer.LineOffset
                    };
                    quad.material = buffer.Shader;
                    renderer.render(scene, camera, buffer.Target);
                }
                currentShader = {};

                computeSize();
                render();

                function addLineNumbers( string ) {
                    let lines = string.split( '\\n' );
                    for ( let i = 0; i < lines.length; i ++ ) {
                        lines[ i ] = ( i + 1 ) + ': ' + lines[ i ];
                    }
                    return lines.join( '\\n' );
                }
            
                function compileFragShader(gl, fsSource) {
                    const fs = gl.createShader(gl.FRAGMENT_SHADER);
                    gl.shaderSource(fs, fsSource);
                    gl.compileShader(fs);
                    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
                        const fragmentLog = gl.getShaderInfoLog(fs);
                        console.error( 'THREE.WebGLProgram: shader error: ', gl.getError(), 'gl.COMPILE_STATUS', null, null, null, null, fragmentLog );
                        return false;
                    }
                    return true;
                }

                function render() {
                    requestAnimationFrame(render);
                    ${pauseWholeScript}
                    
                    frameCounter++;
                    ${advanceTimeScript}

                    for (let buffer of buffers) {
                        buffer.Shader.uniforms['iResolution'].value = resolution;
                        buffer.Shader.uniforms['iTimeDelta'].value = deltaTime;
                        buffer.Shader.uniforms['iGlobalTime'].value = time;
                        buffer.Shader.uniforms['iTime'].value = time;
                        buffer.Shader.uniforms['iFrame'].value = frameCounter;
                        buffer.Shader.uniforms['iMouse'].value = mouse;
                        buffer.Shader.uniforms['iMouseButton'].value = mouseButton;

                        buffer.Shader.uniforms['resolution'].value = resolution;
                        buffer.Shader.uniforms['time'].value = time;
                        buffer.Shader.uniforms['mouse'].value = normalizedMouse;

                        quad.material = buffer.Shader;
                        renderer.render(scene, camera, buffer.Target);
                    }

                    for (let buffer of buffers) {
                        if (buffer.PingPongTarget) {
                            [buffer.PingPongTarget, buffer.Target] = [buffer.Target, buffer.PingPongTarget];
                            buffer.Shader.uniforms[\`iChannel\${buffer.PingPongChannel}\`].value = buffer.PingPongTarget.texture;
                            for (let dependent of buffer.Dependents) {
                                const dependentBuffer = buffers[dependent.Index];
                                dependentBuffer.Shader.uniforms[\`iChannel\${dependent.Channel}\`] = { type: 't', value: buffer.Target.texture };
                            }
                        }
                    }

                    ${keyboard.Update}
                }
                function computeSize() {
                    let forceAspectRatio = (width, height) => {
                        // Forced aspect ratio
                        let forcedAspects = [${config.get<[ number, number ]>('forceAspectRatio')}];
                        let forcedAspectRatio = forcedAspects[0] / forcedAspects[1];
                        let aspectRatio = width / height;
            
                        if (forcedAspectRatio <= 0 || !isFinite(forcedAspectRatio)) {
                            let resolution = new THREE.Vector3(width, height, 1.0);
                            return resolution;
                        }
                        else if (aspectRatio < forcedAspectRatio) {
                            let resolution = new THREE.Vector3(width, Math.floor(width / forcedAspectRatio), 1);
                            return resolution;
                        }
                        else {
                            let resolution = new THREE.Vector3(Math.floor(height * forcedAspectRatio), height, 1);
                            return resolution;
                        }
                    };
                    
                    // Compute forced aspect ratio and align canvas
                    resolution = forceAspectRatio(window.innerWidth, window.innerHeight);
                    canvas.style.left = \`\${(window.innerWidth - resolution.x) / 2}px\`;
                    canvas.style.top = \`\${(window.innerHeight - resolution.y) / 2}px\`;

                    for (let buffer of buffers) {
                        if (buffer.Target) {
                            buffer.Target.setSize(resolution.x, resolution.y);
                        }
                        if (buffer.PingPongTarget) {
                            buffer.PingPongTarget.setSize(resolution.x, resolution.y);
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

                    // Reset iFrame on resize for shaders that rely on first-frame setups
                    frameCounter = 0;
                }
                function saveScreenshot() {
                    renderer.render(scene, camera);
                    renderer.domElement.toBlob(function(blob){
                        let a = document.createElement('a');
                        let url = URL.createObjectURL(blob);
                        a.href = url;
                        a.download = 'shadertoy.png';
                        a.click();
                    }, 'image/png', 1.0);
                }
                let dragging = false;
                function updateMouse(clientX, clientY) {
                    let rect = canvas.getBoundingClientRect();
                    let mouseX = clientX - rect.left;
                    let mouseY = resolution.y - clientY - rect.top;

                    if (mouseButton.x + mouseButton.y != 0) {
                        mouse.x = mouseX;
                        mouse.y = mouseY;
                    }

                    normalizedMouse.x = mouseX / resolution.x;
                    normalizedMouse.y = mouseY / resolution.y;
                }
                canvas.addEventListener('mousemove', function(evt) {
                    updateMouse(evt.clientX, evt.clientY);
                }, false);
                canvas.addEventListener('mousedown', function(evt) {
                    if (evt.button == 0)
                        mouseButton.x = 1;
                    if (evt.button == 2)
                        mouseButton.y = 1;

                    if (!dragging) {
                        updateMouse(evt.clientX, evt.clientY);
                        mouse.z = mouse.x;
                        mouse.w = mouse.y;
                        dragging = true
                    }
                }, false);
                canvas.addEventListener('mouseup', function(evt) {
                    if (evt.button == 0)
                        mouseButton.x = 0;
                    if (evt.button == 2)
                        mouseButton.y = 0;

                    dragging = false;
                    mouse.z = -mouse.z;
                    mouse.w = -mouse.w;
                }, false);
                window.addEventListener('resize', function() {
                    computeSize();
                });

                ${keyboard.Callbacks}
            </script>
        `;
        // console.log(content);
        // require("fs").writeFileSync(__dirname + "/../../src/preview.html", content);

        return content;
    }

    readShaderFile(file: string): { success: boolean, error: any, bufferCode: string } {
        // Read the whole file of the shader
        let success = false;
        let bufferCode = "";
        let error = null;
        const fs = require("fs");
        try {
            bufferCode = fs.readFileSync(file, "utf-8");
            success = true;
        }
        catch (e) {
            error = e;
        }

        return { success, error, bufferCode };
    }

    parseShaderCode(name: string, code: string, buffers: BufferDefinition[], commonIncludes: IncludeDefinition[]) {
        const stripPath = (name: string) => {
            let lastSlash = name.lastIndexOf('/');
            return name.substring(lastSlash + 1);
        };
        const findByName = (bufferName: string) => {
            return (value: any) => {
                if (value.Name === stripPath(bufferName)) {
                    return true;
                }
                return false;
            };
        };

        const found = buffers.find(findByName(name));
        if (found) {
            return;
        }

        const config = vscode.workspace.getConfiguration('shader-toy');

        let line_offset = 125;
        let textures: TextureDefinition[] = [];
        let includeName: string | undefined;

        const loadDependency = (file: string, channel: number, passType: string) => {
            // Get type and name of file
            let colonPos = file.indexOf('://', 0);
            let textureType = file.substring(0, colonPos);

            // Fix path to use '/' over '\\' and relative to the current working directory
            file = file.substring(colonPos + 3, file.length);
            const origFile = file;
            file = ((file: string) => {
                const relFile = vscode.workspace.asRelativePath(file);
                const herePos = relFile.indexOf("./");
                if (vscode.workspace.rootPath === null && herePos === 0) {
                    vscode.window.showErrorMessage("To use relative paths please open a workspace!");
                }
                if (relFile !== file || herePos === 0) {
                    return vscode.workspace.rootPath + '/' + relFile;
                }
                else {
                    return file;
                }
            })(file);
            file = file.replace(/\\/g, '/');
            file = file.replace(/\.\//g, "");

            if (passType === "include" && textureType === "glsl") {
                const path = require("path");
                const name = path.basename(file);

                // Attempt to get the include if already exists
                let include = commonIncludes.find(include => include.File === file);
                if (!include) {
                    // Read the whole file of the shader
                    const shaderFile = this.readShaderFile(file);
                    if(shaderFile.success === false){
                        vscode.window.showErrorMessage(`Could not open file: ${origFile}`);
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
                // TODO: Why do we need to subtract one here?
                line_offset += include.LineCount - 1;

                // store the reference name for this include
                includeName = name;
            }
            else if (textureType === "buf") {
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
                        vscode.window.showErrorMessage(`Could not open file: ${origFile}`);
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
            }
            else if (textureType === "file") {
                // Push texture
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
        };

        let usesKeyboard = false;
        let useTextureDefinitionInShaders = config.get<boolean>('useInShaderTextures');
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
                // Get channel number
                let channelPos = nextMatch.TexturePos + nextMatch.MatchLength;
                let endline = code.substring(channelPos).match(/\r\n|\r|\n/);
                if (endline !== null && endline.index !== undefined) {
                    endline.index += channelPos;
                    let spacePos = Math.min(code.indexOf(" ", channelPos), endline.index);

                    if (nextMatch.PassType === "iKeyboard") {
                        usesKeyboard = true;
                    }
                    else {
                        let channel = parseInt(code.substring(channelPos, spacePos));

                        let afterSpacePos = code.indexOf(" ", spacePos + 1);
                        let afterCommentPos = code.indexOf("//", code.indexOf("://", spacePos)  + 3);
                        let textureEndPos = Math.min(endline.index,
                            afterSpacePos > 0 ? afterSpacePos : code.length,
                            afterCommentPos > 0 ? afterCommentPos : code.length);

                        // Get dependencies' name
                        let texture = code.substring(spacePos + 1, textureEndPos);
                        
                        // Load the dependency
                        loadDependency(texture, channel, nextMatch.PassType);
                    }

                    // Remove #iChannel define
                    code = code.replace(code.substring(nextMatch.TexturePos, endline.index + endline[0].length), "");
                    nextMatch = findNextMatch();
                    line_offset--;
                }
            }
        }
        else { // TODO: Ideally depracate this because it is counter-productive when working dependent shaders
            let textures: any[] | undefined = config.get('textures');
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
        let mainImagePos = code.search(/void\s+mainImage\s*\(\s*out\s+vec4\s+\w+,\s*in\s+vec2\s+\w+\s*\)\s*\{/g);
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
        if (config.get<boolean>('warnOnUndefinedTextures')) {
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
            Textures: textures,
            UsesSelf: usesSelf,
            SelfChannel: selfChannel,
            Dependents: [],
            UsesKeyboard: usesKeyboard,
            LineOffset: line_offset
        });
    }
}