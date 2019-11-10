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
        let has_uniforms = false;
        for (let buffer of buffers) {
            if (buffer.CustomUniforms.length > 0) {
                has_uniforms = true;
                break;
            }
        }

        if (has_uniforms) {
            this.content += `
let dat_gui = new dat.GUI({ autoPlace: false });
var dat_gui_container = document.getElementById('dat_gui_container');
dat_gui_container.appendChild(dat_gui.domElement);
`;
        }

        for (let i in buffers) {
            let buffer = buffers[i];
            let uniforms = buffer.CustomUniforms;
            if (uniforms.length > 0) {
                this.content += `\
buffers[${i}].UniformValues = {};
`;
            }

            for (let uniform of uniforms) {
                let uniform_values = `buffers[${i}].UniformValues`;
                let threeType = this.mapArrayToThreeType(uniform.Default);
                if (threeType === 'number') {
                    this.content += `\
${uniform_values}.${uniform.Name} = ${uniform.Default};
`;
                }
                else {
                    this.content += `\
${uniform_values}.${uniform.Name} = [${uniform.Default}];
`;
                }

                this.content += `\
${this.getDatGuiValueString(uniform_values, uniform.Name, uniform)};
`;
            }
        }
    }

    private getDatGuiValueString(object: string, property: string, value: Types.UniformDefinition) {
        if (value.Default.length === 1) {
            let min = value.Min ? `.min(${value.Min})` : '';
            let max = value.Max ? `.max(${value.Max})` : '';
            let step = value.Step ? `.step(${value.Step})` : '';
            return `dat_gui.add(${object}, '${property}')${min}${max}${step}`;
        }
        else if (value.Default.length === 3 && !value.Min && !value.Max && !value.Step) {
            return `dat_gui.addColor(${object}, '${property}')`;
        }
        else {
            let datGuiString = '';
            let sub_object = `${object}.${property}`;
            for (let i = 0; i < value.Default.length; i++) {
                let sub_value: Types.UniformDefinition = {
                    Name: this.indexToDimension(i),
                    Default: [ value.Default[i] ],
                    Min: value.Min ? [ value.Min[i] ] : undefined,
                    Max: value.Max ? [ value.Max[i] ] : undefined,
                    Step: value.Step ? [ value.Step[i] ] : undefined,
                };
                datGuiString += `
${this.getDatGuiValueString(sub_object, sub_value.Name, sub_value)}.name('${property}.${sub_value.Name}');`;
            }
            return datGuiString;
        }
    }
    private indexToDimension(index: number) {
        let dimensionStrings = [ 'x', 'y', 'z', 'w' ];
        return dimensionStrings[index];
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
