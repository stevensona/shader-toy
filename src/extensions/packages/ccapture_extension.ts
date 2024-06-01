'use strict';

import { WebviewExtension } from '../webview_extension';

export class CCaptureExtension implements WebviewExtension {
    private getWebviewResourcePath: (relativePath: string) => string;
    private generateStandalone: boolean;

    constructor(getWebviewResourcePath: (relativePath: string) => string, generateStandalone: boolean) {
        this.getWebviewResourcePath = getWebviewResourcePath;
        this.generateStandalone = generateStandalone;
    }

    public generateContent(): string {
        if (this.generateStandalone) {
            return `\
<script src='https://cdn.jsdelivr.net/npm/ccapture.js-npmfixed@1.1.0/build/CCapture.all.min.js'></script>`;
        }
        return `\
<script src='${this.getWebviewResourcePath('CCapture.all.min.js')}'></script>`;
    }
}
