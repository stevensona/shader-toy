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
        for (let i in buffers) {
            let buffer = buffers[i];
            let uniforms = buffer.CustomUniforms;
            for (let uniform of uniforms) {
                let uniform_access = `buffers[${i}].UniformValues.${uniform.Name}`;
                if (uniform.Typename === 'color3') {
                    this.content += `\
let ${uniform.Name} = [ ${uniform_access}[0] / 255.0, ${uniform_access}[1] / 255.0, ${uniform_access}[2] / 255.0 ];
`;
                    uniform_access = uniform.Name;
                }
                this.content += `\
buffers[${i}].Shader.uniforms.${uniform.Name} = { type: '${this.mapArrayToShaderType(uniform.Default)}', value: ${uniform_access} };
`;
            }
        }
        this.content += `\
if (vscode !== undefined) {
    vscode.postMessage({
        command: 'updateUniformsGuiOpen',
        value: !dat_gui.closed
    });
}
`;
    }

    private mapArrayToShaderType(value: number[]) {
        let l = value.length;
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
