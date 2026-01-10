'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RenderStartingData, DiagnosticBatch } from './typenames';
import { WebviewContentProvider } from './webviewcontentprovider';
import { Context } from './context';
import { removeDuplicates } from './utility';
import { tryFocusOrCreateBelowGroup, tryMovePanelBelowGroup } from './sequencer/ux/vscode_ui_placement';
import { getSequencerPanelHtml } from './sequencer/sequencer_panel_html';

type Webview = {
    Panel: vscode.WebviewPanel,
    OnDidDispose: () => void
};
type StaticWebview = Webview & {
    Document: vscode.TextDocument
};

type SequencerWebview = {
    Panel: vscode.WebviewPanel,
    Parent: vscode.WebviewPanel
};

export class ShaderToyManager {
    context: Context;

    startingData = new RenderStartingData();

    private sequencerWebview: SequencerWebview | undefined;
    private lastSequencerTimeSyncAtMs = 0;
    private lastSequencerTimeSynced = Number.NaN;

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

        const carriedSequencer = this.sequencerWebview;
        if (this.webviewPanel) {
            this.webviewPanel.Panel.dispose();
        }
        const newWebviewPanel = this.createWebview('GLSL Preview', undefined);
        this.webviewPanel = {
            Panel: newWebviewPanel,
            OnDidDispose: () => {
                if (this.sequencerWebview && this.sequencerWebview.Parent === newWebviewPanel) {
                    this.sequencerWebview.Panel.dispose();
                    this.sequencerWebview = undefined;
                }
                this.webviewPanel = undefined;
            }
        };
        newWebviewPanel.onDidDispose(this.webviewPanel.OnDidDispose);

        if (carriedSequencer) {
            carriedSequencer.Parent = newWebviewPanel;
            this.sequencerWebview = carriedSequencer;
        }

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
                        if (this.sequencerWebview && this.sequencerWebview.Parent === newWebviewPanel) {
                            this.sequencerWebview.Panel.dispose();
                            this.sequencerWebview = undefined;
                        }
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

    private resetStartingData = () => {
        const paused = this.startingData.Paused;
        this.startingData = new RenderStartingData();
        this.startingData.Paused = paused;
    };
    private resetPauseState = () => {
        this.startingData.Paused = false;
    };

    private setSequencerButtonState = (previewPanel: vscode.WebviewPanel, active: boolean) => {
        previewPanel.webview.postMessage({
            command: 'sequencerState',
            active
        });
    };

    private syncSequencerTime = (time: number, force: boolean = false): void => {
        if (!this.sequencerWebview) {
            return;
        }

        const now = Date.now();
        if (!force) {
            if ((now - this.lastSequencerTimeSyncAtMs) < 33) {
                return;
            }
            if (isFinite(this.lastSequencerTimeSynced) && Math.abs(time - this.lastSequencerTimeSynced) < 0.0005) {
                return;
            }
        }

        this.lastSequencerTimeSyncAtMs = now;
        this.lastSequencerTimeSynced = time;
        try {
            this.sequencerWebview.Panel.webview.postMessage({
                command: 'syncTime',
                time
            });
        } catch {
            // ignore
        }
    };

    private toggleSequencerPanel = async (sourcePanel: vscode.WebviewPanel) => {
        // Close
        if (this.sequencerWebview) {
            const parent = this.sequencerWebview.Parent;
            this.sequencerWebview.Panel.dispose();
            this.sequencerWebview = undefined;
            this.setSequencerButtonState(parent, false);
            return;
        }

        // Open
        const sequencerPanel = await this.createSequencerWebview(sourcePanel);
        this.sequencerWebview = {
            Panel: sequencerPanel,
            Parent: sourcePanel,
        };

        try {
            sequencerPanel.reveal(sequencerPanel.viewColumn, false);
        }
        catch {
            // ignore
        }

        this.setSequencerButtonState(sourcePanel, true);
        this.syncSequencerTime(this.startingData.Time, true);
        sequencerPanel.webview.postMessage({
            command: 'syncPause',
            paused: this.startingData.Paused
        });
    };

    private createSequencerWebview = async (previewPanel: vscode.WebviewPanel): Promise<vscode.WebviewPanel> => {
        const extensionRoot = vscode.Uri.file(this.context.getVscodeExtensionContext().extensionPath);

        const forceUX = this.context.getConfig<boolean>('forceUX') !== false;

        try {
            previewPanel.reveal(previewPanel.viewColumn, false);
        }
        catch {
            // ignore
        }

        // Best-effort: try to focus/create a below group before creating the panel.
        if (forceUX) {
            await tryFocusOrCreateBelowGroup();
        }

        const panel = vscode.window.createWebviewPanel(
            'shadertoy-sequencer',
            'Sequencer',
            { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
            {
                enableScripts: true,
                localResourceRoots: [extensionRoot]
            }
        );
        panel.iconPath = this.context.getResourceUri('thumb.png');

        // If we still ended up in the top row, attempt a move-below fallback.
        if (forceUX && (panel.viewColumn === vscode.ViewColumn.One || panel.viewColumn === vscode.ViewColumn.Two)) {
            tryMovePanelBelowGroup(panel);
        }

        const timelineSrc = this.context.getWebviewResourcePath(panel.webview, 'animation-timeline.min.js');
        const sequencerPanelScriptSrc = this.context.getWebviewResourcePath(panel.webview, 'webview/sequencer_panel.js');
        panel.webview.html = getSequencerPanelHtml(timelineSrc, sequencerPanelScriptSrc);


        panel.onDidDispose(() => {
            if (this.sequencerWebview && this.sequencerWebview.Panel === panel) {
                const parent = this.sequencerWebview.Parent;
                this.sequencerWebview = undefined;
                this.setSequencerButtonState(parent, false);
            }
        });

        panel.webview.onDidReceiveMessage(
            (message: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                if (!message || !message.command) {
                    return;
                }

                if (message.command === 'sequencerSetTime') {
                    const newTime = message.time || 0;
                    this.startingData.Time = newTime;

                    // Update all active previews (dynamic + static) if they are open.
                    if (this.webviewPanel) {
                        this.webviewPanel.Panel.webview.postMessage({ command: 'setTime', time: newTime });
                    }
                    this.staticWebviews.forEach((w) => w.Panel.webview.postMessage({ command: 'setTime', time: newTime }));
                    return;
                }

                if (message.command === 'sequencerSetPaused') {
                    const paused: boolean = !!message.paused;
                    this.startingData.Paused = paused;

                    // Explicitly set pause state in all active previews.
                    if (this.webviewPanel) {
                        this.webviewPanel.Panel.webview.postMessage({ command: 'setPauseState', paused });
                    }
                    this.staticWebviews.forEach((w) => w.Panel.webview.postMessage({ command: 'setPauseState', paused }));

                    // Echo back to sequencer panel to keep UI consistent.
                    try {
                        panel.webview.postMessage({ command: 'syncPause', paused });
                    } catch {
                        // ignore
                    }
                    return;
                }
            },
            undefined,
            this.context.getVscodeExtensionContext().subscriptions
        );

        return panel;
    };

    private createWebview = (title: string, localResourceRoots: vscode.Uri[] | undefined, viewColumn: vscode.ViewColumn = vscode.ViewColumn.Two) => {
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
            { viewColumn, preserveFocus: true },
            options
        );
        newWebviewPanel.iconPath = this.context.getResourceUri('thumb.png');
        newWebviewPanel.webview.onDidReceiveMessage(
            (message: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                if (message && message.command === 'toggleSequencerPanel') {
                    void this.toggleSequencerPanel(newWebviewPanel).catch((err: unknown) => {
                        const detail = (err && typeof err === 'object' && 'message' in err)
                            ? String((err as { message?: unknown }).message)
                            : String(err);
                        vscode.window.showErrorMessage(`Shader Toy: failed to toggle Sequencer panel: ${detail}`);
                    });
                    return;
                }
                switch (message.command) {
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

                    this.syncSequencerTime(this.startingData.Time, false);
                    return;
                case 'setPause':
                    this.startingData.Paused = message.paused;

                    if (this.sequencerWebview) {
                        this.sequencerWebview.Panel.webview.postMessage({
                            command: 'syncPause',
                            paused: this.startingData.Paused
                        });
                    }
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
            const oldPanel = webviewPanel.Panel;
            const currentViewColumn = oldPanel.viewColumn ?? vscode.ViewColumn.Two;
            const newWebviewPanel = this.createWebview(webviewPanel.Panel.title, localResourceRootsUri, currentViewColumn);
            oldPanel.dispose();
            newWebviewPanel.onDidDispose(webviewPanel.OnDidDispose);
            webviewPanel.Panel = newWebviewPanel;

            if (this.sequencerWebview && this.sequencerWebview.Parent === oldPanel) {
                this.sequencerWebview.Parent = newWebviewPanel;
            }
        }

        webviewPanel.Panel.webview.html = await webviewContentProvider.generateWebviewContent(webviewPanel.Panel.webview, this.startingData);

        if (this.sequencerWebview && this.sequencerWebview.Parent === webviewPanel.Panel) {
            this.setSequencerButtonState(webviewPanel.Panel, true);
            this.syncSequencerTime(this.startingData.Time, true);
        }
        return webviewPanel;
    };
}
