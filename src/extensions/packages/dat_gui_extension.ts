'use strict';

import { Context } from '../../context';
import { WebviewExtension } from '../webview_extension';

export class DatGuiExtension implements WebviewExtension {
    private context: Context;

    constructor(context: Context) {
        this.context = context;
    }

    public generateContent(): string {
        return `\
<script src='${this.context.getWebviewResourcePath('dat.gui.min.js')}'></script>`;
    }
}
