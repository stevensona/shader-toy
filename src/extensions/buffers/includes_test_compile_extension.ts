'use strict';

import { WebviewExtension } from '../webview_extension';

export class IncludesTestCompileExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
// bail if there is an error found in the include script
if(compileFragShader(gl, document.getElementById(include.Name).textContent) == false) {
    throw Error(\`Failed to compile $\{include.Name\}\`);
}`;
    }
}
