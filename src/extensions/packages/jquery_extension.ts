'use strict';

import { WebviewExtension } from '../webview_extension';

export class JQueryExtension implements WebviewExtension {
    private getWebviewResourcePath: (relativePath: string) => string;
    private generateStandalone: boolean;

    constructor(getWebviewResourcePath: (relativePath: string) => string, generateStandalone: boolean) {
        this.getWebviewResourcePath = getWebviewResourcePath;
        this.generateStandalone = generateStandalone;
    }

    public generateContent(): string {
        if (this.generateStandalone) {
            return 'https://ajax.googleapis.com/ajax/libs/jquery/3.4.1/jquery.min.js';
        }
        return this.getWebviewResourcePath('jquery.min.js');
    }
}
