'use strict';

import * as types from'./typenames';
import { ShaderParser } from './shaderparser';
import { Context } from './context';

export class WebviewContentProvider {
    private context: Context;
    private documentContent: string;
    private documentName: string;
    
    constructor(context: Context, documentContent: string, documentName: string) {
        this.context = context;
        this.documentContent = documentContent;
        this.documentName = documentName;
    }

    public generateWebviewConent(startingTime: number, startingMouse: types.Mouse, startingNormalizedMouse: types.NormalizedMouse, startingKeys: types.Keys): string {

        let shader = this.documentContent;
        let shaderName = this.documentName;

        let shaderPreamble = `
        uniform vec3        iResolution;
        uniform float       iGlobalTime;
        uniform float       iTime;
        uniform float       iTimeDelta;
        uniform int         iFrame;
        uniform vec4        iDate;
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
        uniform float       iSampleRate;

        #define SHADER_TOY`;

        shaderName = shaderName.replace(/\\/g, '/');
        let buffers: types.BufferDefinition[] = [];
        let commonIncludes: types.IncludeDefinition[] = [];

        new ShaderParser(this.context).parseShaderCode(shaderName, shader, buffers, commonIncludes);

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
                    TextureInputs: [{
                        Channel: 0,
                        Buffer: finalBuffer.Name,
                        BufferIndex: finalBufferIndex,
                    }],
                    AudioInputs: [],
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

        let keyboardScripts = {
            Init: "",
            Update: "",
            Callbacks: "",
            Shader: "",
            LineOffset: 0
        };
        if (useKeyboard) {
            keyboardScripts.Init = `
            const numKeys = 256;
            const numStates = 4;
            let keyBoardData = new Uint8Array(numKeys * numStates);
            let keyBoardTexture = new THREE.DataTexture(keyBoardData, numKeys, numStates, THREE.LuminanceFormat, THREE.UnsignedByteType);
            keyBoardTexture.magFilter = THREE.NearestFilter;
            keyBoardTexture.needsUpdate = true;
            let pressedKeys = [];
            let releasedKeys = [];
            let toggledKeys = [${startingKeys}];
            for (let key of toggledKeys) {
                keyBoardData[key + 512] = 255; // Toggled
            }
            `;

            keyboardScripts.Update = `
            // Update keyboard data
            if (pressedKeys.length > 0 || releasedKeys.length > 0) {
                for (let key of pressedKeys) {
                    keyBoardData[key + 256] = 0;
                }
                for (let key of releasedKeys) {
                    keyBoardData[key + 768] = 0;
                }

                if (pressedKeys.length > 0) {
                    vscode.postMessage({
                        command: 'updateKeyboard',
                        keys: toggledKeys
                    });
                }
                
                keyBoardTexture.needsUpdate = true;
                pressedKeys = [];
                releasedKeys = [];
            }`;

            keyboardScripts.Callbacks = `
            document.addEventListener('keydown', function(evt) {
                const i = evt.keyCode;
                if (i >= 0 && i <= 255) {
                    // Key is being held, don't register input
                    if (keyBoardData[i] == 0) {
                        keyBoardData[i] = 255; // Held
                        keyBoardData[i + 256] = 255; // Pressed
                        keyBoardData[i + 512] = (keyBoardData[i + 512] == 255 ? 0 : 255); // Toggled

                        if (keyBoardData[i + 512] > 0) {
                            toggledKeys.push(i);
                        }
                        else {
                            toggledKeys = toggledKeys.filter(function(value, index, arr){
                                return value != i;
                            });
                        }

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
            
            keyboardScripts.Shader = `
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
            keyboardScripts.LineOffset = keyboardScripts.Shader.split(/\r\n|\n/).length - 1;
        }

        // Write all the shaders
        let shaderScripts = "";
        let buffersScripts = "";
        for (let buffer of buffers) {
            const include = buffer.IncludeName ? commonIncludes.find(include => include.Name === buffer.IncludeName) : '';
            shaderScripts += `
            <script id="${buffer.Name}" type="x-shader/x-fragment">
                ${shaderPreamble}
                ${keyboardScripts.Shader}
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
                buffer.LineOffset += keyboardScripts.LineOffset;
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

                        iDate: { type: "v4", value: date },
                        iSampleRate: { type: "f", value: audioContext.sampleRate },

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

        let audioScripts = {
            Init: "",
            Update: "",
            Pause: "",
            Resume: ""
        };

        for (let i in buffers) {
            const buffer = buffers[i];
            const textures =  buffer.TextureInputs;
            for (let texture of textures) {
                const channel = texture.Channel;

                const bufferIndex = texture.BufferIndex;
                const localPath = texture.LocalTexture;
                const remotePath = texture.RemoteTexture;

                let value: string | undefined;
                if (bufferIndex !== undefined) {
                    value = `buffers[${bufferIndex}].Target.texture`;
                }
                else if (localPath !== undefined) {
                    const resolvedPath = this.context.makeWebviewResource(this.context.makeUri(localPath));
                    value = `texLoader.load('${resolvedPath.toString()}', ${textureLoadScript})`;
                }
                else if (remotePath !== undefined) {
                    value = `texLoader.load('https://${remotePath}', ${textureLoadScript})`;
                }

                if (value !== undefined) {
                    textureScripts += `buffers[${i}].Shader.uniforms.iChannel${channel} = { type: 't', value: ${value} };\n`;
                }
            }

            const audios =  buffer.AudioInputs;
            for (let j in audios) {
                const audio = audios[j];

                const channel = audio.Channel;
                
                const localPath = audio.LocalPath;
                const remotePath = audio.RemotePath;

                let path: string | undefined;

                if (localPath !== undefined) {
                    path = this.context.makeWebviewResource(this.context.makeUri(localPath)).toString();
                }
                else if (remotePath !== undefined) {
                    path = "https://" + remotePath;
                }

                if (path !== undefined) {
                    audioScripts.Init += `
                    fetch('${path}')
                        .then(function(response) {
                            return response.blob();
                        })
                        .then(function(blob) {
                            let reader = new FileReader();
                            reader.onload = function() {
                                audioContext.decodeAudioData(reader.result)
                                    .then(function(buffer) {
                                        let audio = audioContext.createBufferSource();
                                        audio.buffer = buffer;
                                        audio.loop = true;

                                        let analyser = audioContext.createAnalyser();
                                        analyser.fftSize = 512;

                                        const dataSize = Math.max(analyser.fftSize, analyser.frequencyBinCount);
                                        const dataArray = new Uint8Array(dataSize * 2);

                                        let texture = new THREE.DataTexture(dataArray, dataSize, 2, THREE.LuminanceFormat, THREE.UnsignedByteType);
                                        texture.magFilter = THREE.LinearFilter;
                                        texture.needsUpdate = true;

                                        buffers[${i}].Shader.uniforms.iChannel${channel} = { type: 't', value: texture };

                                        audio.connect(analyser);
                                        analyser.connect(audioContext.destination);
                                        audio.start(0, startingTime % buffer.duration);
            
                                        audios.push({
                                            Channel: ${channel},
                                            Media: audio,
                                            Analyser: analyser,
                                            AmplitudeSamples: analyser.fftSize,
                                            FrequencySamples: analyser.frequencyBinCount,
                                            Data: dataArray,
                                            Texture: texture
                                        })
                                    })
                                    .catch(function(e){
                                        console.warn("Error: " + e.message);
                                    });
                            };

                            let file = new File([ blob ], "${path}");
                            reader.readAsArrayBuffer(file);
                        }).
                        catch(function(){
                            vscode.postMessage({
                                command: 'errorMessage',
                                message: "Failed loading audio file: ${audio.UserPath}"
                            });
                        });
                    `;
                    textureScripts += `buffers[${i}].Shader.uniforms.iChannel0 = { type: 't', value: null };\n`;
                }
            }

            if (buffer.UsesSelf) {
                textureScripts += `buffers[${i}].Shader.uniforms.iChannel${buffer.SelfChannel} = { type: 't', value: buffers[${i}].PingPongTarget.texture };\n`;
            }

            if (buffer.UsesKeyboard) {
                useKeyboard = true;
                textureScripts += `buffers[${i}].Shader.uniforms.iKeyboard = { type: 't', value: keyBoardTexture };\n`;
            }
        }

        if (audioScripts.Init !== "") {
            audioScripts.Init = `
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioContext = new AudioContext();
            
            const fileReader = new FileReader();

            let audios = [];
            ` + audioScripts.Init;

            audioScripts.Update = `
            for (let audio of audios) {
                // Get audio data
                audio.Analyser.getByteFrequencyData(audio.Data.subarray(0, audio.Data.length / 2));
                audio.Analyser.getByteTimeDomainData(audio.Data.subarray(audio.Data.length / 2, -1));

                // Scale buffer to fill the whole range because
                // frequency data and amplitude data are not necessarily the same length
                audio.Data.subarray(0, audio.Data.length / 2).set(
                    audio.Data.slice(0, audio.Data.length / 2)
                        .map(function(value, index, array) {
                            index = index / (audio.Data.length / 2);
                            index = Math.floor(index * audio.FrequencySamples);
                            return array[index];
                        })
                    );
                audio.Data.subarray(audio.Data.length / 2, -1).set(
                    audio.Data.slice(audio.Data.length / 2, -1)
                        .map(function(value, index, array) {
                            index = index / (audio.Data.length / 2);
                            index = index * audio.AmplitudeSamples;
                            return array[index];
                        })
                    );
                
                audio.Texture.needsUpdate = true;
            }
            `;

            audioScripts.Pause = `
            audioContext.suspend();
            `;
            audioScripts.Resume = `
            audioContext.resume();
            `;
        }
        else {
            audioScripts.Init = `
            const audioContext = {
                sampleRate: 0
            };
            `;
        }

        let frameTimeScript = "";
        if (this.context.getConfig<boolean>('printShaderFrameTime')) {
            frameTimeScript = `
            <script src="${this.context.getWebviewResourcePath('stats.min.js')}" onload="
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
        if (this.context.getConfig<boolean>('showPauseButton')) {
            pauseButtonScript = `
                <label class="button-container">
                <input id="pause-button" type="checkbox">
                <span class="pause-play"></span>
            `;
        }

        let pauseWholeScript = "";
        let advanceTimeScript = `
        deltaTime = clock.getDelta();
        time = startingTime + clock.getElapsedTime() - pausedTime;`;
        if (this.context.getConfig<boolean>('pauseWholeRender')) {
            pauseWholeScript = `if (paused) return;`;
        }
        else {
            advanceTimeScript = `
            if (paused == false) {
                deltaTime = clock.getDelta();
                time = startingTime + clock.getElapsedTime() - pausedTime;
                vscode.postMessage({
                    command: 'updateTime',
                    time: time
                });
            } else {
                deltaTime = 0.0;
            }`;
        }

        let screenshotButtonScript = "";
        if (this.context.getConfig<boolean>('showScreenshotButton')) {
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
                        cursor:pointer;
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
                        background: url("${this.context.getWebviewResourcePath('pause.png')}");
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
                        background: url("${this.context.getWebviewResourcePath('play.png')}");
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
                        background: url("${this.context.getWebviewResourcePath('screen.png')}");
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
            <script src="${this.context.getWebviewResourcePath('jquery.min.js')}"></script>
            <script src="${this.context.getWebviewResourcePath('three.min.js')}"></script>
            ${frameTimeScript}

            <canvas id="canvas"></canvas>

            ${shaderScripts}

            <script type="text/javascript">
                const vscode = acquireVsCodeApi();

                let revealError = function(line, file) {
                    vscode.postMessage({
                        command: 'showGlslsError',
                        line: line,
                        file: file
                    });
                };

                let currentShader = {};
                (function(){
                    console.error = function (message) {
                        if('7' in arguments) {
                            $("#message").append(\`<h3>Shader failed to compile - \${currentShader.Name} </h3>\`);
                            $("#message").append('<ul>');
                            $("#message").append(arguments[7].replace(/ERROR: \\d+:(\\d+)/g, function(m, c) {
                                let lineNumber = Number(c) - currentShader.LineOffset;
                                return \`${`<li><a class="error" unselectable onclick="revealError(\${lineNumber}, '\${currentShader.File}')">Line \${lineNumber} </a>`}\`;
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
                let startingTime = ${startingTime};
                let time = startingTime;

                let date = new THREE.Vector4();

                let updateDate = function() {
                    let today = new Date();
                    date.x = today.getFullYear();
                    date.y = today.getMonth();
                    date.z = today.getDate();
                    date.w = today.getHours() * 60 * 60 
                        + today.getMinutes() * 60
                        + today.getSeconds()
                        + today.getMilliseconds() * 0.001;
                };
                updateDate();

                let paused = false;
                let pauseButton = document.getElementById('pause-button');
                if (pauseButton) {
                    pauseButton.onclick = function(){
                        paused = pauseButton.checked;
                        if (!paused) {
                            ${audioScripts.Resume}
                            pausedTime += clock.getDelta();
                        }
                        else {
                            ${audioScripts.Pause}
                        }
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
                let mouse = new THREE.Vector4(${startingMouse.x}, ${startingMouse.y}, ${startingMouse.z}, ${startingMouse.w});
                let mouseButton = new THREE.Vector4(0, 0, 0, 0);
                let normalizedMouse = new THREE.Vector2(${startingNormalizedMouse.x}, ${startingNormalizedMouse.y});
                let frameCounter = 0;

                let channelResolution = new THREE.Vector3(128.0, 128.0, 0.0);
                
                ${audioScripts.Init}
                ${audioScripts.Resume}

                let buffers = [];
                let commonIncludes = [];
                ${buffersScripts}

                // WebGL2 inserts more lines into the shader
                if (isWebGL2) {
                    for (let buffer of buffers) {
                        buffer.LineOffset += 16;
                    }
                }

                ${keyboardScripts.Init}
                
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
                    updateDate();

                    ${audioScripts.Update}
                    ${keyboardScripts.Update}

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
                                dependentBuffer.Shader.uniforms[\`iChannel\${dependent.Channel}\`].value = buffer.Target.texture;
                            }
                        }
                    }
                }
                function computeSize() {
                    let forceAspectRatio = (width, height) => {
                        // Forced aspect ratio
                        let forcedAspects = [${this.context.getConfig<[ number, number ]>('forceAspectRatio')}];
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
                function updateMouse() {
                    vscode.postMessage({
                        command: 'updateMouse',
                        mouse: {
                            x: mouse.x,
                            y: mouse.y,
                            z: mouse.z,
                            w: mouse.w
                        },
                        normalizedMouse: {
                            x: normalizedMouse.x,
                            y: normalizedMouse.y
                        }
                    });
                }
                let dragging = false;
                function updateNormalizedMouseCoordinates(clientX, clientY) {
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
                    updateNormalizedMouseCoordinates(evt.clientX, evt.clientY);
                    updateMouse();
                }, false);
                canvas.addEventListener('mousedown', function(evt) {
                    if (evt.button == 0)
                        mouseButton.x = 1;
                    if (evt.button == 2)
                        mouseButton.y = 1;

                    if (!dragging) {
                        updateNormalizedMouseCoordinates(evt.clientX, evt.clientY);
                        mouse.z = mouse.x;
                        mouse.w = mouse.y;
                        dragging = true
                    }

                    updateMouse();
                }, false);
                canvas.addEventListener('mouseup', function(evt) {
                    if (evt.button == 0)
                        mouseButton.x = 0;
                    if (evt.button == 2)
                        mouseButton.y = 0;

                    dragging = false;
                    mouse.z = -mouse.z;
                    mouse.w = -mouse.w;

                    updateMouse();
                }, false);
                window.addEventListener('resize', function() {
                    computeSize();
                });

                ${keyboardScripts.Callbacks}
            </script>
        `;
        // console.log(content);
        // require("fs").writeFileSync(__dirname + "/../../src/preview.html", content);

        return content;
    }
}
