'use strict';

import * as Types from '../../typenames';
import { WebviewExtension } from '../webview_extension';

export class BuffersInitExtension implements WebviewExtension {
    private content: string;

    constructor(buffers: Types.BufferDefinition[]) {
        this.content = '';
        this.processBuffers(buffers);
    }

    private processBuffers(buffers: Types.BufferDefinition[]) {
        for (let buffer of buffers) {
            // Create a RenderTarget for all but the final buffer
            let target = "null";
            let pingPongTarget = "null";
            if (buffer !== buffers[buffers.length - 1]) {
                target = "new THREE.WebGLRenderTarget(resolution.x, resolution.y, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: framebufferType })";
            }
            if (buffer.UsesSelf) {
                pingPongTarget = "new THREE.WebGLRenderTarget(resolution.x, resolution.y, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: framebufferType })";
            }

            this.content += `\
buffers.push({
    Name: "${buffer.Name}",
    File: "${buffer.File}",
    LineOffset: ${buffer.LineOffset},
    Target: ${target},
    ChannelResolution: Array(10).fill(new THREE.Vector3(0,0,0)),
    PingPongTarget: ${pingPongTarget},
    PingPongChannel: ${buffer.SelfChannel},
    Dependents: ${JSON.stringify(buffer.Dependents)},
    Shader: new THREE.ShaderMaterial({
        fragmentShader: document.getElementById('${buffer.Name}').textContent,
        depthWrite: false,
        depthTest: false,
        uniforms: {
            iResolution: { type: "v3", value: resolution },
            iTime: { type: "f", value: 0.0 },
            iTimeDelta: { type: "f", value: 0.0 },
            iFrame: { type: "i", value: 0 },
            iMouse: { type: "v4", value: mouse },
            iMouseButton: { type: "v2", value: mouseButton },

            iChannelResolution: { type: "v3v", value: Array(10).fill(new THREE.Vector3(0,0,0)) },

            iDate: { type: "v4", value: date },
            iSampleRate: { type: "f", value: audioContext.sampleRate },

            iChannel0: { type: "t" },
            iChannel1: { type: "t" },
            iChannel2: { type: "t" },
            iChannel3: { type: "t" },
            iChannel4: { type: "t" },
            iChannel5: { type: "t" },
            iChannel6: { type: "t" },
            iChannel7: { type: "t" },
            iChannel8: { type: "t" },
            iChannel9: { type: "t" },

            resolution: { type: "v2", value: resolution },
            time: { type: "f", value: 0.0 },
            mouse: { type: "v2", value: normalizedMouse },
        }
    })
});`;
        }
    }

    public generateContent(): string {
        return this.content;
    }
}
