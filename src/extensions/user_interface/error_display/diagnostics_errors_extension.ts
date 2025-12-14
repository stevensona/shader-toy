'use strict';

import { WebviewExtension } from '../../webview_extension';

export class DiagnosticsErrorsExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
(() => {
    const consoleError = console.error ? console.error.bind(console) : undefined;
    console.error = function () {
        try {
            let rawErrors = undefined;
            for (let i = arguments.length - 1; i >= 0; i--) {
                const v = arguments[i];
                if (typeof v === 'string' && v.indexOf('ERROR:') >= 0) {
                    rawErrors = v;
                    break;
                }
            }

            if (rawErrors !== undefined && currentShader && currentShader.LineOffset !== undefined) {
                let errorRegex = /ERROR:\\s*(\\d+):(\\d+):\\W(.*?)(?:\\n|$)/g;
                let match;

                let message = '';
                const diagnosticsByFile = {};

                while (match = errorRegex.exec(rawErrors)) {
                    const sid = Number(match[1]);
                    const rawLine = Number(match[2]);
                    const error = match[3];
                    const file = (sid === 0)
                        ? currentShader.File
                        : ((typeof sourceIdToFile === 'object' && sourceIdToFile[sid]) ? sourceIdToFile[sid] : currentShader.File);
                    const lineNumber = rawLine - (currentShader.LineOffset || 0);

                    if (diagnosticsByFile[file] === undefined) {
                        diagnosticsByFile[file] = [];
                    }
                    diagnosticsByFile[file].push({ line: lineNumber, message: error });

                    let lineHighlight = "<a class='error' unselectable onclick='revealError(" + lineNumber + ", " + JSON.stringify(file) + ")'>Line " + lineNumber + "</a>";
                    message += '<li>' + lineHighlight + ': ' + error + ' <span>(' + file + ')</span></li>';
                }

                if (vscode !== undefined) {
                    for (const filename in diagnosticsByFile) {
                        vscode.postMessage({
                            command: 'showGlslDiagnostic',
                            type: 'error',
                            diagnosticBatch: {
                                filename: filename,
                                diagnostics: diagnosticsByFile[filename]
                            }
                        });
                    }
                }

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
