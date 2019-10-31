'use strict';

import { WebviewExtension } from '../../webview_extension';

export class DefaultErrorsExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
console.error = function (message) {
    if('7' in arguments) {
        let message = arguments[7].replace(/ERROR: \\d+:(\\d+):\\W(.*)\\n/g, function(match, line, error) {
            let lineNumber = Number(line) - currentShader.LineOffset;
            let lineHighlight = \`${`<a class='error' unselectable onclick='revealError(\${lineNumber}, "\${currentShader.File}")'>Line \${lineNumber}</a>`}\`;
            return \`<li>\${lineHighlight}: \${error}</li>\`;
        });

        $('#message').append(\`<h3>Shader failed to compile - \${currentShader.Name} </h3>\`);
        $('#message').append('<ul>');
        $('#message').append(message);
        $('#message').append('</ul>');
    }
};`;
    }
}
