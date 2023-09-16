'use strict';

import { WebviewExtension } from './webview_extension';

export class PauseWholeRenderExtension implements WebviewExtension {
    public generateContent(): string {
        return 'if (paused) return;';
    }
}
