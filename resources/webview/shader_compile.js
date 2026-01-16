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

    root.shaderCompile.prepareFragmentShader = function (source, glslUseVersion3) {
        if (glslUseVersion3) {
            return (
                '#ifdef gl_FragColor\n' +
                '#define GLSL_FRAGCOLOR gl_FragColor\n' +
                '#else\n' +
                'layout(location = 0) out highp vec4 layoutFragColor;\n' +
                '#define gl_FragColor layoutFragColor\n' +
                '#define GLSL_FRAGCOLOR layoutFragColor\n' +
                '#endif\n' +
                '#define texture2D texture\n' +
                '#define textureCube texture\n' +
                '\n' + (source || '')
            );
        }
        return (
            '#define GLSL_FRAGCOLOR gl_FragColor\n' +
            '\n' + (source || '')
        );
    };

    root.shaderCompile.prepareVertexShader = function (source, glslUseVersion3) {
        if (!glslUseVersion3) {
            throw new Error('Custom vertex shaders (#iVertex) require shader-toy.webglVersion = "WebGL2".');
        }

        return (
            '#define texture2D texture\n' +
            '#define textureCube texture\n' +
            '\n' + (source || '')
        );
    };

    const getCompileHeader = (glslUseVersion3) => {
        // Keep header line count stable (2 lines) for easier line-offset mapping.
        return glslUseVersion3
            ? '#version 300 es\nprecision highp float;\n'
            : '// shader-toy\nprecision highp float;\n';
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

    root.shaderCompile.compileIncludeFragment = function (gl, fsSource, glslUseVersion3) {
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        const normalized = root.shaderCompile.normalizeLineDirectives(fsSource);
        const header = getCompileHeader(glslUseVersion3);
        const wrapped = `${header}${normalized || ''}\nvoid main() {}\n`;
        gl.shaderSource(fs, wrapped);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            const fragmentLog = gl.getShaderInfoLog(fs);
            console.error('THREE.WebGLProgram: shader error: ', gl.getError(), 'gl.COMPILE_STATUS', null, null, null, null, fragmentLog);
            return false;
        }
        return true;
    };

    root.shaderCompile.compileVertexShader = function (gl, vsSource, glslUseVersion3) {
        const vs = gl.createShader(gl.VERTEX_SHADER);
        const normalized = root.shaderCompile.normalizeLineDirectives(vsSource);
        const header = getCompileHeader(glslUseVersion3);
        const wrapped = `${header}${normalized || ''}`;
        gl.shaderSource(vs, wrapped);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            const vertexLog = gl.getShaderInfoLog(vs);
            console.error('THREE.WebGLProgram: shader error: ', gl.getError(), 'gl.COMPILE_STATUS', null, null, null, null, vertexLog);
            return false;
        }
        return true;
    };
})(typeof window !== 'undefined' ? window : globalThis);
