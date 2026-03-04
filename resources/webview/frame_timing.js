(function (global) {
    'use strict';

    const root = global.ShaderToy = global.ShaderToy || {};
    root.frameTiming = root.frameTiming || {};

    let lastFrameTime = 0;
    let enabled = true;
    let lastPostTime = 0;
    const POST_INTERVAL = 16; // throttle to ~60Hz

    /**
     * Called once per frame from the render loop.
     * Measures frame-to-frame delta (CPU time) and posts a
     * 'frameData' message to the extension host.
     *
     * Port of FragCoord v0.7.1 performance.now() timing pattern.
     * See: fragcoord-frames(0.7.1)-REPORT.md §2
     */
    root.frameTiming.onFrame = function (vscodeApi, frameNumber) {
        if (!enabled || !vscodeApi) return;

        const now = performance.now();
        const cpuMs = lastFrameTime > 0 ? now - lastFrameTime : 0;
        lastFrameTime = now;

        if (cpuMs > 0 && now - lastPostTime >= POST_INTERVAL) {
            lastPostTime = now;
            vscodeApi.postMessage({
                command: 'frameData',
                cpuMs: cpuMs,
                gpuMs: 0,
                frameNumber: frameNumber || 0
            });
        }
    };

    root.frameTiming.setEnabled = function (value) {
        enabled = !!value;
        if (!value) {
            lastFrameTime = 0;
            lastPostTime = 0;
        }
    };

    root.frameTiming.isEnabled = function () {
        return enabled;
    };
})(typeof window !== 'undefined' ? window : globalThis);
