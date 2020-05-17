'use strict';

import { WebviewExtension } from '../webview_extension';

export class DatGuiExtension implements WebviewExtension {
    private getWebviewResourcePath: (relativePath: string) => string;
    private generateStandalone: boolean;

    constructor(getWebviewResourcePath: (relativePath: string) => string, generateStandalone: boolean) {
        this.getWebviewResourcePath = getWebviewResourcePath;
        this.generateStandalone = generateStandalone;
    }

    public generateContent(): string {
        if (this.generateStandalone) {
            return `\
<script src='https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.6/dat.gui.min.js'></script>`;
        }
        return `\
<script src='${this.getWebviewResourcePath('dat.gui.min.js')}'></script>`;
    }
}
