import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { BufferProvider } from '../src/bufferprovider';
import { Context } from '../src/context';
import * as Types from '../src/typenames';

type CapturedDiagnostic = {
    filename: string;
    message: string;
    line: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    severity: any;
};

function makeFakeContext(config: Record<string, unknown>, capturedDiagnostics: CapturedDiagnostic[]): Context {
    const fake: Partial<Context> = {
        getConfig: <T>(section: string): T | undefined => config[section] as T | undefined,
        mapUserPath: async (userPath: string, _sourcePath: string) => ({
            file: path.normalize(userPath),
            userPath
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        showDiagnostics: (batch: Types.DiagnosticBatch, severity: any) => {
            for (const diagnostic of batch.diagnostics) {
                capturedDiagnostics.push({
                    filename: batch.filename,
                    message: diagnostic.message,
                    line: diagnostic.line,
                    severity
                });
            }
        }
    };

    return fake as Context;
}

suite('#iVertex', () => {
    test('WebGL2 mode: loads vertex shader file and strips leading #version', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shader-toy-ivertex-'));
        const vertexFile = path.join(tmpDir, 'test_vertex.glsl');
        const vertexUriPath = vertexFile.replace(/\\/g, '/');

        fs.writeFileSync(
            vertexFile,
            ['#version 300 es', 'void main() {', '    gl_Position = vec4(0.0);', '}'].join('\n'),
            'utf8'
        );

        const code = `// Inlined unit-test shader: uses #iVertex\n#iVertex "file://${vertexUriPath}"\n\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord)\n{\n    fragColor = vec4(1.0);\n}\n`;

        const diags: CapturedDiagnostic[] = [];
        const provider = new BufferProvider(makeFakeContext({ glslVersion: 'WebGL2' }, diags));
        const buffers: Types.BufferDefinition[] = [];
        const includes: Types.IncludeDefinition[] = [];

        await provider.parseShaderCode(path.join(tmpDir, 'main.glsl'), code, buffers, includes, false);
        assert.strictEqual(buffers.length, 1);

        const buffer = buffers[0];
        assert.ok(buffer.VertexFile, 'Expected VertexFile to be set');
        assert.ok(buffer.VertexCode, 'Expected VertexCode to be set');
        assert.ok(buffer.VertexLineOffset !== undefined, 'Expected VertexLineOffset to be set');

        assert.strictEqual(path.normalize(buffer.VertexFile || ''), path.normalize(vertexFile));
        assert.ok(!(buffer.VertexCode || '').includes('#version'), 'Expected leading #version to be stripped from VertexCode');

        assert.strictEqual(
            /#iVertex\s*"/m.test(buffer.Code),
            false,
            'Expected #iVertex directive line to be removed from fragment code'
        );
        assert.ok(
            diags.every((d) => !d.message.includes('Custom vertex shaders (#iVertex) require shader-toy.glslVersion')),
            'Expected no WebGL2-gating diagnostics for valid #iVertex in WebGL2 mode'
        );
        assert.ok(
            diags.every((d) => !d.message.includes('Could not open vertex shader file')),
            'Expected vertex shader file to be readable'
        );
    });

    test('Default mode: #iVertex is rejected and does not set VertexCode', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shader-toy-ivertex-'));
        const vertexFile = path.join(tmpDir, 'test_vertex.glsl');
        const vertexUriPath = vertexFile.replace(/\\/g, '/');

        fs.writeFileSync(vertexFile, 'void main() { gl_Position = vec4(0.0); }\n', 'utf8');

        const code = `#iVertex "file://${vertexUriPath}"\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(0.0); }\n`;

        const diags: CapturedDiagnostic[] = [];
        const provider = new BufferProvider(makeFakeContext({ glslVersion: 'Default' }, diags));
        const buffers: Types.BufferDefinition[] = [];
        const includes: Types.IncludeDefinition[] = [];

        await provider.parseShaderCode(path.join(tmpDir, 'main.glsl'), code, buffers, includes, false);
        assert.strictEqual(buffers.length, 1);

        const buffer = buffers[0];
        assert.strictEqual(buffer.VertexFile, undefined);
        assert.strictEqual(buffer.VertexCode, undefined);

        assert.ok(
            diags.some((d) => d.message.includes('Custom vertex shaders (#iVertex) require shader-toy.glslVersion')),
            'Expected an error diagnostic explaining WebGL2-only #iVertex'
        );
    });

    test('WebGL2 mode: #iVertex "default" disables custom vertex shader', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shader-toy-ivertex-'));
        const code = `#iVertex "default"\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(0.0); }\n`;

        const diags: CapturedDiagnostic[] = [];
        const provider = new BufferProvider(makeFakeContext({ glslVersion: 'WebGL2' }, diags));
        const buffers: Types.BufferDefinition[] = [];
        const includes: Types.IncludeDefinition[] = [];

        await provider.parseShaderCode(path.join(tmpDir, 'main.glsl'), code, buffers, includes, false);
        assert.strictEqual(buffers.length, 1);

        const buffer = buffers[0];
        assert.strictEqual(buffer.VertexFile, undefined);
        assert.strictEqual(buffer.VertexCode, undefined);
        assert.strictEqual(diags.length, 0);
    });
});
