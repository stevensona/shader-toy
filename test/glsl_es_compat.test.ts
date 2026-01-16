import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

import { BufferProvider } from '../src/bufferprovider';
import { Context } from '../src/context';
import * as Types from '../src/typenames';

const MAINIMAGE_ONLY_SHADER = `// Inlined unit-test shader: mainImage-only (no main())
void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime;

    vec3 col = 0.5 + 0.5 * cos(t + vec3(0.0, 2.0, 4.0) + uv.xyx * 6.2831853);
    fragColor = vec4(col, 1.0);
}
`;

const GLSL_FRAGCOLOR_MAIN_SHADER = `// Inlined unit-test shader: explicit main() writing GLSL_FRAGCOLOR
void main()
{
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    float vignette = smoothstep(1.1, 0.2, length(uv - 0.5));

    vec3 col = vec3(uv, 0.5 + 0.5 * sin(iTime));
    col *= vignette;

    GLSL_FRAGCOLOR = vec4(col, 1.0);
}
`;

function readRepoFile(...segments: string[]): string {
    // Compiled tests run from out/test; repo root is two levels up.
    const repoRoot = path.resolve(__dirname, '../../');
    const filePath = path.join(repoRoot, ...segments);
    return fs.readFileSync(filePath, 'utf8');
}

function makeFakeContext(): Context {
    const fake: Partial<Context> = {
        getConfig: <T>(): T | undefined => undefined,
        mapUserPath: async (userPath: string) => ({ file: userPath, userPath }),
        // Avoid touching VS Code diagnostics in these unit tests.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        showDiagnostics: () => undefined,
    };

    return fake as Context;
}

function loadShaderCompileModule(): { prepareFragmentShader: (src: string, glslUseVersion3: boolean) => string } {
    const scriptText = readRepoFile('resources', 'webview', 'shader_compile.js');

    const sandbox: Record<string, unknown> = {
        window: {
            ShaderToy: {
                SELF_SOURCE_ID: '9999',
            },
        },
        globalThis: {},
        console: {
            warn: () => undefined,
            error: () => undefined,
        },
        Number,
        RegExp,
    };

    vm.runInNewContext(scriptText, sandbox);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shaderCompile = (sandbox.window as any).ShaderToy.shaderCompile;
    return {
        prepareFragmentShader: shaderCompile.prepareFragmentShader,
    };
}

suite('GLSL ES Compatibility', () => {
    test('BufferProvider injects main() wrapper for mainImage-only shaders', async () => {
        const provider = new BufferProvider(makeFakeContext());
        const buffers: Types.BufferDefinition[] = [];
        const includes: Types.IncludeDefinition[] = [];

        await provider.parseShaderCode('inmemory://glsl_es_compat_mainimage.glsl', MAINIMAGE_ONLY_SHADER, buffers, includes, false);
        assert.strictEqual(buffers.length, 1);

        const out = buffers[0].Code;
        assert.ok(out.includes('void main()'), 'Expected injected wrapper main()');
        assert.ok(out.includes('mainImage(GLSL_FRAGCOLOR, fragCoord);'), 'Expected wrapper to call mainImage() using GLSL_FRAGCOLOR');

        const injectedCount = (out.match(/void\s+main\s*\(\s*\)\s*\{/g) || []).length;
        assert.strictEqual(injectedCount, 1, 'Expected exactly one injected main()');
    });

    test('BufferProvider does not inject wrapper when main() exists', async () => {
        const provider = new BufferProvider(makeFakeContext());
        const buffers: Types.BufferDefinition[] = [];
        const includes: Types.IncludeDefinition[] = [];

        await provider.parseShaderCode('inmemory://glsl_es_compat_glsl_fragcolor.glsl', GLSL_FRAGCOLOR_MAIN_SHADER, buffers, includes, false);
        assert.strictEqual(buffers.length, 1);

        const out = buffers[0].Code;
        assert.ok(out.includes('void main()'), 'Expected shader to still contain main()');
        assert.ok(out.includes('GLSL_FRAGCOLOR'), 'Expected shader to use GLSL_FRAGCOLOR');
        assert.strictEqual(out.includes('mainImage(GLSL_FRAGCOLOR, fragCoord);'), false, 'Expected no injected mainImage wrapper');
    });

    test('shader_compile.prepareFragmentShader prelude supports ES100 and ES300', () => {
        const { prepareFragmentShader } = loadShaderCompileModule();

        const prep100 = prepareFragmentShader(MAINIMAGE_ONLY_SHADER, false);
        assert.ok(prep100.includes('#define GLSL_FRAGCOLOR gl_FragColor'), 'ES100 prelude should define GLSL_FRAGCOLOR as gl_FragColor');
        assert.strictEqual(prep100.includes('layout(location = 0)'), false, 'ES100 prelude should not declare a layout output');

        const prep300 = prepareFragmentShader(MAINIMAGE_ONLY_SHADER, true);
        assert.ok(prep300.includes('layout(location = 0) out highp vec4 layoutFragColor;'), 'ES300 prelude should declare an explicit output');
        assert.ok(prep300.includes('#define GLSL_FRAGCOLOR layoutFragColor'), 'ES300 prelude should define GLSL_FRAGCOLOR');
        assert.ok(prep300.includes('#define texture2D texture'), 'ES300 prelude should shim texture2D');
        assert.ok(prep300.includes('#define textureCube texture'), 'ES300 prelude should shim textureCube');
    });
});
