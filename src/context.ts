'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

export class Context {
    private context: vscode.ExtensionContext;
    private config: vscode.WorkspaceConfiguration;
    
    constructor(context: vscode.ExtensionContext, config: vscode.WorkspaceConfiguration) {
        this.context = context;
        this.config = config;
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

    public getConfig<T>(section: string): T | undefined {
        return this.config.get<T>(section);
    }
}
