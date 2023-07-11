'use strict';

import { WebviewExtension } from './webview_extension';

export class InitialPausedExtension implements WebviewExtension {
    private initialPaused: boolean;

    constructor(initialPaused: boolean) {
        this.initialPaused = initialPaused;
    }

    public generateContent(): string {
        return `${this.initialPaused}`;
    }
}
