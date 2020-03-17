'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RenderStartingData, DiagnosticBatch } from './typenames';
import { WebviewContentProvider } from './webviewcontentprovider';
import { Context } from './context';

type StaticWebview = {
    WebviewPanel: vscode.WebviewPanel,
    Document: vscode.TextDocument
};

export class ShaderToyManager {
    context: Context;

    startingData = new RenderStartingData();

    webviewPanel: vscode.WebviewPanel | undefined;
    staticWebviews: StaticWebview[] = [];
    
    constructor(context: Context) {
        this.context = context;
    }

    public showDynamicPreview = () => {
        if (this.context.getConfig<boolean>('reloadOnChangeEditor') !== true) {
            this.context.activeEditor = vscode.window.activeTextEditor;
        }

        if (this.webviewPanel) {
            this.webviewPanel.dispose();
        }
        this.webviewPanel = this.createWebview('GLSL Preview');
        this.webviewPanel.onDidDispose(() => {
            this.webviewPanel = undefined;
        });
        if (this.context.activeEditor !== undefined) {
            this.updateWebview(this.webviewPanel, this.context.activeEditor.document);
        }
        else {
            vscode.window.showErrorMessage('Select a TextEditor to show GLSL Preview.');
        }
    }

    public showStaticPreview = () => {
        if (vscode.window.activeTextEditor !== undefined) {
            let document = vscode.window.activeTextEditor.document;
            if (this.staticWebviews.find((webview: StaticWebview) => { return webview.Document === document; }) === undefined) {
                let newWebviewPanel = this.createWebview('Static GLSL Preview');
                this.updateWebview(newWebviewPanel, vscode.window.activeTextEditor.document);
                this.staticWebviews.push({
                    WebviewPanel: newWebviewPanel,
                    Document: document
                });
                newWebviewPanel.onDidDispose(() => {
                    const staticWebview = this.staticWebviews.find((webview: StaticWebview) => { return webview.WebviewPanel === newWebviewPanel; });
                    if (staticWebview !== undefined) {
                        const index = this.staticWebviews.indexOf(staticWebview);
                        this.staticWebviews.splice(index, 1);
                    }
                });
            }
        }
    }

    public createPortablePreview = () => {
        if (vscode.window.activeTextEditor !== undefined) {
            let document = vscode.window.activeTextEditor.document;
            let webviewContentProvider = new WebviewContentProvider(this.context, document.getText(), document.fileName);
            let htmlContent = webviewContentProvider.generateWebviewConent(this.startingData, true);
            let originalFileExt = path.extname(document.fileName);
            let previewFilePath = document.fileName.replace(originalFileExt, '.html');
            fs.writeFileSync(previewFilePath, htmlContent);
        }
    }

    public onDocumentChanged = (documentChange: vscode.TextDocumentChangeEvent) => {
        const staticWebview = this.staticWebviews.find((webview: StaticWebview) => { return webview.Document === documentChange.document; });
        const isActiveDocument = this.context.activeEditor !== undefined && documentChange.document === this.context.activeEditor.document;
        if (isActiveDocument || staticWebview !== undefined) {
            if (this.webviewPanel !== undefined && this.context.activeEditor !== undefined) {
                this.updateWebview(this.webviewPanel, this.context.activeEditor.document);
            }

            for (let staticWebviewPanel of this.staticWebviews) {
                this.updateWebview(staticWebviewPanel.WebviewPanel, staticWebviewPanel.Document);
            }
        }
    }

    public onEditorChanged = (newEditor: vscode.TextEditor | undefined) => {
        if (newEditor !== undefined && newEditor.document.getText() !== '' && newEditor !== this.context.activeEditor) {
            if (this.context.getConfig<boolean>('resetStateOnChangeEditor')) {
                this.resetStartingData();
            }
            this.context.activeEditor = newEditor;
            if (this.webviewPanel !== undefined) {
                this.updateWebview(this.webviewPanel, this.context.activeEditor.document);
            }
        }
    }

    private resetStartingData = () => {
        this.startingData = new RenderStartingData();
    }

    private createWebview = (title: string) => {
        let options: vscode.WebviewOptions = {
            enableScripts: true,
            localResourceRoots: undefined
        };
        let newWebviewPanel = vscode.window.createWebviewPanel(
            'shadertoy',
            title,
            vscode.ViewColumn.Two,
            options
        );
        newWebviewPanel.iconPath = this.context.getResourceUri('thumb.png');
        newWebviewPanel.webview.onDidReceiveMessage(
            (message: any) => {
              switch (message.command) {
                case 'updateTime':
                    this.startingData.Time = message.time;
                    return;
                case 'updateMouse':
                    this.startingData.Mouse = message.mouse;
                    this.startingData.NormalizedMouse = message.normalizedMouse;
                    return;
                case 'updateKeyboard':
                    this.startingData.Keys = message.keys;
                    return;
                case 'updateUniformsGuiOpen':
                    this.startingData.UniformsGui.Open = message.value;
                    return;
                case 'updateUniformsGuiValue':
                    this.startingData.UniformsGui.Values[message.name] = message.value;
                    return;
                case 'showGlslDiagnostic':
                    let diagnosticBatch: DiagnosticBatch = message.diagnosticBatch;
                    let severity: vscode.DiagnosticSeverity;

                    switch (message.type) {
                        case 'error':
                            severity = vscode.DiagnosticSeverity.Error;
                            break;
                        case 'warning':
                            severity = vscode.DiagnosticSeverity.Warning;
                            break;
                        case 'hint':
                            severity = vscode.DiagnosticSeverity.Hint;
                            break;
                        case 'information':
                        default:
                            severity = vscode.DiagnosticSeverity.Information;
                            break;
                    }

                    this.context.showDiagnostics(diagnosticBatch, severity);
                    return;
                case 'showGlslsError': 
                    let file: string = message.file;
                    let line: number = message.line;

                    this.context.revealLine(file, line);
                    return;
                case 'errorMessage':
                    vscode.window.showErrorMessage(message.message);
                    return;
                }
            },
            undefined,
            this.context.getVscodeExtensionContext().subscriptions
        );
        return newWebviewPanel;
    }
    
    private updateWebview = (webviewPanel: vscode.WebviewPanel, document: vscode.TextDocument) => {
        this.context.clearDiagnostics();
        if (webviewPanel !== undefined) {
            let webviewContentProvider = new WebviewContentProvider(this.context, document.getText(), document.fileName);
            webviewPanel.webview.html = webviewContentProvider.generateWebviewConent(this.startingData, false);
        }
    }
}
