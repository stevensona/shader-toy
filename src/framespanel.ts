'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import { Context } from './context';

/**
 * Manages a separate webview panel that displays a real-time
 * frame-timing performance graph.
 *
 * Architecture:
 *   Preview Webview  →(frameData)→  Extension Host  →(frameData)→  Frames Panel
 *
 * Port of FragCoord v0.7.1 frame-time graph.
 */
export class FramesPanel {
    private panel: vscode.WebviewPanel | undefined;
    private context: Context;

    constructor(context: Context) {
        this.context = context;
    }

    public show(): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside, true);
            return;
        }

        const extensionRoot = vscode.Uri.file(
            this.context.getVscodeExtensionContext().extensionPath
        );

        this.panel = vscode.window.createWebviewPanel(
            'shadertoy.frameTime',
            'Frame Timing',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            {
                enableScripts: true,
                localResourceRoots: [extensionRoot]
            }
        );

        this.panel.iconPath = this.context.getResourceUri('thumb.png');
        this.panel.webview.html = this.getHtmlContent();

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, undefined, this.context.getVscodeExtensionContext().subscriptions);

        // When the panel becomes visible, tell preview to start timing
        this.panel.onDidChangeViewState(() => {
            // No-op for now; timing is always-on when panel exists
        }, undefined, this.context.getVscodeExtensionContext().subscriptions);
    }

    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
    }

    public get isVisible(): boolean {
        return this.panel !== undefined && this.panel.visible;
    }

    public get isActive(): boolean {
        return this.panel !== undefined;
    }

    /**
     * Forward a frameData message from the preview webview to the frames panel.
     */
    public postFrameData(message: { cpuMs: number; gpuMs: number; frameNumber: number }): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'frameData',
                cpuMs: message.cpuMs,
                gpuMs: message.gpuMs,
                frameNumber: message.frameNumber
            });
        }
    }

    private getHtmlContent(): string {
        const htmlPath = this.context.getResourceUri('frames_panel.html').fsPath;
        return fs.readFileSync(htmlPath, 'utf8');
    }
}
