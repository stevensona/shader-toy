import * as assert from 'assert';

import { BufferProvider } from '../src/bufferprovider';

suite('Better Diag: main() injection ignores commented signatures', () => {
    const makeProvider = () => {
        const fakeContext: any = {
            getConfig: (key: string) => {
                // Keep the pipeline quiet and deterministic for these tests.
                if (key === 'shaderToyStrictCompatibility') return false;
                if (key === 'warnOnUndefinedTextures') return false;
                if (key === 'enableGlslifySupport') return false;
                if (key === 'enabledAudioInput') return false;
                if (key === 'testCompileIncludedFiles') return false;
                return false;
            },
        };
        return new BufferProvider(fakeContext);
    };

    const parse = async (code: string) => {
        const provider = makeProvider();
        const buffers: any[] = [];
        const commonIncludes: any[] = [];
        await provider.parseShaderCode('shader.glsl', code, buffers, commonIncludes, true);
        assert.strictEqual(buffers.length, 1);
        return buffers[0].Code as string;
    };

    test('Injects wrapper when only mainImage exists', async () => {
        const code = `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    fragColor = vec4(1.0);
}
`;
        const out = await parse(code);
        assert.ok(out.includes('void main() {'));
        assert.ok(out.includes('mainImage(GLSL_FRAGCOLOR, fragCoord);'));
    });

    test('Still injects when commented-out void main() exists', async () => {
        const code = `
// void main() { }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    fragColor = vec4(1.0);
}
`;
        const out = await parse(code);
        assert.ok(out.includes('void main() {'));
        assert.ok(out.includes('mainImage(GLSL_FRAGCOLOR, fragCoord);'));
    });

    test('Still injects with multiple commented-out void main() signatures', async () => {
        const code = `
/* void main() { } */
// void main() { }
// another comment void main() { }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    fragColor = vec4(1.0);
}
`;
        const out = await parse(code);
        assert.ok(out.includes('void main() {'));
        assert.ok(out.includes('mainImage(GLSL_FRAGCOLOR, fragCoord);'));
    });

    test('Does not inject when real void main() exists (even if mainImage exists too)', async () => {
        const code = `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    fragColor = vec4(1.0);
}
void main() {
    gl_FragColor = vec4(0.0);
}
`;
        const out = await parse(code);
        // The injected wrapper is the only place that calls mainImage(GLSL_FRAGCOLOR, fragCoord)
        assert.ok(!out.includes('mainImage(GLSL_FRAGCOLOR, fragCoord);'));
    });

    test('Does not inject when only commented-out mainImage exists', async () => {
        const code = `
// void mainImage(out vec4 fragColor, in vec2 fragCoord) {
//     fragColor = vec4(1.0);
// }
`;
        const out = await parse(code);
        assert.ok(!out.includes('void main() {'));
        assert.ok(!out.includes('mainImage(GLSL_FRAGCOLOR, fragCoord);'));
    });
});
