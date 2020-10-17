'use strict';

import { WebviewExtension } from '../webview_extension';

export class ReloadButtonExtension implements WebviewExtension {
    public generateContent(): string {
        return `<span id='reload'></span>`;
    }
}
