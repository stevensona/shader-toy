'use strict';

import * as Types from '../../typenames';
import { WebviewExtension } from '../webview_extension';

export class UniformsPreambleExtension implements WebviewExtension {
    private content: string;

    constructor(buffers: Types.BufferDefinition[]) {
        this.content = '';
        this.processBuffers(buffers);
    }

    private processBuffers(buffers: Types.BufferDefinition[]) {
        for (let buffer of buffers) {
            let uniforms = buffer.CustomUniforms;
            for (let uniform of uniforms) {
                let glslType = this.mapArrayToGlslType(uniform.Default);
                this.content += `\
uniform ${glslType} ${uniform.Name};
`;
            }
        }
    }

    private mapArrayToGlslType(value: number[]) {
        let l = value.length;
        switch (l) {
            case 1:
                return 'float';
            case 2:
            case 3:
            case 4:
                return `vec${l}`;
            default:
                return 'error_type';
        }
    }

    public generateContent(): string {
        return this.content;
    }
}
