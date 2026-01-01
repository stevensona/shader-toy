(function (global) {
    'use strict';

    const root = global.ShaderToy = global.ShaderToy || {};

    if (!root.glslError) {
        const rewriters = [];

        root.glslError = {
            registerRewriter: function (fn) {
                if (typeof fn === 'function') {
                    rewriters.push(fn);
                }
            },
            rewrite: function (info) {
                for (const fn of rewriters) {
                    try {
                        const result = fn(info);
                        if (result && typeof result === 'object') {
                            return result;
                        }
                    } catch {
                        // ignore
                    }
                }
                return undefined;
            }
        };
    }

    // Back-compat: keep the historical name as the pipeline entry point.
    // If something else defines it later, that's fine.
    if (!global.shaderToyRewriteGlslError) {
        global.shaderToyRewriteGlslError = function (info) {
            try {
                return root.glslError && root.glslError.rewrite
                    ? root.glslError.rewrite(info)
                    : undefined;
            } catch {
                return undefined;
            }
        };
    }
})(typeof window !== 'undefined' ? window : globalThis);
