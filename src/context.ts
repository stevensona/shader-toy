'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { DiagnosticBatch } from './typenames';

export class Context {
    private context: vscode.ExtensionContext;
    private config: vscode.WorkspaceConfiguration;

    private diagnosticCollection: vscode.DiagnosticCollection;
    private collectedDiagnostics: { [id: string]: vscode.Diagnostic[]; } = {};
    
    public activeEditor: vscode.TextEditor | undefined;
    
    constructor(context: vscode.ExtensionContext, config: vscode.WorkspaceConfiguration) {
        this.context = context;
        this.config = config;
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('shader-toy.errors');
        this.activeEditor = vscode.window.activeTextEditor;
    }

    public makeUri(file: string): vscode.Uri {
        return vscode.Uri.file(file);
    }
    public getResourceUri(file: string): vscode.Uri {
        return this.makeUri(
            path.join(this.context.extensionPath, 'resources', file)
        );
    }
    public makeWebviewResource(resourceUri: vscode.Uri): vscode.Uri {
        return resourceUri.with({ scheme: 'vscode-resource' });
    }
    public getWebviewResourcePath(file: string): string {
        const resourceUri = this.getResourceUri(file);
        const webviewResourceUri = this.makeWebviewResource(resourceUri);
        return webviewResourceUri.toString();
    }

    public showErrorMessage(message: string) {
        vscode.window.showErrorMessage(message);
    }

    public clearDiagnostics() {
        this.collectedDiagnostics = {};
        this.diagnosticCollection.clear();
    }
    public showDiagnostics(diagnosticBatch: DiagnosticBatch, severity: vscode.DiagnosticSeverity) {
        let file = diagnosticBatch.filename;
        let newDocument = vscode.workspace.openTextDocument(file);
        newDocument.then((document: vscode.TextDocument) => {
            if (this.collectedDiagnostics[file] === undefined) {
                this.collectedDiagnostics[file] = [];
            }
            
            for (let diagnostic of diagnosticBatch.diagnostics) {
                let line = Math.max(1, diagnostic.line) - 1;
                let range = document.lineAt(line).range;
                this.collectedDiagnostics[file].push(new vscode.Diagnostic(range, diagnostic.message, severity));
            }
            this.diagnosticCollection.set(document.uri, this.collectedDiagnostics[file]);
        }, (reason) => {
            vscode.window.showErrorMessage(`Could not open ${file} because ${reason}`);
        });
    }

    public revealLine(file: string, line: number) {
        let highlightLine = (document: vscode.TextDocument, line: number) => {
            let range = document.lineAt(line - 1).range;
            vscode.window.showTextDocument(document, vscode.ViewColumn.One, true)
                .then((editor: vscode.TextEditor) => {
                    editor.selection = new vscode.Selection(range.start, range.end);
                    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
                });
        };

        if (this.activeEditor) {
            let currentFile = this.activeEditor.document.fileName;
            currentFile = currentFile.replace(/\\/g, '/');
            if (currentFile === file) {
                highlightLine(this.activeEditor.document, line);
                return;
            }
        }

        let newDocument = vscode.workspace.openTextDocument(file);
        newDocument.then((document: vscode.TextDocument) => {
            highlightLine(document, line);
        }, (reason) => {
            vscode.window.showErrorMessage(`Could not open ${file} because ${reason}`);
        });
    }

    public getConfig<T>(section: string): T | undefined {
        return this.config.get<T>(section);
    }
}
