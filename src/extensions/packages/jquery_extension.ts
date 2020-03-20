'use strict';

import { Context } from '../../context';
import { WebviewExtension } from '../webview_extension';

export class JQueryExtension implements WebviewExtension {
    private context: Context;
    private generateStandalone: boolean;

    constructor(context: Context, generateStandalone: boolean) {
        this.context = context;
        this.generateStandalone = generateStandalone;
    }

    public generateContent(): string {
        if (this.generateStandalone) {
            return 'https://ajax.googleapis.com/ajax/libs/jquery/3.4.1/jquery.min.js';
        }
        return this.context.getWebviewResourcePath('jquery.min.js');
    }
}
