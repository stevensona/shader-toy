'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {Uri, commands, window, workspace, ExtensionContext, Event, EventEmitter, TextDocument, TextDocumentChangeEvent, ViewColumn } from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {

    let previewUri = Uri.parse('glsl-preview://authority/glsl-preview');

    class TextDocumentContentProvider implements TextDocumentContentProvider {
        private _onDidChange = new EventEmitter<Uri>();

        public provideTextDocumentContent(uri: Uri): string {
            let shader = window.activeTextEditor.document.getText();

            // http://threejs.org/docs/api/renderers/webgl/WebGLProgram.html
            return `
                <head>
                <style>
                    html, body, #canvas {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    height: 100%;
                    display: block;
                    }
                </style>
                </head>
                <body>
                    <div id="container"></div>
                </body>

                <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r73/three.min.js"></script>
                <canvas id="canvas"></canvas>
                <script id="vs" type="x-shader/x-vertex">
                    void main() {
                        gl_Position = vec4(position, 1.0);
                    }
                </script>
                <script id="fs" type="x-shader/x-fragment">
                    uniform vec3    iResolution;
                    uniform float   iGlobalTime;
                    uniform float   iTimeDelta;

                    ${shader}
                </script>

                <script type="text/javascript">
                    var canvas = document.getElementById('canvas');
                    var scene = new THREE.Scene();
                    var renderer = new THREE.WebGLRenderer({canvas: canvas, antialias: true});
                    var camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientWidth, 1, 1000);
                    var clock = new THREE.Clock();
                    var resolution = new THREE.Vector3(canvas.clientWidth, canvas.clientHeight, 1.0);
                    var shader = new THREE.ShaderMaterial({
                            vertexShader: document.getElementById('vs').textContent,
                            fragmentShader: document.getElementById('fs').textContent,
                            depthWrite: false,
                            depthTest: false,
                            uniforms: {
                              iResolution: { type: "v3", value: resolution },
                              iGlobalTime: { type: "f", value: 0.0 },
                              iTimeDelta: { type: "f", value: 0.0 }
                            }
                        });

                    var quad = new THREE.Mesh(
                        new THREE.PlaneGeometry(2, 2),
                        shader
                    );
                    scene.add(quad);

                    camera.position.z = 200;

                    render();

                    function render() {
                        requestAnimationFrame(render);
                        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
                            renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
                            camera.aspect = canvas.clientWidth /  canvas.clientHeight;
                            camera.updateProjectionMatrix();
                            resolution = new THREE.Vector3(canvas.clientWidth, canvas.clientHeight, 1.0);
                        }
                        
                        
                        shader.uniforms['iResolution'].value = resolution;
                        shader.uniforms['iGlobalTime'].value = clock.getElapsedTime();
                        shader.uniforms['iTimeDelta'].value = clock.getDelta();

                        renderer.render(scene, camera);
                    }
                </script>
            `
        }

        get onDidChange(): Event<Uri> {
            return this._onDidChange.event;
        }

        public update(uri: Uri) {
            this._onDidChange.fire(uri);
        }
    }

    let provider = new TextDocumentContentProvider();
    let registration = workspace.registerTextDocumentContentProvider('glsl-preview', provider);
    
    workspace.onDidChangeTextDocument((e: TextDocumentChangeEvent) => {
        if(e.document === window.activeTextEditor.document) {
            provider.update(previewUri);
        }
    });
    let disposable = commands.registerCommand('extension.showGlslPreview', () => {
        return commands.executeCommand('vscode.previewHtml', previewUri, ViewColumn.Two, 'GLSL Preview')
        .then((success) => {}, (reason) => { window.showErrorMessage(reason); });
    });
    
    context.subscriptions.push(disposable, registration);
}

// this method is called when your extension is deactivated
export function deactivate() {
}