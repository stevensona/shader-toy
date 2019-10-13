'use strict';

import { WebviewExtension } from '../../webview_extension';

export class GlslifyErrorsExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
console.error = function (message) {
    if('7' in arguments) {
        let message = arguments[7].replace(/ERROR: \\d+:(\\d+):\\W(.*)\\n/g, function(match, line, error) {
            return \`<li>\${error}</li>\`;
        });

        $("#message").append(\`<h3>Shader failed to compile - \${currentShader.Name}</h3>\`);
        $("#message").append(\`<h3>Line numbers are not available because the glslify option is enabled</h3>\`);
        $("#message").append('<ul>');
        $("#message").append(message);
        $("#message").append('</ul>');
    }
};`;
    }
}
