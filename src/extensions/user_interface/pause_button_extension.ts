'use strict';

import { WebviewExtension } from '../webview_extension';

export class PauseButtonExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
<label class='button-container'>
<input id='pause-button' type='checkbox'>
<span class='pause-play'></span>`;
    }
}
