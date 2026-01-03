(function (global) {
    'use strict';

    const root = global.ShaderToy = global.ShaderToy || {};

    if (!root.env) {
        root.env = {};
    }

    root.env.getVscodeApi = function () {
        try {
            if (typeof global.acquireVsCodeApi === 'function') {
                return global.acquireVsCodeApi();
            }
        } catch {
            // ignore
        }
        return undefined;
    };

    // Show fatal JS errors in the WebView to avoid a silent blank screen.
    {
        const showWebviewError = (title, err) => {
            try {
                const messageElement = global.document && global.document.getElementById
                    ? global.document.getElementById('message')
                    : undefined;
                if (!messageElement) return;
                const detail = (err && (err.stack || err.message))
                    ? (err.stack || err.message)
                    : String(err);
                messageElement.innerText = `${title}\n${detail}`;
            } catch {
                // ignore
            }
        };

        global.addEventListener('error', (event) => {
            showWebviewError('WebView error', event && (event.error || event.message) ? (event.error || event.message) : event);
        });

        global.addEventListener('unhandledrejection', (event) => {
            showWebviewError('Unhandled promise rejection', event && event.reason ? event.reason : event);
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
