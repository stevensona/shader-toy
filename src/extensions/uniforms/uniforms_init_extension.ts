'use strict';

import * as Types from '../../typenames';
import { WebviewExtension } from '../webview_extension';

export class UniformsInitExtension implements WebviewExtension {
    private content: string;

    constructor(buffers: Types.BufferDefinition[], startingState: Types.UniformsGuiStartingData) {
        this.content = '';
        this.processBuffers(buffers, startingState);
    }

    private processBuffers(buffers: Types.BufferDefinition[], startingState: Types.UniformsGuiStartingData) {
                const sequencerPlusCss = `
.shader-toy-has-seq-plus {
    padding-right: 26px !important;
}

.shader-toy-seq-plus {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 24px;
    padding: 0;
    margin: 0;
    border: none;
    border-left: 1px solid rgba(255,255,255,0.18);
    background: rgba(0,0,0,0.22);
    color: #ddd;
    cursor: pointer;
    font-family: Consolas, monospace;
    font-size: 14px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
}

.shader-toy-seq-plus:hover { background: rgba(0,0,0,0.35); }
.shader-toy-seq-plus:active { background: rgba(0,0,0,0.45); }
`;

        let has_uniforms = false;
        for (const buffer of buffers) {
            if (buffer.CustomUniforms.length > 0) {
                has_uniforms = true;
                break;
            }
        }

        if (has_uniforms) {
            this.content += `
let dat_gui = new dat.GUI({ autoPlace: false, closed: ${!startingState.Open} });
var dat_gui_container = document.getElementById('dat_gui_container');
dat_gui_container.appendChild(dat_gui.domElement);

// Sequencer helper: add a small "+" button per scalar float/int iUniform row.
// Implemented via DOM injection (no changes to dat.GUI sources).
try {
    if (!document.getElementById('shader_toy_uniforms_seq_plus_style')) {
        const style = document.createElement('style');
        style.id = 'shader_toy_uniforms_seq_plus_style';
        style.textContent = ${JSON.stringify(sequencerPlusCss)};
        document.head.appendChild(style);
    }
} catch {
    // ignore
}

try {
    window.ShaderToyAddSequencerPlusButton = window.ShaderToyAddSequencerPlusButton || ((controller, getValue, uniformName) => {
        if (!controller || typeof uniformName !== 'string' || !uniformName) {
            return;
        }

        const tryAttach = () => {
            let li;
            try {
                li = controller.__li
                    || (controller.domElement && controller.domElement.closest ? controller.domElement.closest('li') : undefined)
                    || (controller.domElement ? controller.domElement.parentElement : undefined);
            } catch {
                li = undefined;
            }
            if (!li || !li.querySelector) {
                return false;
            }
            if (li.querySelector('.shader-toy-seq-plus')) {
                return true;
            }

            try {
                li.style.position = 'relative';
                if (li.classList && typeof li.classList.add === 'function') {
                    li.classList.add('shader-toy-has-seq-plus');
                }
            } catch {
                // ignore
            }
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'shader-toy-seq-plus';
            btn.textContent = '+';
            btn.title = 'Add/replace sequencer key at current time';
            btn.addEventListener('click', (ev) => {
                try {
                    ev.preventDefault();
                    ev.stopPropagation();
                } catch {
                    // ignore
                }
                let v;
                try {
                    v = (typeof getValue === 'function') ? getValue() : undefined;
                } catch {
                    v = undefined;
                }
                try {
                    if (vscode !== undefined) {
                        vscode.postMessage({
                            command: 'sequencerAddOrReplaceKeyFromUniform',
                            name: uniformName,
                            value: v
                        });
                    }
                } catch {
                    // ignore
                }
            });
            li.appendChild(btn);
            return true;
        };

        // dat.GUI DOM can be created synchronously, but retry once next frame if needed.
        if (!tryAttach()) {
            try {
                requestAnimationFrame(() => { tryAttach(); });
            } catch {
                // ignore
            }
        }
    });
} catch {
    // ignore
}

    // Optional: allow other modules (e.g. sequencer) to refresh controllers.
    window.ShaderToyUniformControllers = window.ShaderToyUniformControllers || new Map();
`;
        }

        for (const i in buffers) {
            const buffer = buffers[i];
            const uniforms = buffer.CustomUniforms;
            if (uniforms.length > 0) {
                this.content += `\
buffers[${i}].UniformValues = {};
`;
            }

            for (const uniform of uniforms) {
                const uniform_values = `buffers[${i}].UniformValues`;
                const threeType = this.mapArrayToThreeType(uniform.Default);

                let defaultValue = uniform.Default;
                if (uniform.Typename === 'color3') {
                    for (const i in defaultValue) {
                        defaultValue[i] = defaultValue[i] * 255.0;
                    }
                }

                const startingValue = startingState.Values.get(uniform.Name);
                if (startingValue !== undefined) {
                    defaultValue = startingValue;
                }

                if (threeType === 'number') {
                    this.content += `\
${uniform_values}.${uniform.Name} = ${defaultValue};
`;
                }
                else {
                    this.content += `\
${uniform_values}.${uniform.Name} = [${defaultValue}];
`;
                }

                this.content += `\
${this.getDatGuiValueString(uniform_values, uniform.Name, uniform)}
`;
            }
        }
    }

    private getDatGuiValueString(object: string, property: string, value: Types.UniformDefinition) {
        if (value.Default.length === 1) {
            return `\
{
    let controller = ${this.getRawDatGuiValueString(object, property, value)};
    try {
        if (window.ShaderToyUniformControllers && window.ShaderToyUniformControllers.get) {
            const existing = window.ShaderToyUniformControllers.get('${value.Name}') || [];
            existing.push(controller);
            window.ShaderToyUniformControllers.set('${value.Name}', existing);
        }
    } catch {
        // ignore
    }

    // If this is a scalar float/int uniform, add a small "+" button to add/replace a sequencer key at current time.
    try {
        const isSequencerSupported = ${value.Typename === 'float' || value.Typename === 'int'};
        if (isSequencerSupported && controller && window.ShaderToyAddSequencerPlusButton) {
            window.ShaderToyAddSequencerPlusButton(controller, () => ${object}.${property}, '${value.Name}');
        }
    } catch {
        // ignore
    }

    // When pauseWholeRender is enabled, request a one-shot frame so the UI change is visible.
    // (Sequencer scrubbing does the same via the 'renderOneFrame' message.)
    controller.onChange(() => {
        try {
            forceRenderOneFrame = true;
        } catch {
            // ignore
        }

        // Prefer the same mechanism used by sequencer scrubbing: ask the extension to
        // post 'renderOneFrame' back to the preview (works even if local bindings differ).
        // NOTE: This intentionally mirrors the sequencer's message-driven one-shot redraw.
        // If needed, we can optimize by coalescing/debouncing these requests during fast slider drags.
        try {
            if (typeof paused !== 'undefined' && paused && vscode !== undefined) {
                vscode.postMessage({ command: 'requestRenderOneFrame' });
            }
        } catch {
            // ignore
        }

    });

    controller.onFinishChange((value) => {
        if (vscode !== undefined) {
            vscode.postMessage({
                command: 'updateUniformsGuiValue',
                name: '${value.Name}',
                value: [ value ]
            });
        }
    });
}
`;
        }
        else if (value.Typename === 'color3') {
            return `\
{
    let controller = ${this.getRawDatGuiValueString(object, property, value)};
    try {
        if (window.ShaderToyUniformControllers && window.ShaderToyUniformControllers.get) {
            const existing = window.ShaderToyUniformControllers.get('${value.Name}') || [];
            existing.push(controller);
            window.ShaderToyUniformControllers.set('${value.Name}', existing);
        }
    } catch {
        // ignore
    }
    // When pauseWholeRender is enabled, request a one-shot frame so the UI change is visible.
    controller.onChange(() => {
        try {
            forceRenderOneFrame = true;
        } catch {
            // ignore
        }
    });
    controller.onFinishChange((value) => {
        if (vscode !== undefined) {
            vscode.postMessage({
                command: 'updateUniformsGuiValue',
                name: '${value.Name}',
                value: value
            });
        }
    });
}
`;
        }
        else {
            let datGuiString = `{
    let flatten = (values) => {
        let flattened_values = [];
        for (let value of values) {
            flattened_values.push(value.value);
        }
        return flattened_values;
    };
    let values = [];
`;
            const sub_object = `${object}.${property}`;
            for (let i = 0; i < value.Default.length; i++) {
                const sub_value: Types.UniformDefinition = {
                    Name: this.indexToDimension(i),
                    Typename: value.Typename[0] === 'i' ? 'integer' : 'float',
                    Default: [ value.Default[i] ],
                    Min: value.Min ? [ value.Min[i] ] : undefined,
                    Max: value.Max ? [ value.Max[i] ] : undefined,
                    Step: value.Step ? [ value.Step[i] ] : undefined,
                };
                datGuiString += `\
    values.push({ value: ${sub_value.Default[0]} });
    let controller_${i} = ${this.getRawDatGuiValueString(`values[${i}]`, 'value', sub_value)}.name('${property}.${sub_value.Name}');
    controller_${i}.onChange((value) => {
        values[${i}].value = value;
        ${sub_object}[${i}] = value;
        try {
            forceRenderOneFrame = true;
        } catch {
            // ignore
        }
    });
    controller_${i}.onFinishChange((value) => {
        values[${i}].value = value;
        ${sub_object}[${i}] = value;
        if (vscode !== undefined) {
            vscode.postMessage({
                command: 'updateUniformsGuiValue',
                name: '${value.Name}',
                value: flatten(values)
            });
        }
    });
`;
            }
            datGuiString += '}';
            return datGuiString;
        }
    }
    private getRawDatGuiValueString(object: string, property: string, value: Types.UniformDefinition) {
        if (value.Default.length === 1) {
            const min = value.Min ? `.min(${value.Min})` : '';
            const max = value.Max ? `.max(${value.Max})` : '';
            const step = value.Step ? `.step(${value.Step})` : '';
            return `dat_gui.add(${object}, '${property}')${min}${max}${step}`;
        }
        else if (value.Default.length === 3 && !value.Min && !value.Max && !value.Step) {
            return `dat_gui.addColor(${object}, '${property}')`;
        }   
    }
    
    private indexToDimension(index: number) {
        const dimensionStrings = [ 'x', 'y', 'z', 'w' ];
        return dimensionStrings[index];
    }
    private mapArrayToThreeType(value: number[]) {
        const l = value.length;
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
