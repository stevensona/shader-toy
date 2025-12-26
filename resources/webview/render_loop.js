(function (global) {
    'use strict';

    const root = global.ShaderToy = global.ShaderToy || {};
    root.renderLoop = root.renderLoop || {};

    // Intentionally empty for now.
    // Future home for requestAnimationFrame render loop.
})(typeof window !== 'undefined' ? window : globalThis);
