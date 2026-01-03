import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

suite('Better Diag: WebView runtime_env error surfacing', () => {
    const runRuntimeEnv = () => {
        const repoRoot = path.resolve(__dirname, '..', '..');
        const runtimeEnvPath = path.join(repoRoot, 'resources', 'webview', 'runtime_env.js');
        const source = fs.readFileSync(runtimeEnvPath, 'utf8');

        const messageElement = { innerText: '' };
        const handlers: Record<string, (event: any) => void> = {};

        const sandbox: any = {
            document: {
                getElementById: (id: string) => (id === 'message' ? messageElement : undefined)
            },
            addEventListener: (type: string, handler: (event: any) => void) => {
                handlers[type] = handler;
            },
            ShaderToy: undefined,
        };

        vm.createContext(sandbox);
        vm.runInContext(source, sandbox);

        return { messageElement, handlers };
    };

    test('No events: message remains empty', () => {
        const { messageElement } = runRuntimeEnv();
        assert.strictEqual(messageElement.innerText, '');
    });

    test('Error + unhandledrejection: message is populated', () => {
        const { messageElement, handlers } = runRuntimeEnv();

        assert.ok(typeof handlers.error === 'function');
        assert.ok(typeof handlers.unhandledrejection === 'function');

        handlers.error({ error: new Error('boom') });
        assert.ok(messageElement.innerText.includes('WebView error'));
        assert.ok(messageElement.innerText.includes('boom'));

        messageElement.innerText = '';
        handlers.unhandledrejection({ reason: 'nope' });
        assert.ok(messageElement.innerText.includes('Unhandled promise rejection'));
        assert.ok(messageElement.innerText.includes('nope'));
    });
});
