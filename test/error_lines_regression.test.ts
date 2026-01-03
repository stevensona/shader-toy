import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vm from 'vm';

import { BufferProvider } from '../src/bufferprovider';
import { IncludesInitExtension } from '../src/extensions/buffers/includes_init_extension';
import { DefaultErrorsExtension } from '../src/extensions/user_interface/error_display/default_errors_extension';
import { DiagnosticsErrorsExtension } from '../src/extensions/user_interface/error_display/diagnostics_errors_extension';

suite('Error Lines Regression', () => {
    test('Nested includes assign source ids and normalize SELF_SOURCE_ID', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadertoy-error-lines-'));

        const mainPath = path.join(tmpDir, 'main.glsl');
        const includeAPath = path.join(tmpDir, 'a.glsl');
        const includeBPath = path.join(tmpDir, 'b.glsl');

        fs.writeFileSync(includeBPath, 'float foo() { return 1.0; }\n', 'utf8');
        fs.writeFileSync(includeAPath, '#include "b.glsl"\nfloat bar() { return foo(); }\n', 'utf8');
        fs.writeFileSync(
            mainPath,
            '#include "a.glsl"\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(bar()); }\n',
            'utf8'
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fakeContext: any = {
            mapUserPath: async (userPath: string, fromFile: string) => ({
                file: path.resolve(path.dirname(fromFile), userPath),
                userPath,
            }),
            showDiagnostics: () => undefined,
            getConfig: () => false,
        };

        const provider = new BufferProvider(fakeContext);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const buffers: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const commonIncludes: any[] = [];

        const mainCode = fs.readFileSync(mainPath, 'utf8');
        await provider.parseShaderCode(mainPath, mainCode, buffers, commonIncludes, false);

        assert.ok(buffers.length >= 1, 'Expected at least one buffer definition');
        const code: string = buffers[0].Code;

        // b.glsl should get includeSourceId = 1 when inlined into a.glsl.
        assert.ok(code.includes('#line 1 1'), 'Expected nested include to begin with "#line 1 1"');
        // a.glsl should get includeSourceId = 2 when inlined into main.glsl.
        assert.ok(code.includes('#line 1 2'), 'Expected include to begin with "#line 1 2"');

        // Top-level compilation units should not contain the sentinel; it is normalized to sourceId 0.
        assert.ok(!code.includes('65535'), 'Expected SELF_SOURCE_ID (65535) to be normalized away in final code');
    });

    test('Error display regex parses ERROR: <sid>:<line>: ... (and broken escaping is detectable)', () => {
        const run = (scriptText: string, rawErrors: string, commonIncludes: Array<{ File: string }>) => {
            const appends: string[] = [];
            const sandbox = {
                window: {},
                vscode: undefined,
                commonIncludes,
                currentShader: { Name: 'Image', File: 'main.glsl', LineOffset: 0 },
                revealError: () => undefined,
                $: () => ({
                    append: (s: string) => appends.push(String(s)),
                }),
                console: {
                    error: (..._args: unknown[]) => undefined,
                    log: (..._args: unknown[]) => undefined,
                },
            };

            vm.runInNewContext(scriptText, sandbox);
            // The IIFE replaces console.error; calling it should generate message HTML.
            sandbox.console.error('shader compile failed', rawErrors);
            return appends.join('\n');
        };

        const cases = [
            new DefaultErrorsExtension().generateContent(),
            new DiagnosticsErrorsExtension().generateContent(),
        ];

        const rawErrors = 'ERROR: 1:3: something bad\n';
        const commonIncludes = [{ File: 'include_a.glsl' }];

        for (const content of cases) {
            assert.ok(content.includes("v.indexOf('ERROR:')"), 'Expected ERROR token scan in console.error wrapper');

            const okHtml = run(content, rawErrors, commonIncludes);
            assert.ok(okHtml.includes('<li>'), 'Expected parsed errors to render as <li> entries');
            assert.ok(okHtml.includes('include_a.glsl'), 'Expected sid>0 mapping to commonIncludes[sid-1].File');

            // Negative: simulate the classic bug (missing escaping in the TS template string)
            // where a \n inside the TS string becomes an actual newline in the emitted regex literal.
            const broken = content.replace('(?:\\n|$)', `(?:
|$)`);
            assert.throws(
                () => run(broken, rawErrors, commonIncludes),
                /SyntaxError|Invalid regular expression/i,
                'Expected broken escaping to make the emitted webview JS fail to parse'
            );
        }
    });

    test('Error display maps sid==0 to current shader and sid>0 via commonIncludes[sid-1]', () => {
        const defaultContent = new DefaultErrorsExtension().generateContent();
        const diagContent = new DiagnosticsErrorsExtension().generateContent();

        for (const content of [defaultContent, diagContent]) {
            assert.ok(content.includes('sid === 0'), 'Expected sid==0 special-case mapping');
            assert.ok(content.includes('commonIncludes[sid - 1]'), 'Expected commonIncludes[sid - 1] mapping');
        }
    });

    test('console.error wrapping preserves original call-through', () => {
        const defaultContent = new DefaultErrorsExtension().generateContent();
        const diagContent = new DiagnosticsErrorsExtension().generateContent();

        for (const content of [defaultContent, diagContent]) {
            assert.ok(content.includes('const consoleError = console.error ? console.error.bind(console) : undefined;'));
            assert.ok(content.includes('consoleError.apply(console, arguments)'));
        }
    });

    test('IncludesInitExtension emits JSON-escaped filenames', () => {
        const includes = [
            {
                Name: 'name with "quotes" and \\slashes',
                File: 'C:\\path with spaces\\file"name.glsl',
                Code: '',
                LineCount: 1,
            },
        ];

        const ext = new IncludesInitExtension(includes as never);
        const content = ext.generateContent();

        // Should serialize as JS string literals via JSON.stringify, not raw injection.
        assert.ok(content.includes('Name: "name with \\"quotes\\" and \\\\slashes"'));
        assert.ok(content.includes('File: "C:\\\\path with spaces\\\\file\\"name.glsl"'));
    });

    test('WebGL2 line offset adjustment remains present and replaceable', () => {
        const repoRoot = path.resolve(__dirname, '..', '..');

        const templatePath = path.join(repoRoot, 'resources', 'webview_base.html');
        const template = fs.readFileSync(templatePath, 'utf8');
        assert.ok(template.includes('LineOffset: <!-- Preamble Line Numbers --> + 2 + (isWebGL2 ? 16 : 0)'));

        const providerPath = path.join(repoRoot, 'src', 'webviewcontentprovider.ts');
        const providerSource = fs.readFileSync(providerPath, 'utf8');
        assert.ok(providerSource.includes("addReplaceModule(preambleExtension, 'LineOffset: <!-- Preamble Line Numbers --> + 2'"));
        assert.ok(providerSource.includes("addReplaceModule(preambleExtension, 'LineOffset: <!-- Preamble Line Numbers --> + 2 + (isWebGL2 ? 16 : 0)'"));
    });
});
