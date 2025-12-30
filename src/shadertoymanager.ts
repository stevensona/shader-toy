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
    StartingData: RenderStartingData,
    Sequencer?: SequencerWebview
};
type StaticWebview = Webview & { Document: vscode.TextDocument };

type SequencerWebview = {
    Panel: vscode.WebviewPanel,
    Parent: Webview
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

        let carriedSequencer: SequencerWebview | undefined;
        if (this.webviewPanel) {
            carriedSequencer = this.webviewPanel.Sequencer;
            this.webviewPanel.Sequencer = undefined;
            this.webviewPanel.Panel.dispose();
        }
        const newWebviewPanel = this.createWebview('GLSL Preview', undefined);
        this.webviewPanel = {
            Panel: newWebviewPanel,
            StartingData: this.cloneStartingData(this.startingData),
        };
        this.attachDynamicDispose(newWebviewPanel);

        if (carriedSequencer) {
            carriedSequencer.Parent = this.webviewPanel;
            this.webviewPanel.Sequencer = carriedSequencer;
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
                this.staticWebviews.push({
                    Panel: newWebviewPanel,
                    StartingData: this.cloneStartingData(this.startingData),
                    Document: document,
                });
                const staticWebview = this.staticWebviews[this.staticWebviews.length - 1];
                this.staticWebviews[this.staticWebviews.length - 1] = await this.updateWebview(staticWebview, vscode.window.activeTextEditor.document);
                this.attachStaticDispose(newWebviewPanel);
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

        if (this.webviewPanel) {
            const dynamicPaused = this.webviewPanel.StartingData.Paused;
            this.webviewPanel.StartingData = new RenderStartingData();
            this.webviewPanel.StartingData.Paused = dynamicPaused;
        }
    };
    private resetPauseState = () => {
        this.startingData.Paused = false;

        if (this.webviewPanel) {
            this.webviewPanel.StartingData.Paused = false;
        }
    };

    private cloneStartingData = (source: RenderStartingData): RenderStartingData => {
        const data = new RenderStartingData();
        data.Time = source.Time;
        data.Paused = source.Paused;
        data.Mouse = source.Mouse;
        data.NormalizedMouse = source.NormalizedMouse;
        data.Keys = source.Keys;
        data.FlyControlPosition = source.FlyControlPosition;
        data.FlyControlRotation = source.FlyControlRotation;

        data.UniformsGui.Open = source.UniformsGui.Open;
        data.UniformsGui.Values = new Map(source.UniformsGui.Values);
        return data;
    };

    private getOwningPreview = (panel: vscode.WebviewPanel): Webview | undefined => {
        if (this.webviewPanel && this.webviewPanel.Panel === panel) {
            return this.webviewPanel;
        }
        const staticWebview = this.staticWebviews.find((w) => w.Panel === panel);
        return staticWebview;
    };

    private attachDynamicDispose = (panel: vscode.WebviewPanel) => {
        panel.onDidDispose(() => {
            if (!this.webviewPanel || this.webviewPanel.Panel !== panel) {
                return;
            }
            if (this.webviewPanel.Sequencer) {
                this.webviewPanel.Sequencer.Panel.dispose();
                this.webviewPanel.Sequencer = undefined;
            }
            this.webviewPanel = undefined;
        });
    };

    private attachStaticDispose = (panel: vscode.WebviewPanel) => {
        panel.onDidDispose(() => {
            const staticWebview = this.staticWebviews.find((w) => w.Panel === panel);
            if (!staticWebview) {
                return;
            }
            if (staticWebview.Sequencer) {
                staticWebview.Sequencer.Panel.dispose();
                staticWebview.Sequencer = undefined;
            }
            const index = this.staticWebviews.indexOf(staticWebview);
            this.staticWebviews.splice(index, 1);
        });
    };

    private setSequencerActiveOnPreview = (preview: Webview, active: boolean) => {
        preview.Panel.webview.postMessage({
            command: 'sequencerState',
            active: active
        });
    };

    private toggleSequencerPanel = async (sourcePanel: vscode.WebviewPanel) => {
        const preview = this.getOwningPreview(sourcePanel);
        if (!preview) {
            return;
        }

        if (preview.Sequencer) {
            preview.Sequencer.Panel.dispose();
            preview.Sequencer = undefined;
            this.setSequencerActiveOnPreview(preview, false);
            return;
        }

        const sequencerPanel = await this.createSequencerWebview(preview);
        preview.Sequencer = sequencerPanel;
        this.setSequencerActiveOnPreview(preview, true);

        // Seed current time.
        sequencerPanel.Panel.webview.postMessage({
            command: 'syncTime',
            time: preview.StartingData.Time
        });
    };

    private runBestEffortEditorCommand = async (command: string, args?: unknown): Promise<boolean> => {
        try {
            await vscode.commands.executeCommand(command, args);
            return true;
        } catch {
            return false;
        }
    };

    private ensureTLayout = async (): Promise<boolean> => {
        // Goal: keep two editors side-by-side on the top row (code left, preview right)
        // and create a bottom row group that spans the full width.
        // There is no stable public API that guarantees this shape across all versions,
        // so we try a few schema variants.
        const variants: Array<{ orientation: any, topOrientation: any }> = [
            { orientation: 1, topOrientation: 0 },
            { orientation: 0, topOrientation: 1 },
            { orientation: 'vertical', topOrientation: 'horizontal' },
            { orientation: 'horizontal', topOrientation: 'vertical' },
        ];

        for (const v of variants) {
            const layout = {
                orientation: v.orientation,
                groups: [
                    {
                        size: 0.7,
                        orientation: v.topOrientation,
                        groups: [
                            { size: 0.5 },
                            { size: 0.5 },
                        ],
                    },
                    { size: 0.3 },
                ],
            };

            if (await this.runBestEffortEditorCommand('vscode.setEditorLayout', layout)) {
                return true;
            }
        }

        return false;
    };

    private tryPlaceSequencerBelow = (panelToMove: vscode.WebviewPanel): void => {
        // Best-effort only: VS Code controls editor group layout.
        // These commands are UI-driven and can fail depending on VS Code version/layout.
        setTimeout(() => {
            const run = async () => {
                const tryCommand = this.runBestEffortEditorCommand;

                // Ensure the sequencer webview is the active editor.
                try {
                    panelToMove.reveal(panelToMove.viewColumn, false);
                } catch {
                    // ignore
                }

                // First try: if a below group already exists, just move the sequencer.
                if (
                    (await tryCommand('workbench.action.moveEditorToBelowGroup')) ||
                    (await tryCommand('moveActiveEditor', { to: 'down', by: 'group' })) ||
                    (await tryCommand('workbench.action.moveActiveEditor', { to: 'down', by: 'group' }))
                ) {
                    return;
                }

                // Second try: shape the layout into a "T" (two columns on top, one group below).
                // This avoids forcing a global "two rows" layout which tends to move the preview.
                await this.ensureTLayout();

                if (
                    (await tryCommand('workbench.action.moveEditorToBelowGroup')) ||
                    (await tryCommand('moveActiveEditor', { to: 'down', by: 'group' })) ||
                    (await tryCommand('workbench.action.moveActiveEditor', { to: 'down', by: 'group' }))
                ) {
                    return;
                }

                // Last resort: create a group below and then attempt the move again.
                await tryCommand('workbench.action.newGroupBelow');
                await tryCommand('workbench.action.moveEditorToBelowGroup');
            };

            void run();
        }, 150);
    };

    private createSequencerWebview = async (preview: Webview): Promise<SequencerWebview> => {
        const extensionRoot = vscode.Uri.file(this.context.getVscodeExtensionContext().extensionPath);

        // Best-effort: create the sequencer in a wide bottom group by
        // 1) making the preview the active editor
        // 2) switching to a "T" layout (two columns on top, one group below)
        // 3) focusing the below group
        // 4) creating the panel in the active group
        try {
            preview.Panel.reveal(preview.Panel.viewColumn, false);
        } catch {
            // ignore
        }

        await this.ensureTLayout();
        // Focus the below group if available (command ids differ across versions).
        await this.runBestEffortEditorCommand('workbench.action.focusBelowGroup');
        await this.runBestEffortEditorCommand('workbench.action.focusDownGroup');

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

        // If we still ended up in the top row, attempt the move-below fallbacks.
        if (
            panel.viewColumn === undefined ||
            panel.viewColumn === vscode.ViewColumn.One ||
            panel.viewColumn === vscode.ViewColumn.Two
        ) {
            this.tryPlaceSequencerBelow(panel);
        }

        const timelineSrc = this.context.getWebviewResourcePath(panel.webview, 'animation-timeline.min.js');

        panel.webview.html = `\
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    #sequencer { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="sequencer"></div>
  <script src="${timelineSrc}"></script>
  <script>
    (function () {
      const vscode = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : undefined;
      const host = document.getElementById('sequencer');
      if (!host || typeof timelineModule === 'undefined' || !timelineModule.Timeline) {
        return;
      }

      const timeline = new timelineModule.Timeline({ id: host });
      timeline.setModel({ rows: [{ keyframes: [] }] });
      timeline._formatUnitsText = (val) => {
        const seconds = (val || 0) / 1000;
        return seconds.toFixed(2) + ' s';
      };

      let syncing = false;

      timeline.onTimeChanged((event) => {
        if (!event || syncing) return;
        try {
          if (timelineModule.TimelineEventSource && event.source !== timelineModule.TimelineEventSource.User) {
            return;
          }
        } catch { /* ignore */ }

        const newTime = (event.val || 0) / 1000.0;
        if (vscode) {
          vscode.postMessage({ command: 'sequencerSetTime', time: newTime });
        }
      });

      window.addEventListener('message', (event) => {
        const message = event && event.data ? event.data : undefined;
        if (!message || !message.command) return;

        if (message.command === 'syncTime') {
          syncing = true;
          try {
            timeline.setTime((message.time || 0) * 1000);
          } catch { /* ignore */ }
          syncing = false;
        }
      });
    })();
  </script>
</body>
</html>`;

        const sequencer: SequencerWebview = {
            Panel: panel,
            Parent: preview
        };

        panel.onDidDispose(() => {
            const parent = sequencer.Parent;
            // Only clear if still attached.
            if (parent.Sequencer && parent.Sequencer.Panel === panel) {
                parent.Sequencer = undefined;
                this.setSequencerActiveOnPreview(parent, false);
            }
        });

        panel.webview.onDidReceiveMessage(
            (message: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                if (!message || !message.command) {
                    return;
                }

                switch (message.command) {
                case 'sequencerSetTime':
                    {
                        const parent = sequencer.Parent;
                        const newTime = message.time || 0;
                        parent.StartingData.Time = newTime;

                        // Keep legacy default in sync for portable preview and new panels.
                        if (this.webviewPanel && parent === this.webviewPanel) {
                            this.startingData.Time = newTime;
                        }

                        parent.Panel.webview.postMessage({
                            command: 'setTime',
                            time: newTime
                        });
                        return;
                    }
                }
            },
            undefined,
            this.context.getVscodeExtensionContext().subscriptions
        );

        return sequencer;
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
                if (message && message.command === 'toggleSequencerPanel') {
                    this.toggleSequencerPanel(newWebviewPanel);
                    return;
                }

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
                {
                    const preview = this.getOwningPreview(newWebviewPanel);
                    if (preview) {
                        preview.StartingData.Time = message.time;
                        if (this.webviewPanel && preview === this.webviewPanel) {
                            this.startingData.Time = message.time;
                        }
                        if (preview.Sequencer) {
                            preview.Sequencer.Panel.webview.postMessage({
                                command: 'syncTime',
                                time: preview.StartingData.Time
                            });
                        }
                    }
                    return;
                }
                case 'setPause':
                {
                    const preview = this.getOwningPreview(newWebviewPanel);
                    if (preview) {
                        preview.StartingData.Paused = message.paused;
                        if (this.webviewPanel && preview === this.webviewPanel) {
                            this.startingData.Paused = message.paused;
                        }
                    }
                    return;
                }
                case 'updateMouse':
                {
                    const preview = this.getOwningPreview(newWebviewPanel);
                    if (preview) {
                        preview.StartingData.Mouse = message.mouse;
                        preview.StartingData.NormalizedMouse = message.normalizedMouse;
                        if (this.webviewPanel && preview === this.webviewPanel) {
                            this.startingData.Mouse = message.mouse;
                            this.startingData.NormalizedMouse = message.normalizedMouse;
                        }
                    }
                    return;
                }
                case 'updateKeyboard':
                {
                    const preview = this.getOwningPreview(newWebviewPanel);
                    if (preview) {
                        preview.StartingData.Keys = message.keys;
                        if (this.webviewPanel && preview === this.webviewPanel) {
                            this.startingData.Keys = message.keys;
                        }
                    }
                    return;
                }
                case 'updateFlyControlTransform':
                {
                    const preview = this.getOwningPreview(newWebviewPanel);
                    if (preview) {
                        preview.StartingData.FlyControlPosition = message.position;
                        preview.StartingData.FlyControlRotation = message.rotation;
                        if (this.webviewPanel && preview === this.webviewPanel) {
                            this.startingData.FlyControlPosition = message.position;
                            this.startingData.FlyControlRotation = message.rotation;
                        }
                    }
                    return;
                }
                case 'updateUniformsGuiOpen':
                {
                    const preview = this.getOwningPreview(newWebviewPanel);
                    if (preview) {
                        preview.StartingData.UniformsGui.Open = message.value;
                        if (this.webviewPanel && preview === this.webviewPanel) {
                            this.startingData.UniformsGui.Open = message.value;
                        }
                    }
                    return;
                }
                case 'updateUniformsGuiValue':
                {
                    const preview = this.getOwningPreview(newWebviewPanel);
                    if (preview) {
                        preview.StartingData.UniformsGui.Values.set(message.name, message.value);
                        if (this.webviewPanel && preview === this.webviewPanel) {
                            this.startingData.UniformsGui.Values.set(message.name, message.value);
                        }
                    }
                    return;
                }
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
            const oldPanel = webviewPanel.Panel;
            webviewPanel.Panel = newWebviewPanel;
            if ((webviewPanel as StaticWebview).Document !== undefined) {
                this.attachStaticDispose(newWebviewPanel);
            }
            else {
                this.attachDynamicDispose(newWebviewPanel);
            }

            // Keep sequencer (if open) attached to this preview wrapper.
            if (webviewPanel.Sequencer) {
                webviewPanel.Sequencer.Panel.webview.postMessage({
                    command: 'syncTime',
                    time: webviewPanel.StartingData.Time
                });
            }

            oldPanel.dispose();
        }

        webviewPanel.Panel.webview.html = await webviewContentProvider.generateWebviewContent(webviewPanel.Panel.webview, webviewPanel.StartingData);

        if (webviewPanel.Sequencer) {
            this.setSequencerActiveOnPreview(webviewPanel, true);
        }
        return webviewPanel;
    };
}
