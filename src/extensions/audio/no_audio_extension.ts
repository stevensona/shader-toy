'use strict';

import { WebviewExtension } from '../webview_extension';

export class NoAudioExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
const audioContext = {
    sampleRate: 0
};`;
    }
}
