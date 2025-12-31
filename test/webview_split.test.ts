import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import { WebviewContent } from '../src/webviewcontent';
import { WebviewModuleScriptExtension } from '../src/extensions/webview_module_script_extension';

suite('Webview Split', () => {
    test('Template uses whole-line webview module placeholders', () => {
        const repoRoot = path.resolve(__dirname, '..', '..');
        const templatePath = path.join(repoRoot, 'resources', 'webview_base.html');

        const template = fs.readFileSync(templatePath, 'utf8');

        assert.ok(template.includes('<!-- Webview runtime_env.js -->'));
        assert.ok(!template.includes('<script src="<!-- Webview runtime_env.js -->"></script>'));
    });

    test('Portable preview inlines split runtime module JS', () => {
        const repoRoot = path.resolve(__dirname, '..', '..');
        const relativePath = 'webview/runtime_env.js';
        const runtimeEnvPath = path.join(repoRoot, 'resources', relativePath);

        const ext = new WebviewModuleScriptExtension(
            () => 'unused-in-standalone',
            true,
            relativePath,
            () => fs.readFileSync(runtimeEnvPath, 'utf8'),
        );

        const content = ext.generateContent();

        assert.ok(content.includes('<script'));
        assert.ok(content.includes('getVscodeApi'));
        assert.ok(!content.includes('data:text/javascript'));

        // Extra safety: placeholder replacement should be possible.
        const templatePath = path.join(repoRoot, 'resources', 'webview_base.html');
        const webviewContent = new WebviewContent(templatePath);
        const placeholderLineNumber = webviewContent
            .getLines()
            .findIndex((l) => l.trim() === '<!-- Webview runtime_env.js -->') + 1;
        assert.ok(placeholderLineNumber > 0);

        webviewContent.replaceWithinLine('<!-- Webview runtime_env.js -->', content, placeholderLineNumber);
        const updatedLine = webviewContent.getLine(placeholderLineNumber);
        assert.ok(updatedLine.includes('getVscodeApi'));
    });
});
