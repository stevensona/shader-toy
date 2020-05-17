'use strict';

import { WebviewExtension } from '../webview_extension';

export class PauseButtonStyleExtension implements WebviewExtension {
    private pauseResourcePath: string;
    private playResourcePath: string;

    constructor(getWebviewResourcePath: (relativePath: string) => string) {
        this.pauseResourcePath = getWebviewResourcePath('pause.png');
        this.playResourcePath = getWebviewResourcePath('play.png');
    }

    public generateContent(): string {
        return `\
/* Container for pause button */
.button-container, .container {
    text-align: center;
    position: absolute;
    bottom: 0;
    width: 100%;
    height: 80px;
    margin: auto;
    z-index: 1;
}

/* Hide the browser's default checkbox */
.button-container input {
    position: absolute;
    opacity: 0;
    cursor: pointer;
}

/* Custom checkbox style */
.pause-play {
    position: absolute;
    border: none;
    padding: 30px;
    text-align: center;
    text-decoration: none;
    font-size: 16px;
    border-radius: 8px;
    margin: auto;
    transform: translateX(-50%);
    background: url('${this.pauseResourcePath}');
    background-size: 40px;
    background-repeat: no-repeat;
    background-position: center;
    background-color: rgba(128, 128, 128, 0.5);
    z-index: 1;
}
.button-container:hover input ~ .pause-play {
    background-color: lightgray;
    transition-duration: 0.2s;
}
.button-container:hover input:checked ~ .pause-play {
    background-color: lightgray;
    transition-duration: 0.2s;
}
.button-container input:checked ~ .pause-play {
    background: url('${this.playResourcePath}');
    background-size: 40px;
    background-repeat: no-repeat;
    background-position: center;
    background-color: rgba(128, 128, 128, 0.5);
}`;
    }
}
