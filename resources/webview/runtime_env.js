(function (global) {
    'use strict';

    const root = global.ShaderToy = global.ShaderToy || {};

    if (!root.env) {
        root.env = {};
    }

    root.env.getVscodeApi = function () {
        try {
            if (root.env && root.env.vscodeApi) {
                return root.env.vscodeApi;
            }
        } catch {
            // ignore
        }

        try {
            if (typeof global.acquireVsCodeApi === 'function') {
                const api = global.acquireVsCodeApi();
                try {
                    root.env.vscodeApi = api;
                } catch {
                    // ignore
                }
                return api;
            }
        } catch {
            // ignore
        }
        return undefined;
    };

    const writeMessage = function (label, detail) {
        try {
            if (!global.document || typeof global.document.getElementById !== 'function') {
                return;
            }
            const el = global.document.getElementById('message');
            if (!el) {
                return;
            }
            const text = detail ? `${label}: ${detail}` : label;
            if (typeof el.innerText === 'string' || typeof el.innerText === 'undefined') {
                el.innerText = text;
            } else if (typeof el.textContent === 'string' || typeof el.textContent === 'undefined') {
                el.textContent = text;
            }
        } catch {
            // ignore
        }
    };

    try {
        if (typeof global.addEventListener === 'function') {
            global.addEventListener('error', (event) => {
                try {
                    const detail = event && event.error ? String(event.error && event.error.message ? event.error.message : event.error) : '';
                    writeMessage('WebView error', detail);
                } catch {
                    writeMessage('WebView error', '');
                }
            });

            global.addEventListener('unhandledrejection', (event) => {
                try {
                    const detail = event && 'reason' in event ? String(event.reason) : '';
                    writeMessage('Unhandled promise rejection', detail);
                } catch {
                    writeMessage('Unhandled promise rejection', '');
                }
            });
        }
    } catch {
        // ignore
    }
})(typeof window !== 'undefined' ? window : globalThis);
