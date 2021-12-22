'use strict';

import { WebviewExtension } from '../webview_extension';

export class ThreeModuleExtension implements WebviewExtension {
    private getWebviewResourcePath: (relativePath: string) => string;
    private generateStandalone: boolean;

    constructor(getWebviewResourcePath: (relativePath: string) => string, generateStandalone: boolean) {
        this.getWebviewResourcePath = getWebviewResourcePath;
        this.generateStandalone = generateStandalone;
    }

    public generateContent(): string {
        if (this.generateStandalone) {
            return 'https://cdnjs.cloudflare.com/ajax/libs/three.js/110/three.module.js';
        }
        return this.getWebviewResourcePath('three.module.js');
    }
}
