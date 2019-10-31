'use strict';

import { WebviewExtension } from '../../webview_extension';

export class DiagnosticsErrorsExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
console.error = function () {
    if('7' in arguments) {
        let errorRegex = /ERROR: \\d+:(\\d+):\\W(.*)\\n/g;
        let rawErrors = arguments[7];
        let match;
        
        let diagnostics = [];
        let message = '';
        while(match = errorRegex.exec(rawErrors)) {
            let lineNumber = Number(match[1]) - currentShader.LineOffset;
            let error = match[2];
            diagnostics.push({
                line: lineNumber,
                message: error
            });
            let lineHighlight = \`${`<a class='error' unselectable onclick='revealError(\${lineNumber}, "\${currentShader.File}")'>Line \${lineNumber}</a>`}\`;
            message += \`<li>\${lineHighlight}: \${error}</li>\`;
        }
        console.log(message);
        let diagnosticBatch = {
            filename: currentShader.File,
            diagnostics: diagnostics
        };
        vscode.postMessage({
            command: 'showGlslDiagnostic',
            type: 'error',
            diagnosticBatch: diagnosticBatch
        });

        $('#message').append(\`<h3>Shader failed to compile - \${currentShader.Name} </h3>\`);
        $('#message').append('<ul>');
        $('#message').append(message);
        $('#message').append('</ul>');
    }
};`;
    }
}
