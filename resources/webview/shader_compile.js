(function (global) {
    'use strict';

    const root = global.ShaderToy = global.ShaderToy || {};
    const SELF_SOURCE_ID = Number(root.SELF_SOURCE_ID);

    if (!root.shaderCompile) {
        root.shaderCompile = {};
    }

    // Central place for any #line / sentinel normalization.
    root.shaderCompile.normalizeLineDirectives = function (source) {
        if (!Number.isFinite(SELF_SOURCE_ID)) {
            console.warn('ShaderToy: SELF_SOURCE_ID is not set; skipping #line normalization');
            return source || '';
        }

        // Normalize our "self" sentinel source-id for compiles.
        return (source || '').replace(new RegExp(`#line\\s+(\\d+)\\s+${SELF_SOURCE_ID}`, 'g'), '#line $1 0');
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
