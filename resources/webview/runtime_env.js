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
})(typeof window !== 'undefined' ? window : globalThis);
