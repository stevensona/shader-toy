(function (global) {
    'use strict';

    /* eslint-disable no-undef */

    const button = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_button')
        : undefined;

    if (!button) {
        return;
    }

    const getVscodeApi = () => {
        try {
            if (global.ShaderToy && global.ShaderToy.env && global.ShaderToy.env.vscodeApi) {
                return global.ShaderToy.env.vscodeApi;
            }
        } catch {
            // ignore
        }

        try {
            if (global.ShaderToy && global.ShaderToy.env && typeof global.ShaderToy.env.getVscodeApi === 'function') {
                return global.ShaderToy.env.getVscodeApi();
            }
        } catch {
            // ignore
        }

        try {
            if (typeof global.acquireVsCodeApi === 'function') {
                return global.acquireVsCodeApi();
            }
        } catch {
            // ignore
        }

        return undefined;
    };

    // Best-effort: capture early so click works even if acquireVsCodeApi is flaky later.
    const vscodeApiAtInit = getVscodeApi();

    button.addEventListener('click', () => {
        const vscodeApi = vscodeApiAtInit || getVscodeApi();
        if (!vscodeApi) {
            return;
        }

        try {
            vscodeApi.postMessage({
                command: 'toggleSequencerPanel'
            });
        } catch {
            // ignore
        }
    });

    global.addEventListener('message', (event) => {
        const message = event && event.data ? event.data : undefined;
        if (!message || !message.command) {
            return;
        }

        switch (message.command) {
        case 'sequencerState':
            if (message.active) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
            return;
        case 'setTime': {
            const newTime = message.time || 0;

            // These are defined in the main webview script block (webview_base.html)
            // and are used by the render loop.
            startingTime = newTime;
            // Latch exact time so the next render frame doesn't advance it by a tiny delta
            // before sync messages flow back.
            try {
                global.ShaderToy = global.ShaderToy || {};
                global.ShaderToy.__forcedTime = newTime;
            } catch {
                // ignore
            }

            pausedTime = 0.0;
            if (clock && typeof clock.start === 'function') {
                clock.start();
            }

            time = newTime;
            deltaTime = 0.0;
            forceRenderOneFrame = true;

            // While paused we usually treat the GUI as master, but scrubbing time is an explicit
            // request to preview sequencer output. Allow the next sequencer uniform update once.
            try {
                global.ShaderToy = global.ShaderToy || {};
                global.ShaderToy.__sequencerOverrideOnce = true;
            } catch {
                // ignore
            }
            return;
        }
        case 'renderOneFrame': {
            // Request a single frame render even when pauseWholeRender is enabled.
            try {
                forceRenderOneFrame = true;
            } catch {
                // ignore
            }
            return;
        }
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
