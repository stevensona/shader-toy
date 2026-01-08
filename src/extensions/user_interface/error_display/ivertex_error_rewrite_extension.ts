'use strict';

import { WebviewExtension } from '../../webview_extension';

export class IvertexErrorRewriteExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
(() => {
    try {
        const root = (typeof window !== 'undefined') ? window : globalThis;
        const shaderToy = root.ShaderToy;
        const glslError = shaderToy && shaderToy.glslError;
        if (!glslError || typeof glslError.registerRewriter !== 'function') {
            return;
        }
        glslError.registerRewriter(function (info) {
            if (!info || typeof info.error !== 'string') {
                return undefined;
            }
            if (info.error.indexOf('ERROR_IVERTEX_SOURCE') >= 0) {
                return {
                    lineNumber: 0,
                    error: "'ERROR_IVERTEX_SOURCE' : Cannot preview vertex shader standalone"
                };
            }
            return undefined;
        });
    } catch {
        // ignore
    }
})();`;
    }
}