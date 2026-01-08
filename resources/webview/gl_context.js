(function (global) {
    'use strict';

    const root = global.ShaderToy = global.ShaderToy || {};
    root.gl = root.gl || {};

    root.gl.getContext = function (canvas, glslUseVersion3) {
        let gl = null;
        if (glslUseVersion3) {
            gl = canvas.getContext('webgl2');
        }
        else {
            gl = canvas.getContext('webgl2');
            if (gl == null) {
                gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
            }
        }

        const isWebGL2 = gl != null && (typeof global.WebGL2RenderingContext !== 'undefined') && (gl instanceof global.WebGL2RenderingContext);
        if (gl == null) {
            const msg = glslUseVersion3
                ? 'WebGL2 is required for shader-toy.webglVersion = "WebGL2", but it is not available in this WebView.'
                : 'WebGL is not available in this WebView (cannot create webgl2/webgl context).';
            try {
                const messageElement = global.document && global.document.getElementById
                    ? global.document.getElementById('message')
                    : undefined;
                if (messageElement) {
                    messageElement.innerText = msg;
                }
            } catch {
                // ignore
            }
            throw new Error(msg);
        }

        return { gl, isWebGL2 };
    };
})(typeof window !== 'undefined' ? window : globalThis);
