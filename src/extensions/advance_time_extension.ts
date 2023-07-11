'use strict';

import { WebviewExtension } from './webview_extension';

export class AdvanceTimeExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
deltaTime = clock.getDelta();
time = startingTime + clock.getElapsedTime() - pausedTime;
if (vscode !== undefined) {
    vscode.postMessage({
        command: 'updateTime',
        time: time
    });
}`;
    }
}
