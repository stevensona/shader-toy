'use strict';

import { WebviewExtension } from './webview_extension';

export class ShaderPreambleExtension implements WebviewExtension {
    private shaderPreamble: string;
    private shaderPreambleLineNumbers: number;

    constructor() {
        this.shaderPreamble = 
`\
uniform vec3        iResolution;
uniform float       iTime;
uniform float       iTimeDelta;
uniform int         iFrame;
uniform vec4        iDate;
uniform vec3        iChannelResolution[10];
uniform vec4        iMouse;
uniform vec4        iMouseButton;
uniform sampler2D   iChannel0;
uniform sampler2D   iChannel1;
uniform sampler2D   iChannel2;
uniform sampler2D   iChannel3;
uniform sampler2D   iChannel4;
uniform sampler2D   iChannel5;
uniform sampler2D   iChannel6;
uniform sampler2D   iChannel7;
uniform sampler2D   iChannel8;
uniform sampler2D   iChannel9;
uniform sampler2D   iKeyboard;
uniform float       iSampleRate;

#define iGlobalTime iTime
#define iGlobalFrame iFrame

#define SHADER_TOY`;
        this.shaderPreambleLineNumbers = this.shaderPreamble.split(/\r\n|\n/).length;
    }

    public getShaderPreamble() {
        return this.shaderPreamble;
    }
    public getShaderPreambleLineNumbers() {
        return this.shaderPreambleLineNumbers;
    }

    public generateContent(): string {
        return `${this.shaderPreambleLineNumbers}`;
    }
}
