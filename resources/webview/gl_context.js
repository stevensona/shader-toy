(function (global) {
    'use strict';

    const root = global.ShaderToy = global.ShaderToy || {};
    root.gl = root.gl || {};

    // Intentionally empty for now.
    // Future home for WebGL1/WebGL2 context selection + capability probing.
})(typeof window !== 'undefined' ? window : globalThis);
