'use strict';

import * as vscode from 'vscode';
import * as compare_versions from 'compare-versions';
import { RenderStartingData } from './typenames';
import { WebviewContentProvider } from './webviewcontentprovider';
import { Context } from './context';

export function activate(extensionContext: vscode.ExtensionContext) {
    let shadertoyExtension = vscode.extensions.getExtension("stevensona.shader-toy");
    if (shadertoyExtension) {
        let lastVersion = extensionContext.globalState.get<string>("version") || '0.0.0';
        let currentVersion = <string | undefined>shadertoyExtension.packageJSON.version || '9.9.9';
        if (compare_versions(currentVersion, lastVersion) > 0) {
            vscode.window.showInformationMessage("Your ShaderToy version just got updated, check out the readme to see what's new.");
            extensionContext.globalState.update("version", currentVersion);
        }
    }

    let context = new Context(extensionContext, vscode.workspace.getConfiguration('shader-toy'));

    if (context.getConfig<boolean>("omitDeprecationWarnings") === true) {
        vscode.window.showWarningMessage("Deprecation warnings are omitted, stay safe otherwise!");
    }

    let webviewPanel: vscode.WebviewPanel | undefined = undefined;
    let reloadDelay: number = context.getConfig<number>('reloadOnEditTextDelay') || 1.0;
    let timeout: NodeJS.Timeout;
    let activeEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;

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
                    if (changingEditor !== undefined && activeEditor !== undefined && changingEditor.document === activeEditor.document) {
                        updateWebview();
                    }
                }, reloadDelay * 1000);
            });
        }
        if (context.getConfig<boolean>('reloadOnChangeEditor')) {
            changeEditorEvent = vscode.window.onDidChangeActiveTextEditor((swappedEditor: vscode.TextEditor | undefined) => {
                if (swappedEditor !== undefined && swappedEditor.document.getText() !== "" && swappedEditor !== activeEditor) {
                    if (context.getConfig<boolean>('resetStateOnChangeEditor')) {
                        resetStartingData();
                    }
                    activeEditor = swappedEditor;
                    updateWebview();
                }
            });
        }
    };

    registerCallbacks();

    let startingData = new RenderStartingData();
    const updateWebview = () => {
        if (webviewPanel !== undefined && activeEditor !== undefined) {
            webviewPanel.webview.html = new WebviewContentProvider(context, activeEditor.document.getText(), activeEditor.document.fileName)
                .generateWebviewConent(startingData.Time, startingData.Mouse, startingData.NormalizedMouse, startingData.Keys);
        }
        else if (webviewPanel !== undefined) {
            vscode.window.showErrorMessage("Select a TextEditor to show GLSL Preview.");
        }
    };
    const resetStartingData = () => {
        startingData = new RenderStartingData();
    };

    vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
        if (e.affectsConfiguration("shader-toy")) {
            context = new Context(extensionContext, vscode.workspace.getConfiguration('shader-toy'));
            registerCallbacks();
            updateWebview();
        }
    });

    let previewCommand = vscode.commands.registerCommand('shader-toy.showGlslPreview', () => {
        if (context.getConfig<boolean>('reloadOnChangeEditor') !== true) {
            activeEditor = vscode.window.activeTextEditor;
        }

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
        webviewPanel.iconPath = context.getResourceUri('thumb.png');
        updateWebview();

        let revealLine = (file: string, line: number) => {
            let highlightLine = (document: vscode.TextDocument, line: number) => {
                let range = document.lineAt(line - 1).range;
                vscode.window.showTextDocument(document, vscode.ViewColumn.One, true)
                    .then((editor: vscode.TextEditor) => {
                        editor.selection = new vscode.Selection(range.start, range.end);
                        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
                    });
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
        };

        let diagnosticCollection: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection('shader-toy.errors');
        type Diagnostic = {
            line: number,
            message: string
        };
        type DiagnosticBatch = {
            filename: string,
            diagnostics: Diagnostic[]
        };
        let showDiagnostics = (diagnosticBatch: DiagnosticBatch, severity: vscode.DiagnosticSeverity) => {
            if (activeEditor) {
                let currentFile = activeEditor.document.fileName;
                currentFile = currentFile.replace(/\\/g, '/');
                if (currentFile === diagnosticBatch.filename) {
                    let collectedDiagnostics: vscode.Diagnostic[] = [];
                    for (let diagnostic of diagnosticBatch.diagnostics) {
                        let range = activeEditor.document.lineAt(diagnostic.line - 1).range;
                        collectedDiagnostics.push(new vscode.Diagnostic(range, diagnostic.message, severity));
                    }
                    diagnosticCollection.set(activeEditor.document.uri, collectedDiagnostics);
                    return;
                }
            }
        };

        webviewPanel.webview.onDidReceiveMessage(
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

                    showDiagnostics(diagnosticBatch, severity);
                    return;
                case 'showGlslsError': 
                    let file: string = message.file;
                    let line: number = message.line;

                    revealLine(file, line);
                    return;
                case 'errorMessage':
                    vscode.window.showErrorMessage(message.message);
                    return;
                }
            },
            undefined,
            extensionContext.subscriptions
        );
    });
    
    extensionContext.subscriptions.push(previewCommand);
}
export function deactivate() {
}
