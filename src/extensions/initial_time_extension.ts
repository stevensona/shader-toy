'use strict';

import { WebviewExtension } from './webview_extension';

export class InitialTimeExtension implements WebviewExtension {
    private initialTime: number;

    constructor(initialTime: number) {
        this.initialTime = initialTime;
    }

    public generateContent(): string {
        return `${this.initialTime}`;
    }
}
