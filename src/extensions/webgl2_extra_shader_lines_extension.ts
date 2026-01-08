'use strict';

import { WebviewExtension } from './webview_extension';

export class Webgl2ExtraShaderLinesExtension implements WebviewExtension {
    private webgl2ExtraShaderLines: number;

    constructor(webgl2ExtraShaderLines: number) {
        this.webgl2ExtraShaderLines = webgl2ExtraShaderLines;
    }

    public generateContent(): string {
        return `${this.webgl2ExtraShaderLines}`;
    }
}
