'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { RenderStartingData } from'./typenames';
import { WebviewContentProvider } from'./webviewcontentprovider';

export function activate(context: vscode.ExtensionContext) {
    let webviewPanel: vscode.WebviewPanel | undefined = undefined;
    let config = vscode.workspace.getConfiguration('shader-toy');
    let reloadDelay: number = config.get<number>('reloadOnEditTextDelay') || 1.0;
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

        if (config.get<boolean>('reloadOnEditText')) {
            changeTextEvent = vscode.workspace.onDidChangeTextDocument((changingEditor: vscode.TextDocumentChangeEvent) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => { 
                    if (changingEditor !== undefined && activeEditor !== undefined && changingEditor.document === activeEditor.document) {
                        updateWebview();
                    }
                }, reloadDelay * 1000);
            });
        }
        if (config.get<boolean>('reloadOnChangeEditor')) {
            changeEditorEvent = vscode.window.onDidChangeActiveTextEditor((swappedEditor: vscode.TextEditor | undefined) => {
                if (swappedEditor !== undefined && swappedEditor.document.getText() !== "" && swappedEditor !== activeEditor) {
                    if (config.get<boolean>('resetStateOnChangeEditor')) {
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
            webviewPanel.webview.html = new WebviewContentProvider(context, config, activeEditor)
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
            config = vscode.workspace.getConfiguration('shader-toy');
            registerCallbacks();
            updateWebview();
        }
    });

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
        webviewPanel.iconPath = vscode.Uri.file(
            path.join(context.extensionPath, 'resources', 'thumb.png')
        );

        updateWebview();
        
        let revealLine = (file: string, line: number) => {
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
                case 'showGlslsError':
                    let file: string = message.file;
                    let line: number = message.line;

                    revealLine(file, line);
                    return;
                }
            },
            undefined,
            context.subscriptions
        );
    });
    
    context.subscriptions.push(previewCommand);
}
export function deactivate() {
}
