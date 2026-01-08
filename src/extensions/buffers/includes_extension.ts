'use strict';

import * as Types from '../../typenames';
import { WebviewExtension } from '../webview_extension';
import { ShaderPreambleExtension } from '../preamble_extension';

export class IncludesExtension implements WebviewExtension {
    private content: string;

    constructor(includes: Types.IncludeDefinition[], preambleExtension: ShaderPreambleExtension) {
        this.content = '';
        this.processBuffers(includes, preambleExtension);
    }

    private processBuffers(includes: Types.IncludeDefinition[], preambleExtension: ShaderPreambleExtension) {
        for (const include of includes) {
            this.content += `\
<script id='${include.Name}' type='x-shader/x-fragment'>
${preambleExtension.getShaderPreamble()}
${include.Code}
</script>`;
        }
    }

    public generateContent(): string {
        return this.content;
    }
}
