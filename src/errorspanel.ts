'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import { Context } from './context';
import { ShaderWarning, WARNING_CATEGORIES } from './shaderanalysis';

/**
 * Manages a separate webview panel that displays shader compile errors,
 * static analysis warnings, and runtime pixel error detection results.
 *
 * Architecture:
 *   Preview Webview  →(compileErrors)→  Extension Host  →(errors)→  Errors Panel
 *   Extension Host   →(shaderWarnings)→  Errors Panel
 *
 * Port of FragCoord v0.7.1 errors feature.
 */
export class ErrorsPanel {
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
            'shadertoy.errors',
            'Shader Errors',
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

        // Handle messages from the errors panel
        this.panel.webview.onDidReceiveMessage(
            (message: { command: string; file?: string; line?: number }) => {
                switch (message.command) {
                case 'navigateToLine':
                    if (message.line !== undefined) {
                        const file = message.file || this.getActiveFile();
                        if (file) {
                            this.context.revealLine(file, message.line);
                        }
                    }
                    break;
                }
            },
            undefined,
            this.context.getVscodeExtensionContext().subscriptions
        );
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
     * Forward compile errors from the preview webview.
     */
    public postCompileErrors(errors: Array<{ line: number; message: string; file?: string }>): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'compileErrors',
                errors: errors
            });
        }
    }

    /**
     * Forward shader analysis warnings.
     */
    public postShaderWarnings(warnings: ShaderWarning[]): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'shaderWarnings',
                warnings: warnings.map(w => ({
                    kind: w.kind,
                    line: w.line,
                    column: w.column,
                    endColumn: w.endColumn,
                    label: w.label,
                    reason: w.reason,
                    color: WARNING_CATEGORIES[w.kind]?.color || '#888'
                }))
            });
        }
    }

    /**
     * Forward runtime NaN/Inf/OOR detection results.
     */
    public postRuntimeErrors(result: {
        hasNan: boolean; hasInf: boolean; hasOor: boolean;
        nanPixels: number; infPixels: number; oorPixels: number;
        totalSampled: number;
    }): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'nanDetected',
                ...result
            });
        }
    }

    /**
     * Clear all errors in the panel (e.g., on shader reload).
     */
    public clearErrors(): void {
        if (this.panel) {
            this.panel.webview.postMessage({ command: 'clearErrors' });
        }
    }

    private getActiveFile(): string | undefined {
        return this.context.activeEditor?.document.fileName;
    }

    private getHtmlContent(): string {
        const htmlPath = this.context.getResourceUri('errors_panel.html').fsPath;
        return fs.readFileSync(htmlPath, 'utf8');
    }
}
