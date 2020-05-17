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
    position: absolute;
    border: none;
    right: 0px;
    padding: 26px;
    text-align: center;
    text-decoration: none;
    font-size: 26px;
    border-radius: 8px;
    margin: 8px;
    transform: translateX(0%);
    background: url('${this.screenResourcePath}');
    background-size: 26px;
    background-repeat: no-repeat;
    background-position: center;
    background-color: rgba(128, 128, 128, 0.5);
    z-index: 1;
}
#screenshot:hover {
    background-color: lightgray;
    transition-duration: 0.1s;
}`;
    }
}
