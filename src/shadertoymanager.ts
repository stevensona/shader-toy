'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RenderStartingData, DiagnosticBatch } from './typenames';
import { WebviewContentProvider } from './webviewcontentprovider';
import { Context } from './context';
import { removeDuplicates } from './utility';

type Webview = {
    Panel: vscode.WebviewPanel,
    OnDidDispose: () => void
};
type StaticWebview = Webview & {
    Document: vscode.TextDocument
};

export class ShaderToyManager {
    context: Context;

    startingData = new RenderStartingData();

    webviewPanel: Webview | undefined;
    staticWebviews: StaticWebview[] = [];

    constructor(context: Context) {
        this.context = context;
    }

    public migrateToNewContext = async (context: Context) => {
        this.context = context;
        if (this.webviewPanel && this.context.activeEditor) {
            await this.updateWebview(this.webviewPanel, this.context.activeEditor.document);
        }
        for (const staticWebview of this.staticWebviews) {
            await this.updateWebview(staticWebview, staticWebview.Document);
        }
    };

    public showDynamicPreview = async () => {
        if (this.context.getConfig<boolean>('reloadOnChangeEditor') !== true) {
            this.context.activeEditor = vscode.window.activeTextEditor;
        }

        if (this.webviewPanel) {
            this.webviewPanel.Panel.dispose();
        }
        const newWebviewPanel = this.createWebview('GLSL Preview', undefined);
        this.webviewPanel = {
            Panel: newWebviewPanel,
            OnDidDispose: () => {
                this.webviewPanel = undefined;
            }
        };
        newWebviewPanel.onDidDispose(this.webviewPanel.OnDidDispose);
        if (this.context.activeEditor !== undefined) {
            this.webviewPanel = await this.updateWebview(this.webviewPanel, this.context.activeEditor.document);
        }
        else {
            vscode.window.showErrorMessage('Select a TextEditor to show GLSL Preview.');
        }
    };

    public showStaticPreview = async () => {
        if (vscode.window.activeTextEditor !== undefined) {
            const document = vscode.window.activeTextEditor.document;
            if (this.staticWebviews.find((webview: StaticWebview) => { return webview.Document === document; }) === undefined) {
                const newWebviewPanel = this.createWebview('Static GLSL Preview', undefined);
                const onDidDispose = () => {
                    const staticWebview = this.staticWebviews.find((webview: StaticWebview) => { return webview.Panel === newWebviewPanel; });
                    if (staticWebview !== undefined) {
                        const index = this.staticWebviews.indexOf(staticWebview);
                        this.staticWebviews.splice(index, 1);
                    }
                };
                this.staticWebviews.push({
                    Panel: newWebviewPanel,
                    OnDidDispose: onDidDispose,
                    Document: document
                });
                const staticWebview = this.staticWebviews[this.staticWebviews.length - 1];
                this.staticWebviews[this.staticWebviews.length - 1] = await this.updateWebview(staticWebview, vscode.window.activeTextEditor.document);
                newWebviewPanel.onDidDispose(onDidDispose);
            }
        }
    };

    public createPortablePreview = async () => {
        if (vscode.window.activeTextEditor !== undefined) {
            const document = vscode.window.activeTextEditor.document;
            const webviewContentProvider = new WebviewContentProvider(this.context, document.getText(), document.fileName);
            await webviewContentProvider.parseShaderTree(false);
            const htmlContent = webviewContentProvider.generateWebviewContent(undefined, this.startingData);
            const originalFileExt = path.extname(document.fileName);
            const previewFilePath = document.fileName.replace(originalFileExt, '.html');
            fs.promises.writeFile(previewFilePath, await htmlContent)
                .catch((reason: { message: string }) => {
                    console.error(reason.message);
                });
        }
    };

    public onDocumentChanged = async (documentChange: vscode.TextDocumentChangeEvent) => {
        if (this.context.getConfig<boolean>('reloadAutomatically')) {
            const staticWebview = this.staticWebviews.find((webview: StaticWebview) => { return webview.Document === documentChange.document; });
            const isActiveDocument = this.context.activeEditor !== undefined && documentChange.document === this.context.activeEditor.document;
            if (isActiveDocument || staticWebview !== undefined) {
                if (this.webviewPanel !== undefined && this.context.activeEditor !== undefined) {
                    this.webviewPanel = await this.updateWebview(this.webviewPanel, this.context.activeEditor.document);
                }

                this.staticWebviews.map((staticWebview: StaticWebview) => this.updateWebview(staticWebview, staticWebview.Document));
            }
        }
    };

    public onEditorChanged = async (newEditor: vscode.TextEditor | undefined) => {
        if (newEditor !== undefined && newEditor.document.getText() !== '' && newEditor !== this.context.activeEditor) {
            this.context.activeEditor = newEditor;

            if (this.context.getConfig<boolean>('reloadAutomatically') && this.context.getConfig<boolean>('reloadOnChangeEditor')) {
                if (this.context.getConfig<boolean>('resetStateOnChangeEditor')) {
                    this.resetStartingData();
                }
                if (!this.context.getConfig<boolean>('pauseMaintainedOnReload')) {
                    this.resetPauseState();
                }
                if (this.webviewPanel !== undefined) {
                    this.webviewPanel = await this.updateWebview(this.webviewPanel, this.context.activeEditor.document);
                }
            }
        }
    };

    public postCommand = (command : string) => {
        if (this.webviewPanel !== undefined) {
            this.webviewPanel.Panel.webview.postMessage({command: command});
        }
        this.staticWebviews.forEach((webview: StaticWebview) => webview.Panel.webview.postMessage({command: command}));
    };

    private resetStartingData = () => {
        const paused = this.startingData.Paused;
        this.startingData = new RenderStartingData();
        this.startingData.Paused = paused;
    };
    private resetPauseState = () => {
        this.startingData.Paused = false;
    };

    private createWebview = (title: string, localResourceRoots: vscode.Uri[] | undefined) => {
        if (localResourceRoots !== undefined) {
            const extensionRoot = vscode.Uri.file(this.context.getVscodeExtensionContext().extensionPath);
            localResourceRoots.push(extensionRoot);
        }
        const options: vscode.WebviewOptions = {
            enableScripts: true,
            localResourceRoots: localResourceRoots
        };
        const newWebviewPanel = vscode.window.createWebviewPanel(
            'shadertoy',
            title,
            { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
            options
        );
        newWebviewPanel.iconPath = this.context.getResourceUri('thumb.png');
        newWebviewPanel.webview.onDidReceiveMessage(
            (message: any) => {
                switch (message.command) {
                case 'reloadWebview':
                    if (this.webviewPanel !== undefined && this.webviewPanel.Panel === newWebviewPanel && this.context.activeEditor !== undefined) {
                        this.updateWebview(this.webviewPanel, this.context.activeEditor.document);
                    }
                    else {
                        this.staticWebviews.forEach((staticWebview: StaticWebview) => {
                            if (staticWebview.Panel === newWebviewPanel) {
                                this.updateWebview(staticWebview, staticWebview.Document);
                            }
                        });
                    }
                    return;
                case 'updateTime':
                    this.startingData.Time = message.time;
                    return;
                case 'setPause':
                    this.startingData.Paused = message.paused;
                    return;
                case 'updateMouse':
                    this.startingData.Mouse = message.mouse;
                    this.startingData.NormalizedMouse = message.normalizedMouse;
                    return;
                case 'updateKeyboard':
                    this.startingData.Keys = message.keys;
                    return;
                case 'updateFlyControlTransform':
                    this.startingData.FlyControlPosition = message.position;
                    this.startingData.FlyControlRotation = message.rotation;
                    return;
                case 'updateUniformsGuiOpen':
                    this.startingData.UniformsGui.Open = message.value;
                    return;
                case 'updateUniformsGuiValue':
                    this.startingData.UniformsGui.Values.set(message.name, message.value);
                    return;
                case 'showGlslDiagnostic':
                {
                    const diagnosticBatch: DiagnosticBatch = message.diagnosticBatch;
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
                }
                case 'showGlslsError':
                {
                    const file: string = message.file;
                    const line: number = message.line;

                    this.context.revealLine(file, line);
                    return;
                }
                case 'errorMessage':
                    vscode.window.showErrorMessage(message.message);
                    return;
                }
            },
            undefined,
            this.context.getVscodeExtensionContext().subscriptions
        );
        return newWebviewPanel;
    };

    private updateWebview = async <T extends Webview | StaticWebview>(webviewPanel: T, document: vscode.TextDocument): Promise<T> => {
        this.context.clearDiagnostics();
        const webviewContentProvider = new WebviewContentProvider(this.context, document.getText(), document.fileName);
        const localResources = await webviewContentProvider.parseShaderTree(false);

        let localResourceRoots: string[] = [];
        for (const localResource of localResources) {
            const localResourceRoot = path.dirname(localResource);
            localResourceRoots.push(localResourceRoot);
        }
        localResourceRoots = removeDuplicates(localResourceRoots);

        // Recreate webview if allowed resource roots are not part of the current resource roots
        const previousLocalResourceRoots = webviewPanel.Panel.webview.options.localResourceRoots || [];
        const previousHadLocalResourceRoot = (localResourceRootAsUri: string) => {
            const foundElement = previousLocalResourceRoots.find(uri => uri.toString() === localResourceRootAsUri);
            return foundElement !== undefined;
        };
        const previousHadAllLocalResourceRoots = localResourceRoots.every(localResourceRoot => previousHadLocalResourceRoot(vscode.Uri.file(localResourceRoot).toString()));
        if (!previousHadAllLocalResourceRoots) {
            const localResourceRootsUri = localResourceRoots.map(localResourceRoot => vscode.Uri.file(localResourceRoot));
            const newWebviewPanel = this.createWebview(webviewPanel.Panel.title, localResourceRootsUri);
            webviewPanel.Panel.dispose();
            newWebviewPanel.onDidDispose(webviewPanel.OnDidDispose);
            webviewPanel.Panel = newWebviewPanel;
        }

        webviewPanel.Panel.webview.html = await webviewContentProvider.generateWebviewContent(webviewPanel.Panel.webview, this.startingData);
        return webviewPanel;
    };
}
