'use strict';

import { Context } from '../../context';
import { WebviewExtension } from '../webview_extension';

export class ThreeExtension implements WebviewExtension {
    private context: Context;
    private generateStandalone: boolean;

    constructor(context: Context, generateStandalone: boolean) {
        this.context = context;
        this.generateStandalone = generateStandalone;
    }

    public generateContent(): string {
        if (this.generateStandalone) {
            return 'https://cdnjs.cloudflare.com/ajax/libs/three.js/110/three.min.js';
        }
        return this.context.getWebviewResourcePath('three.min.js');
    }
}
