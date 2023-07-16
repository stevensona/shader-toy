'use strict';

import { WebviewExtension } from '../webview_extension';

export class ScreenshotButtonStyleExtension implements WebviewExtension {
    private screenResourcePath: string;

    constructor(getWebviewResourcePath: (relativePath: string) => string) {
        this.screenResourcePath = getWebviewResourcePath('screen.png');
    }

    public generateContent(): string {
        return `\
#screenshot {
    background: url('${this.screenResourcePath}');
    background-size: 32px;
    background-repeat: no-repeat;
    background-position: center;
    background-color: rgba(128, 128, 128, 0.5);
}
#screenshot:hover {
    background-color: lightgray;
    transition-duration: 0.1s;
}`;
    }
}
