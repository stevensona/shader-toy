'use strict';

import { WebviewExtension } from '../webview_extension';

export class UniformsSequencerBridgeExtension implements WebviewExtension {
    public generateContent(): string {
        // A lightweight bridge that lets the extension drive custom #iUniform values
        // without reloading the preview.
        return `\
(function(global){
    'use strict';

    const applyValues = (values) => {
        // In paused mode, default to "GUI is master" so manual control window edits don't get
        // immediately overwritten by sequencer updates. Sequencer can still override once
        // when explicitly requested (e.g. timeline scrubbing) by setting __sequencerOverrideOnce.
        try {
            const st = global.ShaderToy || {};
            const isPaused = !!st.__isPaused;
            const master = typeof st.__uniformsMaster === 'string' ? st.__uniformsMaster : '';
            const allowOnce = !!st.__sequencerOverrideOnce;
            if (isPaused && master === 'gui' && !allowOnce) {
                return;
            }
            if (allowOnce) {
                st.__sequencerOverrideOnce = false;
                global.ShaderToy = st;
            }
        } catch {
            // ignore
        }

        // Note: in our webview template, "buffers" is declared with let at top-level.
        // That creates a global binding, but not a window.buffers property.
        // So prefer the identifier binding if available.
        let buffersRef;
        try {
            // eslint-disable-next-line no-undef
            buffersRef = (typeof buffers !== 'undefined') ? buffers : undefined;
        } catch {
            buffersRef = undefined;
        }
        if (!buffersRef) {
            buffersRef = global.buffers;
        }

        if (!values || !buffersRef || !Array.isArray(buffersRef)) {
            return;
        }

        for (const buffer of buffersRef) {
            if (!buffer || !buffer.UniformValues) {
                continue;
            }
            for (const name of Object.keys(values)) {
                if (!Object.prototype.hasOwnProperty.call(buffer.UniformValues, name)) {
                    continue;
                }
                const nextValue = values[name];
                try {
                    buffer.UniformValues[name] = nextValue;

                    // Best-effort: refresh dat.GUI controllers if they exist.
                    const controllers = global.ShaderToyUniformControllers && global.ShaderToyUniformControllers.get
                        ? global.ShaderToyUniformControllers.get(name)
                        : undefined;
                    if (controllers && Array.isArray(controllers)) {
                        for (const c of controllers) {
                            if (c && typeof c.updateDisplay === 'function') {
                                c.updateDisplay();
                            }
                        }
                    }
                } catch {
                    // ignore
                }
            }
        }
    };

    global.addEventListener('message', (event) => {
        const msg = event && event.data ? event.data : undefined;
        if (!msg || !msg.command) {
            return;
        }
        if (msg.command === 'sequencerSetUniformValues') {
            applyValues(msg.values);
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
`;
    }
}
