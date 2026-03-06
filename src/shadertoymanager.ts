'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RenderStartingData, DiagnosticBatch } from './typenames';
import { WebviewContentProvider } from './webviewcontentprovider';
import { Context } from './context';
import { removeDuplicates } from './utility';
import { FramesPanel } from './framespanel';
import { ErrorsPanel } from './errorspanel';
import { analyzeShader } from './shaderanalysis';

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
    framesPanel: FramesPanel;
    private timingEnabled = false;
    errorsPanel: ErrorsPanel;
    private analysisDiagnosticCollection: vscode.DiagnosticCollection;
    private cachedCompileErrors: Map<string, Array<{ line: number; message: string; file?: string }>> = new Map();

    constructor(context: Context) {
        this.context = context;
        this.framesPanel = new FramesPanel(context);
        this.framesPanel.onDidDispose(() => {
            this.postTimingCommand(false);
        });
        this.framesPanel.onDidChangeVisibility((visible) => {
            this.postTimingCommand(visible);
        });
        this.errorsPanel = new ErrorsPanel(context);
        this.analysisDiagnosticCollection = vscode.languages.createDiagnosticCollection('shader-toy.analysis');
        this.context.getVscodeExtensionContext().subscriptions.push(this.analysisDiagnosticCollection);

        // Clear analysis diagnostics when errors panel is closed
        this.errorsPanel.onDidDispose(() => {
            this.analysisDiagnosticCollection.clear();
        });
    }

    public migrateToNewContext = async (context: Context) => {
        this.context = context;
        this.framesPanel.updateContext(context);
        this.errorsPanel.updateContext(context);
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
        this.onDocumentEvent(documentChange.document);
    };

    public onDocumentSaved = async (document: vscode.TextDocument) => {
        this.onDocumentEvent(document);
    };

    public onDocumentEvent = async (document: vscode.TextDocument) => {
        if (this.context.getConfig<boolean>('reloadAutomatically')) {
            const staticWebview = this.staticWebviews.find((webview: StaticWebview) => { return webview.Document === document; });
            const isActiveDocument = this.context.activeEditor !== undefined && document === this.context.activeEditor.document;
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

    public showFrameTimePanel = () => {
        this.framesPanel.show();
        this.postTimingCommand(true);
    };

    private postTimingCommand = (enable: boolean) => {
        this.timingEnabled = enable;
        const command = enable ? 'enableFrameTiming' : 'disableFrameTiming';
        if (this.webviewPanel !== undefined) {
            this.webviewPanel.Panel.webview.postMessage({ command });
        }
        this.framesPanel.postSetEnabled(enable);
    };

    public showErrorsPanel = () => {
        this.errorsPanel.show();

        // Post any cached compile errors accumulated before the panel was opened
        if (this.cachedCompileErrors.size > 0) {
            const allErrors: Array<{ line: number; message: string; file?: string }> = [];
            for (const errors of this.cachedCompileErrors.values()) {
                allErrors.push(...errors);
            }
            this.errorsPanel.postCompileErrors(allErrors);
        }

        // Run analysis on current document immediately
        if (this.context.activeEditor) {
            this.runShaderAnalysis(this.context.activeEditor.document);
        }
    };

    /**
     * Run static shader analysis and forward results to errors panel + diagnostics.
     */
    private runShaderAnalysis = (document: vscode.TextDocument) => {
        const source = document.getText();
        const warnings = analyzeShader(source);

        // Send to errors panel
        this.errorsPanel.postShaderWarnings(warnings);

        // Also emit as VSCode diagnostics (warnings)
        const diagnostics = warnings.map(w => {
            const range = new vscode.Range(w.line - 1, w.column - 1, w.line - 1, w.endColumn - 1);
            const diag = new vscode.Diagnostic(range, w.reason, vscode.DiagnosticSeverity.Warning);
            diag.source = `shader-analysis (${w.kind})`;
            return diag;
        });
        this.analysisDiagnosticCollection.set(document.uri, diagnostics);
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
            (message: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                switch (message.command) {
                case 'frameData': {
                    const isValidNumber = (value: unknown): value is number =>
                        typeof value === 'number' && Number.isFinite(value);

                    const { cpuMs, gpuMs, frameNumber } = message;

                    if (!isValidNumber(cpuMs) || !isValidNumber(gpuMs) || !isValidNumber(frameNumber)) {
                        return;
                    }

                    const clamp = (value: number, min: number, max: number): number =>
                        Math.min(Math.max(value, min), max);

                    if (this.framesPanel.isActive) {
                        this.framesPanel.postFrameData({
                            cpuMs: clamp(cpuMs, 0, 60000),
                            gpuMs: clamp(gpuMs, 0, 60000),
                            frameNumber: Math.max(0, Math.floor(frameNumber))
                        });
                    }
                    return;
                }
                case 'readDDSFile':
                {
                    const requestId: number = message.requestId;
                    const file: string | undefined = message.file;

                    const reply = (ok: boolean, payload: { base64?: string, error?: string }) => {
                        newWebviewPanel.webview.postMessage({
                            command: 'readDDSFileResult',
                            requestId,
                            ok,
                            ...payload
                        });
                    };

                    if (typeof requestId !== 'number' || typeof file !== 'string' || file.length === 0) {
                        reply(false, { error: 'Invalid readDDSFile request' });
                        return;
                    }

                    if (path.extname(file).toLowerCase() !== '.dds') {
                        reply(false, { error: 'Only .dds files are supported by readDDSFile' });
                        return;
                    }

                    const fileUri = vscode.Uri.file(file);
                    const roots = newWebviewPanel.webview.options.localResourceRoots ?? [];

                    const allowed = roots.some((root) => {
                        if (root.scheme !== 'file') {
                            return false;
                        }

                        const rootPath = root.fsPath;
                        const filePath = fileUri.fsPath;

                        // Normalize for Windows case-insensitive comparisons.
                        const rel = path.relative(rootPath, filePath);
                        if (!rel || rel === '') {
                            return true;
                        }
                        if (rel.startsWith('..') || path.isAbsolute(rel)) {
                            return false;
                        }
                        return true;
                    });

                    if (!allowed) {
                        reply(false, { error: 'Access denied: file is outside allowed webview roots' });
                        return;
                    }

                    vscode.workspace.fs.readFile(fileUri)
                        .then(
                            (data) => {
                                const base64 = Buffer.from(data).toString('base64');
                                reply(true, { base64 });
                            },
                            (err: {message?: string}) => {
                                reply(false, { error: err?.message ? String(err.message) : 'Failed to read file' });
                            }
                        );
                    return;
                }
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

                    // Cache and forward compile errors to the errors panel
                    if (message.type === 'error') {
                        const errors = diagnosticBatch.diagnostics.map((d: { line: number; message: string }) => ({
                            line: d.line,
                            message: d.message,
                            file: diagnosticBatch.filename
                        }));
                        this.cachedCompileErrors.set(diagnosticBatch.filename, errors);

                        if (this.errorsPanel.isActive) {
                            const allErrors: Array<{ line: number; message: string; file?: string }> = [];
                            for (const cached of this.cachedCompileErrors.values()) {
                                allErrors.push(...cached);
                            }
                            this.errorsPanel.postCompileErrors(allErrors);
                        }
                    }
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
        this.analysisDiagnosticCollection.delete(document.uri);
        this.cachedCompileErrors.clear();
        this.errorsPanel.clearErrors();
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

        // Re-send timing state after webview (re)load so FRAMES panel keeps receiving data
        if (this.timingEnabled && this.webviewPanel && webviewPanel.Panel === this.webviewPanel.Panel) {
            this.webviewPanel.Panel.webview.postMessage({ command: 'enableFrameTiming' });
        }

        // Run shader analysis if errors panel is active and this document is the active editor's document
        const activeEditor = vscode.window.activeTextEditor;
        if (this.errorsPanel.isActive &&
            activeEditor &&
            activeEditor.document.uri.toString() === document.uri.toString()) {
            this.runShaderAnalysis(document);
        }

        return webviewPanel;
    };
}
