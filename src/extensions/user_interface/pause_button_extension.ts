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

export class HiddenPauseButtonExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
<label>
<input id='pause-button' type='checkbox'>
<span></span>`;
    }
}
