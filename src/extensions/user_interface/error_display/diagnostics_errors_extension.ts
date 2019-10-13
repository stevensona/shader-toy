'use strict';

import { WebviewExtension } from '../../webview_extension';

export class DiagnosticsErrorsExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
console.error = function (message) {
    if('7' in arguments) {
        let diagnostics = [];
        let message = arguments[7].replace(/ERROR: \\d+:(\\d+):\\W(.*)\\n/g, function(match, line, error) {
            let lineNumber = Number(line) - currentShader.LineOffset;
            diagnostics.push({
                line: lineNumber,
                message: error
            });
            let lineHighlight = \`${`<a class="error" unselectable onclick="revealError(\${lineNumber}, '\${currentShader.File}')">Line \${lineNumber}</a>`}\`;
            return \`<li>\${lineHighlight}: \${error}</li>\`;
        });
        let diagnosticBatch = {
            filename: currentShader.File,
            diagnostics: diagnostics
        };
        vscode.postMessage({
            command: 'showGlslDiagnostic',
            type: 'error',
            diagnosticBatch: diagnosticBatch
        });

        $("#message").append(\`<h3>Shader failed to compile - \${currentShader.Name} </h3>\`);
        $("#message").append('<ul>');
        $("#message").append(message);
        $("#message").append('</ul>');
    }
};`;
    }
}
