'use strict';

import * as vscode from 'vscode';
import * as compare_versions from 'compare-versions';
import * as fs from 'fs';
import * as path from 'path';
import { RenderStartingData, DiagnosticBatch } from './typenames';
import { WebviewContentProvider } from './webviewcontentprovider';
import { Context } from './context';

export function activate(extensionContext: vscode.ExtensionContext) {
    let shadertoyExtension = vscode.extensions.getExtension('stevensona.shader-toy');
    if (shadertoyExtension) {
        let lastVersion = extensionContext.globalState.get<string>('version') || '0.0.0';
        let currentVersion = <string | undefined>shadertoyExtension.packageJSON.version || '9.9.9';
        if (compare_versions(currentVersion, lastVersion) > 0) {
            vscode.window.showInformationMessage('Your ShaderToy version just got updated, check out the readme to see what\'s new.');
            extensionContext.globalState.update('version', currentVersion);
        }
    }

    let context = new Context(extensionContext, vscode.workspace.getConfiguration('shader-toy'));

    if (context.getConfig<boolean>('omitDeprecationWarnings') === true) {
        vscode.window.showWarningMessage('Deprecation warnings are omitted, stay safe otherwise!');
    }

    let webviewPanel: vscode.WebviewPanel | undefined = undefined;
    let reloadDelay: number = context.getConfig<number>('reloadOnEditTextDelay') || 1.0;
    let timeout: NodeJS.Timeout;

    let changeTextEvent: vscode.Disposable | undefined;
    let changeEditorEvent: vscode.Disposable | undefined;

    let registerCallbacks = () => {
        if (changeTextEvent !== undefined) {
            changeTextEvent.dispose();
        }
        if (changeEditorEvent !== undefined) {
            changeEditorEvent.dispose();
        }

        if (context.getConfig<boolean>('reloadOnEditText')) {
            changeTextEvent = vscode.workspace.onDidChangeTextDocument((changingEditor: vscode.TextDocumentChangeEvent) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => { 
                    if (changingEditor !== undefined) {
                        const staticWebview = staticWebviews.find((webview: StaticWebview) => { return webview.Document === changingEditor.document; });
                        const isActiveDocument = context.activeEditor !== undefined && changingEditor.document === context.activeEditor.document;
                        if (isActiveDocument || staticWebview !== undefined) {
                            if (webviewPanel !== undefined && context.activeEditor !== undefined) {
                                updateWebview(webviewPanel, context.activeEditor.document);
                            }

                            for (let staticWebviewPanel of staticWebviews) {
                                updateWebview(staticWebviewPanel.WebviewPanel, staticWebviewPanel.Document);
                            }
                        }
                    }

                }, reloadDelay * 1000);
            });
        }
        if (context.getConfig<boolean>('reloadOnChangeEditor')) {
            changeEditorEvent = vscode.window.onDidChangeActiveTextEditor((swappedEditor: vscode.TextEditor | undefined) => {
                if (swappedEditor !== undefined && swappedEditor.document.getText() !== '' && swappedEditor !== context.activeEditor) {
                    if (context.getConfig<boolean>('resetStateOnChangeEditor')) {
                        resetStartingData();
                    }
                    context.activeEditor = swappedEditor;
                    if (webviewPanel !== undefined) {
                        updateWebview(webviewPanel, context.activeEditor.document);
                    }
                }
            });
        }
    };

    registerCallbacks();

    let startingData = new RenderStartingData();
    const updateWebview = (webview: vscode.WebviewPanel, document: vscode.TextDocument) => {
        context.clearDiagnostics();
        if (webview !== undefined) {
            let webviewContentProvider = new WebviewContentProvider(context, document.getText(), document.fileName);
            webview.webview.html = webviewContentProvider.generateWebviewConent(startingData, false);
        }
    };
    const resetStartingData = () => {
        startingData = new RenderStartingData();
    };

    vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
        if (e.affectsConfiguration('shader-toy')) {
            context = new Context(extensionContext, vscode.workspace.getConfiguration('shader-toy'));
            registerCallbacks();
            if (context.activeEditor !== undefined && webviewPanel !== undefined) {
                updateWebview(webviewPanel, context.activeEditor.document);
            }
        }
    });

    let createWebview = (title: string) => {
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
        newWebviewPanel.iconPath = context.getResourceUri('thumb.png');
        newWebviewPanel.webview.onDidReceiveMessage(
            (message: any) => {
              switch (message.command) {
                case 'updateTime':
                    startingData.Time = message.time;
                    return;
                case 'updateMouse':
                    startingData.Mouse = message.mouse;
                    startingData.NormalizedMouse = message.normalizedMouse;
                    return;
                case 'updateKeyboard':
                    startingData.Keys = message.keys;
                    return;
                case 'updateUniformsGuiOpen':
                    startingData.UniformsGui.Open = message.value;
                    return;
                case 'updateUniformsGuiValue':
                    startingData.UniformsGui.Values[message.name] = message.value;
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

                    context.showDiagnostics(diagnosticBatch, severity);
                    return;
                case 'showGlslsError': 
                    let file: string = message.file;
                    let line: number = message.line;

                    context.revealLine(file, line);
                    return;
                case 'errorMessage':
                    vscode.window.showErrorMessage(message.message);
                    return;
                }
            },
            undefined,
            extensionContext.subscriptions
        );
        return newWebviewPanel;
    };

    let previewCommand = vscode.commands.registerCommand('shader-toy.showGlslPreview', () => {
        if (context.getConfig<boolean>('reloadOnChangeEditor') !== true) {
            context.activeEditor = vscode.window.activeTextEditor;
        }

        if (webviewPanel) {
            webviewPanel.dispose();
        }
        webviewPanel = createWebview('GLSL Preview');
        webviewPanel.onDidDispose(() => {
            webviewPanel = undefined;
        });
        if (context.activeEditor !== undefined) {
            updateWebview(webviewPanel, context.activeEditor.document);
        }
        else {
            vscode.window.showErrorMessage('Select a TextEditor to show GLSL Preview.');
        }
    });

    type StaticWebview = {
        WebviewPanel: vscode.WebviewPanel,
        Document: vscode.TextDocument
    };
    let staticWebviews: StaticWebview[] = [];
    let staticPreviewCommand = vscode.commands.registerCommand('shader-toy.showStaticGlslPreview', () => {      
        if (vscode.window.activeTextEditor !== undefined) {
            let document = vscode.window.activeTextEditor.document;
            if (staticWebviews.find((webview: StaticWebview) => { return webview.Document === document; }) === undefined) {
                let newWebviewPanel = createWebview('Static GLSL Preview');
                updateWebview(newWebviewPanel, vscode.window.activeTextEditor.document);
                staticWebviews.push({
                    WebviewPanel: newWebviewPanel,
                    Document: document
                });
                newWebviewPanel.onDidDispose(() => {
                    const staticWebview = staticWebviews.find((webview: StaticWebview) => { return webview.WebviewPanel === newWebviewPanel; });
                    if (staticWebview !== undefined) {
                        const index = staticWebviews.indexOf(staticWebview);
                        staticWebviews.splice(index, 1);
                    }
                });
            }
        }
    });
    
    let standaloneCompileCommand = vscode.commands.registerCommand('shader-toy.createPortableGlslPreview', () => {      
        if (vscode.window.activeTextEditor !== undefined) {
            let document = vscode.window.activeTextEditor.document;
            let webviewContentProvider = new WebviewContentProvider(context, document.getText(), document.fileName);
            let htmlContent = webviewContentProvider.generateWebviewConent(startingData, true);
            let originalFileExt = path.extname(document.fileName);
            let previewFilePath = document.fileName.replace(originalFileExt, '.html');
            fs.writeFileSync(previewFilePath, htmlContent);
        }
    });
    
    extensionContext.subscriptions.push(previewCommand);
    extensionContext.subscriptions.push(staticPreviewCommand);
    extensionContext.subscriptions.push(standaloneCompileCommand);
}
export function deactivate() {
}
