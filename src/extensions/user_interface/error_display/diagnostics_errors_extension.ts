'use strict';

import { WebviewExtension } from '../../webview_extension';

export class DiagnosticsErrorsExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
(() => {
    // Optional hook for feature extensions (e.g. WebGL2/iVertex) to rewrite
    // compiler errors without forking the core diagnostics/error display logic.
    // Expected signature:
    //   window.shaderToyRewriteGlslError({ sid, lineNumber, file, error, currentShader })
    // and return: { lineNumber?: number, file?: string, error?: string } | undefined
    const rewriteGlslError = (typeof window !== 'undefined' && window.shaderToyRewriteGlslError)
        ? window.shaderToyRewriteGlslError
        : undefined;

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

            if (rawErrors !== undefined && currentShader) {
                let errorRegex = /ERROR:\\s*(\\d+):(\\d+):\\W(.*?)(?:\\n|$)/g;
                let match;

                let message = '';
                const diagnosticsByFile = {};

                while (match = errorRegex.exec(rawErrors)) {
                    const sid = Number(match[1]);
                    const rawLine = Number(match[2]);
                    let error = match[3];
                    let file = (sid === 0)
                        ? currentShader.File
                        : ((Array.isArray(commonIncludes) && commonIncludes[sid - 1] && commonIncludes[sid - 1].File) ? commonIncludes[sid - 1].File : currentShader.File);
                    let lineNumber = rawLine;

                    if (typeof rewriteGlslError === 'function') {
                        const rewritten = rewriteGlslError({ sid, lineNumber, file, error, currentShader });
                        if (rewritten && typeof rewritten === 'object') {
                            if (rewritten.lineNumber !== undefined) lineNumber = rewritten.lineNumber;
                            if (rewritten.file !== undefined) file = rewritten.file;
                            if (rewritten.error !== undefined) error = rewritten.error;
                        }
                    }

                    if (typeof lineNumber === 'number' && lineNumber >= 1) {
                        if (diagnosticsByFile[file] === undefined) {
                            diagnosticsByFile[file] = [];
                        }
                        diagnosticsByFile[file].push({ line: lineNumber, message: error });

                        let lineHighlight = "<a class='error' unselectable onclick='revealError(" + lineNumber + ", " + JSON.stringify(file) + ")'>Line " + lineNumber + "</a>";
                        message += '<li>' + lineHighlight + ': ' + error + ' <span>(' + file + ')</span></li>';
                    }
                    else {
                        message += '<li>' + error + ' <span>(' + file + ')</span></li>';
                    }
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
