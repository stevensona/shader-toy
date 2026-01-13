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
.shader-toy-seq-plus:disabled {
    opacity: 0.35;
    cursor: default;
    background: rgba(0,0,0,0.12);
}
.shader-toy-seq-plus:disabled:hover { background: rgba(0,0,0,0.12); }

.shader-toy-seq-plus-empty {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 24px;
    padding: 0;
    margin: 0;
    border-left: 1px solid rgba(255,255,255,0.18);
    background: transparent;
    pointer-events: none;
}

/* Sequencer-managed iUniforms: dim and disable edits while playing. */
.shader-toy-seq-managed { }
.shader-toy-seq-managed-disabled {
    opacity: 0.55;
}
.shader-toy-seq-managed-disabled .slider {
    pointer-events: none !important;
    cursor: default !important;
}
.shader-toy-seq-managed-disabled input {
    pointer-events: none !important;
    cursor: default !important;
}
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
    // Ensure a reserved "+" column for scalar float/int uniforms.
    // If enabled is false, keep the space but do not show a button.
    window.ShaderToySequencerPlusState = window.ShaderToySequencerPlusState || {
        paused: (typeof paused !== 'undefined') ? !!paused : true,
        byUniformName: {},
        update: () => {
            try {
                const state = window.ShaderToySequencerPlusState;

                // Derive paused live so GUI-originated pause changes are reflected without
                // requiring a round-trip message from the extension.
                try {
                    if (typeof paused !== 'undefined') {
                        state.paused = !!paused;
                    }
                } catch {
                    // ignore
                }

                const buttons = document.querySelectorAll ? document.querySelectorAll('.shader-toy-seq-plus') : [];
                for (const btn of buttons) {
                    try {
                        const name = btn && btn.dataset ? btn.dataset.uniformName : undefined;
                        const locked = !!(name && state.byUniformName && state.byUniformName[name] && state.byUniformName[name].locked);
                        btn.disabled = !state.paused || locked;
                    } catch {
                        // ignore
                    }
                }

                // Disable sequencer-managed uniform edits while playing.
                const playing = !state.paused;
                const managed = document.querySelectorAll ? document.querySelectorAll('.shader-toy-seq-managed') : [];
                for (const li of managed) {
                    try {
                        if (!li || !li.classList) {
                            continue;
                        }
                        if (playing) {
                            li.classList.add('shader-toy-seq-managed-disabled');
                        } else {
                            li.classList.remove('shader-toy-seq-managed-disabled');
                        }

                        // Disable any text inputs so wheel/drag/focus can't change values.
                        const inputs = li.querySelectorAll ? li.querySelectorAll('input') : [];
                        for (const inp of inputs) {
                            try {
                                // Do not disable our '+' button (it's a <button>, not an input),
                                // but do disable controller value fields.
                                inp.disabled = playing;
                            } catch {
                                // ignore
                            }
                        }
                    } catch {
                        // ignore
                    }
                }
            } catch {
                // ignore
            }
        }
    };

    // Listen for pause + per-track UI updates coming from the extension.
    if (!window.ShaderToySequencerPlusMessageHookInstalled) {
        window.ShaderToySequencerPlusMessageHookInstalled = true;
        window.addEventListener('message', (event) => {
            const msg = event && event.data ? event.data : undefined;
            if (!msg || !msg.command) {
                return;
            }
            try {
                if (msg.command === 'setPauseState') {
                    window.ShaderToySequencerPlusState.paused = !!msg.paused;
                    window.ShaderToySequencerPlusState.update();
                }
                if (msg.command === 'sequencerTrackUiByUniform') {
                    window.ShaderToySequencerPlusState.byUniformName = msg.byUniformName || {};
                    window.ShaderToySequencerPlusState.update();
                }
            } catch {
                // ignore
            }
        });

        // Also refresh when the preview pause checkbox is toggled locally.
        try {
            const pauseBtn = document.getElementById ? document.getElementById('pause-button') : undefined;
            if (pauseBtn && !pauseBtn.__shaderToySeqPlusHooked) {
                pauseBtn.__shaderToySeqPlusHooked = true;
                pauseBtn.addEventListener('change', () => {
                    try { window.ShaderToySequencerPlusState.update(); } catch { /* ignore */ }
                });
                pauseBtn.addEventListener('click', () => {
                    try { window.ShaderToySequencerPlusState.update(); } catch { /* ignore */ }
                });
            }
        } catch {
            // ignore
        }
    }

    window.ShaderToyMarkSequencerManaged = window.ShaderToyMarkSequencerManaged || ((controller, uniformName) => {
        if (!controller) {
            return;
        }

        let li;
        try {
            li = controller.__li
                || (controller.domElement && controller.domElement.closest ? controller.domElement.closest('li') : undefined)
                || (controller.domElement ? controller.domElement.parentElement : undefined);
        } catch {
            li = undefined;
        }
        if (!li || !li.classList) {
            return;
        }
        try {
            li.classList.add('shader-toy-seq-managed');
            if (uniformName && li.dataset) {
                li.dataset.uniformName = uniformName;
            }
        } catch {
            // ignore
        }

        try {
            if (window.ShaderToySequencerPlusState && window.ShaderToySequencerPlusState.update) {
                window.ShaderToySequencerPlusState.update();
            }
        } catch {
            // ignore
        }
    });

    window.ShaderToyAddSequencerPlusButton = window.ShaderToyAddSequencerPlusButton || ((controller, getValue, uniformName, enabled = true) => {
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
            if (li.querySelector('.shader-toy-seq-plus, .shader-toy-seq-plus-empty')) {
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
            if (enabled) {
                // Mark as sequencer-managed so we can disable edits while playing.
                try {
                    if (window.ShaderToyMarkSequencerManaged) {
                        window.ShaderToyMarkSequencerManaged(controller, uniformName);
                    }
                } catch {
                    // ignore
                }

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'shader-toy-seq-plus';
                btn.textContent = '+';
                btn.title = 'Add/replace sequencer key at current time';
                try {
                    btn.dataset.uniformName = uniformName;
                } catch {
                    // ignore
                }
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

                // Apply current paused/locked state.
                try {
                    if (window.ShaderToySequencerPlusState && window.ShaderToySequencerPlusState.update) {
                        window.ShaderToySequencerPlusState.update();
                    }
                } catch {
                    // ignore
                }
            } else {
                const empty = document.createElement('div');
                empty.className = 'shader-toy-seq-plus-empty';
                li.appendChild(empty);
            }
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
        const isSequencerAllowed = ${!!value.Sequencer};
        if (isSequencerSupported && controller && window.ShaderToyAddSequencerPlusButton) {
            // Reserve the slot for all scalar float/int uniforms, but only show the button
            // when the uniform opted into sequencer support via 'sequncer {}' / 'sequencer {}'.
            window.ShaderToyAddSequencerPlusButton(controller, () => ${object}.${property}, '${value.Name}', isSequencerAllowed);
        }

        // When a uniform is sequencer-managed, block user edits while playing.
        if (isSequencerAllowed && controller && window.ShaderToyMarkSequencerManaged) {
            window.ShaderToyMarkSequencerManaged(controller, '${value.Name}');
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

    // When a uniform is sequencer-managed, block user edits while playing.
    try {
        const isSequencerAllowed = ${!!value.Sequencer};
        if (isSequencerAllowed && controller && window.ShaderToyMarkSequencerManaged) {
            window.ShaderToyMarkSequencerManaged(controller, '${value.Name}');
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

    // When a uniform is sequencer-managed, block user edits while playing.
    try {
        const isSequencerAllowed = ${!!value.Sequencer};
        if (isSequencerAllowed && controller_${i} && window.ShaderToyMarkSequencerManaged) {
            window.ShaderToyMarkSequencerManaged(controller_${i}, '${value.Name}');
        }
    } catch {
        // ignore
    }

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
