'use strict';

import { WebviewExtension } from '../webview_extension';

export class RecordButtonStyleExtension implements WebviewExtension {
    private recordResourcePath: string;
    private stopResourcePath: string;

    constructor(getWebviewResourcePath: (relativePath: string) => string) {
        this.recordResourcePath = getWebviewResourcePath('record.png');
        this.stopResourcePath = getWebviewResourcePath('stop_rec.png');
    }

    public generateContent(): string {
        return `\
#record {
    background: url('${this.recordResourcePath}');
    background-size: 32px;
    background-repeat: no-repeat;
    background-position: center;
    background-color: rgba(128, 128, 128, 0.5);
}
#record:hover {
    background-color: lightgray;
    transition-duration: 0.1s;
}
#record.recording {
    background: url('${this.stopResourcePath}');
    background-size: 32px;
    background-repeat: no-repeat;
    background-position: center;
    background-color: rgba(128, 128, 128, 0.5);
}
#record.recording:hover {
    background-color: lightgray;
    transition-duration: 0.1s;
}`;
    }
}
