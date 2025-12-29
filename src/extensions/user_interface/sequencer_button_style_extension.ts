'use strict';

import { WebviewExtension } from '../webview_extension';

export class SequencerButtonStyleExtension implements WebviewExtension {
    private sequencerResourcePath: string;

    constructor(getWebviewResourcePath: (relativePath: string) => string) {
        this.sequencerResourcePath = getWebviewResourcePath('sequencer.png');
    }

    public generateContent(): string {
        return `\
#sequencer_button {
    top: 120px;
    background: url('${this.sequencerResourcePath}');
    background-size: 32px;
    background-repeat: no-repeat;
    background-position: center;
    background-color: rgba(128, 128, 128, 0.5);
}
#sequencer_button:hover {
    background-color: lightgray;
    transition-duration: 0.1s;
}
#sequencer_button.active {
    background-color: rgba(128, 128, 128, 0.9);
}`;
    }
}
