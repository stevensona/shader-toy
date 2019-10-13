'use strict';

import * as Types from '../../typenames';
import { WebviewExtension } from '../webview_extension';
import { ShaderPreambleExtension } from '../preamble_extension';
import { KeyboardShaderExtension } from '../keyboard/keyboard_shader_extension';

export class ShadersExtension implements WebviewExtension {
    private content: string;

    constructor(buffers: Types.BufferDefinition[], preambleExtension: ShaderPreambleExtension, keyboardShaderExtension: KeyboardShaderExtension | undefined) {
        this.content = '';
        this.processBuffers(buffers, preambleExtension, keyboardShaderExtension);
    }

    private processBuffers(buffers: Types.BufferDefinition[],  preambleExtension: ShaderPreambleExtension, keyboardShaderExtension: KeyboardShaderExtension | undefined) {
        for (let buffer of buffers) {
            this.content += `\
<script id="${buffer.Name}" type="x-shader/x-fragment">
${preambleExtension.getShaderPreamble()}
${keyboardShaderExtension !== undefined ? keyboardShaderExtension.getShaderPreamble() : ""}
${buffer.Code}
</script>`;
        }
    }

    public generateContent(): string {
        return this.content;
    }
}
