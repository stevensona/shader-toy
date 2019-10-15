'use strict';

import { Context } from '../../context';
import { WebviewExtension } from '../webview_extension';

export class JQueryExtension implements WebviewExtension {
    private context: Context;

    constructor(context: Context) {
        this.context = context;
    }

    public generateContent(): string {
        return this.context.getWebviewResourcePath('jquery.min.js');
    }
}
