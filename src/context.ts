'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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
    public makeWebviewResource(webview: vscode.Webview, resourceUri: vscode.Uri): vscode.Uri {
        return webview.asWebviewUri(resourceUri);
    }
    public getWebviewResourcePath(webview: vscode.Webview, file: string): string {
        const resourceUri = this.getResourceUri(file);
        const webviewResourceUri = this.makeWebviewResource(webview, resourceUri);
        return webviewResourceUri.toString();
    }

    public async mapUserPath(userPath: string, sourcePath: string): Promise<{ file: string, userPath: string }> {
        userPath = userPath.replace(/\\/g, '/');
        sourcePath = path.dirname(sourcePath);

        let file = await (async (file: string) => {
            const fileCandidates: string[] = [];
            // Best-effort fallback path to return when the file doesn't exist.
            // This avoids returning undefined (which can crash path.normalize)
            // and allows downstream loaders to surface a proper error.
            let fallbackFile = file;

            const exists = async (file: string) => {
                const singleFileExists = async (file: string) => {
                    try {
                        await fs.promises.access(file);
                        return true;
                    }
                    catch
                    {
                        return false;
                    }
                };

                if (file.indexOf('{}') < 0 && file.indexOf('*') < 0) {
                    return await singleFileExists(file);
                }
                else {
                    const existsWithEachPrefix = async (pattern: string, prefixes: [string, string, string, string, string, string]) => {
                        for (const dir of prefixes) {
                            const directionFile = pattern.replace('{}', dir);
                            if (!await singleFileExists(directionFile)) {
                                return false;
                            }
                        }
                        return true;
                    };

                    const possiblePrefixes: [string, string, string, string, string, string][] = [
                        ['e', 'w', 'u', 'd', 'n', 's'],
                        ['east', 'west', 'up', 'down', 'north', 'south'],
                        ['px', 'nx', 'py', 'ny', 'pz', 'nz'],
                        ['posx', 'negx', 'posy', 'negy', 'posz', 'negz']
                    ];

                    const pattern = file.replace('*', '{}');
                    for (const prefixes of possiblePrefixes) {
                        if (await existsWithEachPrefix(pattern, prefixes)) {
                            return true;
                        }
                    }
                    return false;
                }
            };

            // Highest priority are absolute paths
            fileCandidates.push(file);
            if (await exists(file)) {
                return file;
            }

            // Second priority are relative to sourcePath
            {
                const fileCandidate = [sourcePath, file].join('/');
                fileCandidates.push(fileCandidate);
                fallbackFile = fileCandidate;
                if (await exists(fileCandidate)) {
                    return fileCandidate;
                }
            }

            // Last priority are relative to workspace folders
            if (vscode.workspace.workspaceFolders !== undefined) {
                const workspaceFileCandidates: string[] = [];
                for (const worspaceFolder of vscode.workspace.workspaceFolders) {
                    let workspacePath = worspaceFolder.uri.fsPath;
                    workspacePath = workspacePath.replace(/\\/g, '/');
                    workspacePath = workspacePath.replace(/\.\//g, '');
                    const fileCandidate = [workspacePath, file].join('/');
                    if (await exists(fileCandidate)) {
                        workspaceFileCandidates.push(fileCandidate);
                    }
                    fileCandidates.push(fileCandidate);
                }

                if (workspaceFileCandidates.length > 1) {
                    vscode.window.showErrorMessage(`Multiple candidates for file '${userPath}' were found in your workspace folders, first option was picked: '${workspaceFileCandidates[0]}'`);
                }

                if (workspaceFileCandidates.length > 0) {
                    return workspaceFileCandidates[0];
                }

                // If the file doesn't exist in any workspace folder, fall back to a deterministic
                // candidate (relative-to-sourcePath) so callers can proceed without crashing.
                // The error below will make the situation visible.
            }

            vscode.window.showErrorMessage(`File '${userPath}' was not found, paths that were tried were\n\t${fileCandidates.join('\n\t')}`);
            return fallbackFile;
        })(userPath);

        file = path.normalize(file);
        file = file.replace(/\\/g, '/');
        return { file, userPath };
    }

    public showErrorMessage(message: string) {
        vscode.window.showErrorMessage(message);
    }

    public clearDiagnostics() {
        this.collectedDiagnostics = {};
        this.diagnosticCollection.clear();
    }
    public showDiagnostics(diagnosticBatch: DiagnosticBatch, severity: vscode.DiagnosticSeverity) {
        const file = diagnosticBatch.filename;
        const newDocument = vscode.workspace.openTextDocument(file);
        newDocument.then((document: vscode.TextDocument) => {
            if (this.collectedDiagnostics[file] === undefined) {
                this.collectedDiagnostics[file] = [];
            }

            for (const diagnostic of diagnosticBatch.diagnostics) {
                const line = Math.min(Math.max(1, diagnostic.line), document.lineCount) - 1;
                const range = document.lineAt(line).range;
                this.collectedDiagnostics[file].push(new vscode.Diagnostic(range, diagnostic.message, severity));
            }
            this.diagnosticCollection.set(document.uri, this.collectedDiagnostics[file]);
        }, (reason) => {
            vscode.window.showErrorMessage(`Could not open ${file} because ${reason}`);
        });
    }

    public revealLine(file: string, line: number) {
        const highlightLine = (document: vscode.TextDocument, line: number) => {
            line = Math.min(Math.max(1, line), document.lineCount) - 1;
            const range = document.lineAt(line).range;
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

        const newDocument = vscode.workspace.openTextDocument(file);
        newDocument.then((document: vscode.TextDocument) => {
            highlightLine(document, line);
        }, (reason) => {
            vscode.window.showErrorMessage(`Could not open ${file} because ${reason}`);
        });
    }

    public getConfig<T>(section: string): T | undefined {
        return this.config.get<T>(section);
    }

    public getVscodeExtensionContext(): vscode.ExtensionContext {
        return this.context;
    }
}
