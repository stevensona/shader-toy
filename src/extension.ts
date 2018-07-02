'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';

export function activate(context: ExtensionContext) {
    let previewUri = Uri.parse('glsl-preview://authority/glsl-preview');
    let provider = new GLSLDocumentContentProvider(context);
    let registration = vscode.workspace.registerTextDocumentContentProvider('glsl-preview', provider);
    const config = vscode.workspace.getConfiguration('shader-toy');
    var _timeout: number;

    vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
        clearTimeout(_timeout);
        _timeout = setTimeout( function() { 
            if(vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) {
                provider.update(previewUri);
            }
        }, 1000);
    });
    if (config.get('reloadOnChangeEditor', false)) {
        vscode.window.onDidChangeActiveTextEditor((e: vscode.TextEditor) => {
            if(e && e.document === e.document) {
                provider.update(previewUri);
            }
        });
    }

    let previewCommand = vscode.commands.registerCommand('extension.showGlslPreview', () => {
        return vscode.commands.executeCommand('vscode.previewHtml', previewUri, ViewColumn.Two, 'GLSL Preview')
        .then((success) => {}, (reason) => { vscode.window.showErrorMessage(reason); });
    });
    
    context.subscriptions.push(previewCommand, registration);
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
        let shader = vscode.window.activeTextEditor.document.getText();
        const config = vscode.workspace.getConfiguration('shader-toy');

        var line_offset = 120;

        let textureScript = "\n";
        if (config.get('useInShaderTextures', false)) {
            var texturePos = shader.indexOf("#iChannel", 0);
            while (texturePos >= 0) {
                var channelPos = texturePos + 9;
                var channel = parseInt(shader.charAt(channelPos));
                var endlinePos = shader.indexOf("\n", texturePos);
                let texture = shader.substr(channelPos + 2, endlinePos - channelPos - 3);

                textureScript += `shader.uniforms.iChannel${channel} = { type: 't', value: THREE.ImageUtils.loadTexture('${texture}') };\n`;
                line_offset--;

                shader = shader.replace(shader.substring(texturePos, endlinePos + 1), "");
                texturePos = shader.indexOf("#iChannel", texturePos);
            }
        }
        else {
            let textures = config.get('textures', {});
            for(let i in textures) {
                if (textures[i].length > 0) {
                    textureScript += `shader.uniforms.iChannel${i} = { type: 't', value: THREE.ImageUtils.loadTexture('${textures[i]}') };\n`;
                }
            }
        }

        let frameTimeScript = "";
        if (config.get('printShaderFrameTime', false)) {
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
                    html, body, #canvas { margin: 0; padding: 0; width: 100%; height: 100%; display: block; }
                    #message {font-family: Consolas; font-size: 1.2em; color:#ccc; background-color:black; font-weight: bold; z-index: 2; position: absolute;}
                </style>
            </head>
            <body>
                <div id="message"></div>
                <div id="container"></div>

            </body>
            <script src="file://${this.getResourcePath('jquery.min.js')}"></script>
            <script src="file://${this.getResourcePath('three.min.js')}"></script>
            <canvas id="canvas"></canvas>
            <script id="vs" type="x-shader/x-vertex">
                void main() {
                    gl_Position = vec4(position, 1.0);
                }
            </script>
            <script id="fs" type="x-shader/x-fragment">
                uniform vec3        iResolution;
                uniform float       iGlobalTime;
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

                #define SHADER_TOY

                ${shader}
            </script>

            <script type="text/javascript">
                ${frameTimeScript}

                (function(){
                    console.error = function (message) {
                        if('7' in arguments) {
                            $("#message").html("<h3>Shader failed to compile</h3><ul>")                                    
                            $("#message").append(arguments[7].replace(/ERROR: \\d+:(\\d+)/g, function(m, c) { return  "<li>Line " + String(Number(c) - ${line_offset}); }));
                            $("#message").append("</ul>");
                        }
                    };
                })();
                var canvas = document.getElementById('canvas');
                var scene = new THREE.Scene();
                var renderer = new THREE.WebGLRenderer({canvas: canvas, antialias: true});
                var camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientWidth, 1, 1000);
                var clock = new THREE.Clock();
                var resolution = new THREE.Vector3(canvas.clientWidth, canvas.clientHeight, 1.0);
                var channelResolution = new THREE.Vector3(128.0, 128.0, 0.0);
                var mouse = new THREE.Vector4(0, 0, 0, 0);
                var frameCounter = 0;
                var shader = new THREE.ShaderMaterial({
                        vertexShader: document.getElementById('vs').textContent,
                        fragmentShader: document.getElementById('fs').textContent,
                        depthWrite: false,
                        depthTest: false,
                        uniforms: {
                            iResolution: { type: "v3", value: resolution },
                            iGlobalTime: { type: "f", value: 0.0 },
                            iTimeDelta: { type: "f", value: 0.0 },
                            iFrame: { type: "i", value: 0 },
                            iChannelTime: { type: "fv1", value: [0., 0., 0., 0.] },
                            iChannelResolution: { type: "v3v", value:
                                [channelResolution, channelResolution, channelResolution, channelResolution]   
                            },
                            iMouse: { type: "v4", value: mouse },
                        }
                    });
                
                ${textureScript}
                
                var quad = new THREE.Mesh(
                    new THREE.PlaneGeometry(2, 2),
                    shader
                );
                scene.add(quad);
                camera.position.z = 10;

                render();

                function render() {
                    requestAnimationFrame(render);
                    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
                        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
                        camera.aspect = canvas.clientWidth /  canvas.clientHeight;
                        camera.updateProjectionMatrix();
                        resolution = new THREE.Vector3(canvas.clientWidth, canvas.clientHeight, 1.0);
                    }
                    
                    frameCounter++;
                    
                    shader.uniforms['iResolution'].value = resolution;
                    shader.uniforms['iTimeDelta'].value = clock.getDelta();
                    shader.uniforms['iGlobalTime'].value = clock.getElapsedTime();
                    shader.uniforms['iFrame'].value = frameCounter;
                    shader.uniforms['iMouse'].value = mouse;

                    renderer.render(scene, camera);
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
}