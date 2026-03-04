'use strict';

import { WebviewExtension } from '../webview_extension';

export class FrameTimingInitExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
if (window.ShaderToy && window.ShaderToy.frameTiming) {
    window.ShaderToy.frameTiming.onFrame(vscode, frameCounter);
}`;
    }
}
