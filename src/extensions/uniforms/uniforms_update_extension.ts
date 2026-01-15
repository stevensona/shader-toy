'use strict';

import * as Types from '../../typenames';
import { WebviewExtension } from '../webview_extension';

export class UniformsUpdateExtension implements WebviewExtension {
    private content: string;

    constructor(buffers: Types.BufferDefinition[]) {
        this.content = '';
        this.processBuffers(buffers);
    }

    private processBuffers(buffers: Types.BufferDefinition[]) {
        for (const i in buffers) {
            const buffer = buffers[i];
            const uniforms = buffer.CustomUniforms;
            for (const uniform of uniforms) {
                let uniform_access = `buffers[${i}].UniformValues.${uniform.Name}`;
                if (uniform.Typename === 'color3') {
                    this.content += `\
let ${uniform.Name} = [ ${uniform_access}[0] / 255.0, ${uniform_access}[1] / 255.0, ${uniform_access}[2] / 255.0 ];
`;
                    uniform_access = uniform.Name;
                }
                this.content += `\
if (buffers[${i}] && buffers[${i}].Shader && buffers[${i}].Shader.uniforms) {
    if (!buffers[${i}].Shader.uniforms.${uniform.Name}) {
        buffers[${i}].Shader.uniforms.${uniform.Name} = { type: '${this.mapArrayToShaderType(uniform.Default)}', value: ${uniform_access} };
    } else {
        buffers[${i}].Shader.uniforms.${uniform.Name}.value = ${uniform_access};
    }
}
`;
            }
        }
        this.content += `\
try {
    window.ShaderToy = window.ShaderToy || {};
    if (!window.ShaderToy.__sentUniformsGuiOpen && vscode !== undefined) {
        window.ShaderToy.__sentUniformsGuiOpen = true;
        vscode.postMessage({
            command: 'updateUniformsGuiOpen',
            value: !dat_gui.closed
        });
    }
} catch {
    // ignore
}
`;
    }

    private mapArrayToShaderType(value: number[]) {
        const l = value.length;
        switch (l) {
        case 1:
            return 'f';
        case 2:
        case 3:
        case 4:
            return `v${l}`;
        default:
            return 'err';
        }
    }

    public generateContent(): string {
        return this.content;
    }
}
