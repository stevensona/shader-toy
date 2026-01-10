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
import type * as Types from './typenames';
import {
    SequencerProject,
    createSequencerProjectFromUniforms,
    evaluateProjectAtTime,
    addOrReplaceKey,
    moveKeyTime,
    setKeyValue,
    deleteKey,
} from './sequencer/sequencer_project';

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

    private sequencerProject: SequencerProject | undefined;

    private lastSequencerAppliedAtMs = 0;
    private lastSequencerAppliedTime = Number.NaN;

    private sequencerScrubbing = false;
    private scrubRestorePaused = false;

    private formatGlslScalar = (typeName: 'float' | 'int', value: number): string => {
        if (typeName === 'int') {
            if (typeof value !== 'number' || !isFinite(value)) {
                return '0';
            }
            return String(Math.round(value));
        }
        // float
        if (typeof value !== 'number' || !isFinite(value)) {
            return '0.0';
        }
        // Keep it readable and stable.
        let s = value.toFixed(6);
        s = s.replace(/0+$/, '');
        s = s.replace(/\.$/, '');
        if (!/[\.eE]/.test(s)) {
            s += '.0';
        }
        if (s === '-0.0') {
            s = '0.0';
        }
        return s;
    };

    private updateIUniformDefaultInDocument = async (panel: vscode.WebviewPanel, uniformName: string, value: number): Promise<void> => {
        if (!uniformName) {
            return;
        }
        const doc = (() => {
            // Dynamic preview: use active editor.
            if (this.webviewPanel && this.webviewPanel.Panel === panel) {
                return this.context.activeEditor?.document;
            }
            // Static preview: use mapped document.
            const s = this.staticWebviews.find((w) => w.Panel === panel);
            return s?.Document;
        })();

        if (!doc) {
            return;
        }

        const escapedName = uniformName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`^(\\s*#\\s*iUniform\\s+(float|int)\\s+${escapedName}\\s*=\\s*)([^\\s]+)(.*)$`);

        const edit = new vscode.WorkspaceEdit();
        let changed = false;

        for (let i = 0; i < doc.lineCount; i++) {
            const line = doc.lineAt(i);
            const m = line.text.match(re);
            if (!m) {
                continue;
            }
            const typeName = (m[2] === 'int' ? 'int' : 'float') as 'float' | 'int';
            const nextValue = this.formatGlslScalar(typeName, value);
            const nextLine = `${m[1]}${nextValue}${m[4]}`;
            if (nextLine !== line.text) {
                edit.replace(doc.uri, line.range, nextLine);
                changed = true;
            }
        }

        if (!changed) {
            return;
        }
        try {
            await vscode.workspace.applyEdit(edit);
        } catch {
            // ignore
        }
    };

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

            // Default-on: show the sequencer panel for the active preview.
            try {
                await this.openSequencerPanelIfNeeded(this.webviewPanel.Panel);
            } catch {
                // ignore
            }
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

                // Default-on: show the sequencer panel for the new static preview.
                try {
                    await this.openSequencerPanelIfNeeded(this.staticWebviews[this.staticWebviews.length - 1].Panel);
                } catch {
                    // ignore
                }
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

        this.postSequencerProject();
        this.applySequencerAtTime(this.startingData.Time);
    };

    private openSequencerPanelIfNeeded = async (sourcePanel: vscode.WebviewPanel): Promise<void> => {
        // If a sequencer panel is already open for this preview, do nothing.
        if (this.sequencerWebview && this.sequencerWebview.Parent === sourcePanel) {
            return;
        }

        // If a sequencer panel is open for a different preview, close it.
        if (this.sequencerWebview) {
            const parent = this.sequencerWebview.Parent;
            try {
                this.sequencerWebview.Panel.dispose();
            } catch {
                // ignore
            }
            this.sequencerWebview = undefined;
            try {
                this.setSequencerButtonState(parent, false);
            } catch {
                // ignore
            }
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
        try {
            sequencerPanel.webview.postMessage({
                command: 'syncPause',
                paused: this.startingData.Paused
            });
        } catch {
            // ignore
        }

        this.postSequencerProject();
        this.applySequencerAtTime(this.startingData.Time);
    };

    private postSequencerProject = (): void => {
        if (!this.sequencerWebview || !this.sequencerProject) {
            return;
        }
        try {
            this.sequencerWebview.Panel.webview.postMessage({
                command: 'sequencerProject',
                project: this.sequencerProject,
            });
        } catch {
            // ignore
        }
    };

    private applySequencerAtTime = (timeSec: number): void => {
        if (!this.sequencerProject) {
            return;
        }

        const evalResult = evaluateProjectAtTime(this.sequencerProject, timeSec);

        // Drive all open previews.
        const payload = {
            command: 'sequencerSetUniformValues',
            values: evalResult.byUniformName,
        };
        if (this.webviewPanel) {
            this.webviewPanel.Panel.webview.postMessage(payload);
        }
        this.staticWebviews.forEach((w) => w.Panel.webview.postMessage(payload));

        // If paused, request one frame so updates become visible even when pauseWholeRender is enabled.
        if (this.startingData.Paused) {
            const renderOneFrame = { command: 'renderOneFrame' };
            try {
                if (this.webviewPanel) {
                    this.webviewPanel.Panel.webview.postMessage(renderOneFrame);
                }
            } catch {
                // ignore
            }
            try {
                this.staticWebviews.forEach((w) => w.Panel.webview.postMessage(renderOneFrame));
            } catch {
                // ignore
            }
        }

        // Provide values to sequencer UI for display.
        if (this.sequencerWebview) {
            try {
                this.sequencerWebview.Panel.webview.postMessage({
                    command: 'sequencerTrackValues',
                    values: evalResult.byTrackId,
                });
            } catch {
                // ignore
            }
        }
    };

    private mergeSequencerProject = (next: SequencerProject): SequencerProject => {
        const prev = this.sequencerProject;
        if (!prev) {
            return next;
        }

        const prevTracksById = new Map<string, typeof prev.tracks[number]>();
        for (const t of prev.tracks) {
            prevTracksById.set(t.id, t);
        }

        return {
            ...next,
            tracks: next.tracks.map((t) => {
                const existing = prevTracksById.get(t.id);
                if (!existing) {
                    return t;
                }
                return {
                    ...t,
                    // Preserve user edits.
                    keys: Array.isArray(existing.keys) ? existing.keys : t.keys,
                    interpolation: existing.interpolation ?? t.interpolation,
                    stepMode: existing.stepMode ?? t.stepMode,
                    outOfRange: existing.outOfRange ?? t.outOfRange,
                };
            })
        };
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

                    this.applySequencerAtTime(newTime);
                    return;
                }

                if (message.command === 'sequencerBeginScrub') {
                    if (this.sequencerScrubbing) {
                        return;
                    }
                    this.sequencerScrubbing = true;
                    this.scrubRestorePaused = this.startingData.Paused;
                    this.startingData.Paused = true;

                    // Freeze preview time progression while the user is interacting.
                    if (this.webviewPanel) {
                        this.webviewPanel.Panel.webview.postMessage({ command: 'setPauseState', paused: true });
                    }
                    this.staticWebviews.forEach((w) => w.Panel.webview.postMessage({ command: 'setPauseState', paused: true }));

                    try {
                        panel.webview.postMessage({ command: 'syncPause', paused: true });
                    } catch {
                        // ignore
                    }
                    return;
                }

                if (message.command === 'sequencerEndScrub') {
                    if (!this.sequencerScrubbing) {
                        return;
                    }
                    this.sequencerScrubbing = false;
                    this.startingData.Paused = this.scrubRestorePaused;

                    if (this.webviewPanel) {
                        this.webviewPanel.Panel.webview.postMessage({ command: 'setPauseState', paused: this.startingData.Paused });
                    }
                    this.staticWebviews.forEach((w) => w.Panel.webview.postMessage({ command: 'setPauseState', paused: this.startingData.Paused }));

                    try {
                        panel.webview.postMessage({ command: 'syncPause', paused: this.startingData.Paused });
                    } catch {
                        // ignore
                    }
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

                if (message.command === 'sequencerAddKey') {
                    if (!this.sequencerProject) {
                        return;
                    }
                    const trackId: string = String(message.trackId || '');
                    const t: number = Number(message.t ?? this.startingData.Time);
                    const v: number = Number(message.v);
                    if (!trackId) {
                        return;
                    }
                    this.sequencerProject = addOrReplaceKey(this.sequencerProject, trackId, { t, v });
                    this.postSequencerProject();
                    this.applySequencerAtTime(this.startingData.Time);

                    // Mirror the edit back into the shader source (like #iUniform sliders).
                    try {
                        const track = this.sequencerProject.tracks.find((tr) => tr.id === trackId);
                        if (track && track.target && track.target.kind === 'uniform') {
                            void this.updateIUniformDefaultInDocument(previewPanel, track.target.uniformName, v);
                        }
                    } catch {
                        // ignore
                    }
                    return;
                }

                if (message.command === 'sequencerMoveKey') {
                    if (!this.sequencerProject) {
                        return;
                    }
                    const trackId: string = String(message.trackId || '');
                    const keyId: string = String(message.keyId || '');
                    const t: number = Number(message.t);
                    if (!trackId || !keyId) {
                        return;
                    }
                    this.sequencerProject = moveKeyTime(this.sequencerProject, trackId, keyId, t);
                    this.postSequencerProject();
                    this.applySequencerAtTime(this.startingData.Time);
                    return;
                }

                if (message.command === 'sequencerSetKeyValue') {
                    if (!this.sequencerProject) {
                        return;
                    }
                    const trackId: string = String(message.trackId || '');
                    const keyId: string = String(message.keyId || '');
                    const v: number = Number(message.v);
                    if (!trackId || !keyId) {
                        return;
                    }
                    this.sequencerProject = setKeyValue(this.sequencerProject, trackId, keyId, v);
                    this.postSequencerProject();
                    this.applySequencerAtTime(this.startingData.Time);

                    // Mirror the edit back into the shader source (like #iUniform sliders).
                    try {
                        const track = this.sequencerProject.tracks.find((tr) => tr.id === trackId);
                        if (track && track.target && track.target.kind === 'uniform') {
                            void this.updateIUniformDefaultInDocument(previewPanel, track.target.uniformName, v);
                        }
                    } catch {
                        // ignore
                    }
                    return;
                }

                if (message.command === 'sequencerDeleteKey') {
                    if (!this.sequencerProject) {
                        return;
                    }
                    const trackId: string = String(message.trackId || '');
                    const keyId: string = String(message.keyId || '');
                    if (!trackId || !keyId) {
                        return;
                    }
                    this.sequencerProject = deleteKey(this.sequencerProject, trackId, keyId);
                    this.postSequencerProject();
                    this.applySequencerAtTime(this.startingData.Time);
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
                    if (this.sequencerScrubbing) {
                        // While scrubbing, ignore preview time ticks so the playhead stays where the user puts it.
                        return;
                    }
                    this.startingData.Time = message.time;

                    this.syncSequencerTime(this.startingData.Time, false);

                    // Continuously apply sequencer values as time advances.
                    // Throttle a bit to avoid spamming messages on very high FPS.
                    if (this.sequencerProject) {
                        const now = Date.now();
                        const t = this.startingData.Time;
                        const timeDelta = isFinite(this.lastSequencerAppliedTime) ? Math.abs(t - this.lastSequencerAppliedTime) : Number.POSITIVE_INFINITY;
                        if ((now - this.lastSequencerAppliedAtMs) >= 30 || timeDelta >= 0.02) {
                            this.lastSequencerAppliedAtMs = now;
                            this.lastSequencerAppliedTime = t;
                            this.applySequencerAtTime(t);
                        }
                    }
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

        // Derive a sequencer project from parsed #iUniform float/int (scalar) declarations.
        try {
            const customUniforms: Types.UniformDefinition[] = webviewContentProvider.getCustomUniforms();
            const nextProject = createSequencerProjectFromUniforms(customUniforms, { displayFps: 60 });
            this.sequencerProject = this.mergeSequencerProject(nextProject);

            // Keep sequencer panel in sync if it's open for this preview.
            this.postSequencerProject();
            this.applySequencerAtTime(this.startingData.Time);
        } catch {
            // ignore
        }

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
