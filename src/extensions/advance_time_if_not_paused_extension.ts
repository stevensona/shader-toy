'use strict';

import { WebviewExtension } from './webview_extension';

export class AdvanceTimeIfNotPausedExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
if (paused == false) {
    deltaTime = clock.getDelta();
    time = startingTime + clock.getElapsedTime() - pausedTime;
    if (vscode !== undefined) {
        vscode.postMessage({
            command: 'updateTime',
            time: time
        });
    }
} else {
    deltaTime = 0.0;
}`;
    }
}
