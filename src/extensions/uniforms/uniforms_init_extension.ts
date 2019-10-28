'use strict';

import * as Types from '../../typenames';
import { WebviewExtension } from '../webview_extension';

export class UniformsInitExtension implements WebviewExtension {
    private content: string;

    constructor(buffers: Types.BufferDefinition[]) {
        this.content = '';
        this.processBuffers(buffers);
    }

    private processBuffers(buffers: Types.BufferDefinition[]) {
        for (let buffer of buffers) {
            let uniforms = buffer.CustomUniforms;
            for (let uniform of uniforms) {
                let threeType = this.mapArrayToThreeType(uniform.Default);
                if (threeType === 'number') {
                    this.content += `\
let ${uniform.Name} = ${uniform.Default};
`;
                }
                else {
                    this.content += `\
let ${uniform.Name} = new ${threeType}(${uniform.Default});
`;
                }
            }
        }
    }

    private mapArrayToThreeType(value: number[]) {
        let l = value.length;
        switch (l) {
            case 1:
                return 'number';
            case 2:
            case 3:
            case 4:
                return `THREE.Vector${l}`;
            default:
                return 'THREE.ErrorType';
        }
    }

    public generateContent(): string {
        return this.content;
    }
}
