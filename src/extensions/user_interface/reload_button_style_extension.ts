'use strict';

import { WebviewExtension } from '../webview_extension';

export class ReloadButtonStyleExtension implements WebviewExtension {
    private reloadResourcePath: string;

    constructor(getWebviewResourcePath: (relativePath: string) => string) {
        this.reloadResourcePath = getWebviewResourcePath('reload.png');
    }

    public generateContent(): string {
        return `\
#reload {
    position: absolute;
    border: none;
    bottom: 0px;
    padding: 26px;
    text-align: center;
    text-decoration: none;
    font-size: 26px;
    border-radius: 8px;
    margin: 8px;
    transform: translateX(0%);
    background: url('${this.reloadResourcePath}');
    background-size: 26px;
    background-repeat: no-repeat;
    background-position: center;
    background-color: rgba(128, 128, 128, 0.5);
    z-index: 1;
}
#reload:hover {
    background-color: lightgray;
    transition-duration: 0.1s;
}`;
    }
}
