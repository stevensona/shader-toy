'use strict';

import { WebviewExtension } from '../../webview_extension';

export class DefaultErrorsExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
(() => {
    const consoleError = console.error ? console.error.bind(console) : undefined;
    console.error = function () {
        try {
            // The shader info log can appear in different argument positions.
            let rawErrors = undefined;
            for (let i = arguments.length - 1; i >= 0; i--) {
                const v = arguments[i];
                if (typeof v === 'string' && v.indexOf('ERROR:') >= 0) {
                    rawErrors = v;
                    break;
                }
            }

            if (rawErrors !== undefined && currentShader && currentShader.LineOffset !== undefined) {
                // Typical WebGL log format:
                //   ERROR: <sourceId>:<line>: <message>
                let message = rawErrors.replace(/ERROR:\\s*(\\d+):(\\d+):\\W(.*?)(?:\\n|$)/g, function(match, sourceId, line, error) {
                    const sid = Number(sourceId);
                    let lineNumber = Number(line) - (currentShader.LineOffset || 0);
                    const file = (sid === 0)
                        ? currentShader.File
                        : ((typeof sourceIdToFile === 'object' && sourceIdToFile[sid]) ? sourceIdToFile[sid] : currentShader.File);
                    let lineHighlight = "<a class='error' unselectable onclick='revealError(" + lineNumber + ", " + JSON.stringify(file) + ")'>Line " + lineNumber + "</a>";
                    return '<li>' + lineHighlight + ': ' + error + ' <span>(' + file + ')</span></li>';
                });

                $('#message').append(\`<h3>Shader failed to compile - \${currentShader.Name} </h3>\`);
                $('#message').append('<ul>');
                $('#message').append(message);
                $('#message').append('</ul>');
            }
        } catch (e) {
            // Ignore and fall through.
        }

        if (consoleError) {
            consoleError.apply(console, arguments);
        }
    };
})();`;
    }
}
