'use strict';

import { WebviewExtension } from './webview_extension';

export class AdvanceTimeIfNotPausedExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
if (paused == false) {
    // Optional exact-time latch used by sequencer scrubbing.
    try {
        window.ShaderToy = window.ShaderToy || {};
        if (typeof window.ShaderToy.__forcedTime === 'number' && isFinite(window.ShaderToy.__forcedTime)) {
            time = window.ShaderToy.__forcedTime;
            startingTime = time;
            pausedTime = (clock && typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
            deltaTime = 0.0;
            window.ShaderToy.__forcedTime = undefined;
        } else {
            deltaTime = clock.getDelta();
            time = startingTime + clock.getElapsedTime() - pausedTime;
        }
    } catch {
        deltaTime = clock.getDelta();
        time = startingTime + clock.getElapsedTime() - pausedTime;
    }
    if (vscode !== undefined) {
        // Throttle: updateTime is used for cross-webview syncing (e.g. sequencer).
        // Posting every frame can overwhelm the extension host in some setups.
        try {
            window.ShaderToy = window.ShaderToy || {};
            window.ShaderToy.__updateTimeSync = window.ShaderToy.__updateTimeSync || { lastMs: 0, lastT: NaN };
            const now = Date.now();
            const prev = window.ShaderToy.__updateTimeSync;
            const dt = (typeof prev.lastT === 'number' && isFinite(prev.lastT)) ? Math.abs(time - prev.lastT) : Number.POSITIVE_INFINITY;
            if ((now - (prev.lastMs || 0)) >= 33 || dt >= 0.02) {
                prev.lastMs = now;
                prev.lastT = time;
                vscode.postMessage({
                    command: 'updateTime',
                    time: time
                });
            }
        } catch {
            // ignore
        }
    }
} else {
    deltaTime = 0.0;
}`;
    }
}
