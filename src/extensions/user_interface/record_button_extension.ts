'use strict';

import { WebviewExtension } from '../webview_extension';

export class RecordButtonExtension implements WebviewExtension {
    public generateContent(): string {
        return `<span id='record' class='rec_base'></span>`;
    }
}
