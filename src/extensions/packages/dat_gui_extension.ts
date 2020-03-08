'use strict';

import { Context } from '../../context';
import { WebviewExtension } from '../webview_extension';

export class DatGuiExtension implements WebviewExtension {
    private context: Context;
    private generateStandalone: boolean;

    constructor(context: Context, generateStandalone: boolean) {
        this.context = context;
        this.generateStandalone = generateStandalone;
    }

    public generateContent(): string {
        if (this.generateStandalone) {
            return `\
<script src='https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.6/dat.gui.min.js'></script>`;
        }
        return `\
<script src='${this.context.getWebviewResourcePath('dat.gui.min.js')}'></script>`;
    }
}
