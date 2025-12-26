'use strict';

import { WebviewExtension } from './webview_extension';

export class WebviewModuleScriptExtension implements WebviewExtension {
    private getWebviewResourcePath: (relativePath: string) => string;
    private generateStandalone: boolean;
    private relativePath: string;

    constructor(
        getWebviewResourcePath: (relativePath: string) => string,
        generateStandalone: boolean,
        relativePath: string,
    ) {
        this.getWebviewResourcePath = getWebviewResourcePath;
        this.generateStandalone = generateStandalone;
        this.relativePath = relativePath;
    }

    public generateContent(): string {
        // Portable preview writes the HTML next to the shader file and does not copy extension resources.
        // Use an empty data URL so browsers don't try to fetch a missing local file.
        if (this.generateStandalone) {
            return 'data:text/javascript,';
        }

        return this.getWebviewResourcePath(this.relativePath);
    }
}
