(function (global) {
    'use strict';

    const root = global.ShaderToy = global.ShaderToy || {};

    if (!root.shaderCompile) {
        root.shaderCompile = {};
    }

    // Central place for any future #line / sentinel normalization.
    // On master today this is effectively a no-op.
    root.shaderCompile.normalizeLineDirectives = function (source) {
        return source || '';
    };

    root.shaderCompile.compileFragShader = function (gl, fsSource) {
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        const normalized = root.shaderCompile.normalizeLineDirectives(fsSource);
        gl.shaderSource(fs, normalized);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            const fragmentLog = gl.getShaderInfoLog(fs);
            console.error('THREE.WebGLProgram: shader error: ', gl.getError(), 'gl.COMPILE_STATUS', null, null, null, null, fragmentLog);
            return false;
        }
        return true;
    };
})(typeof window !== 'undefined' ? window : globalThis);
