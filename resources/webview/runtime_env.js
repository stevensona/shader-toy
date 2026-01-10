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
})(typeof window !== 'undefined' ? window : globalThis);
