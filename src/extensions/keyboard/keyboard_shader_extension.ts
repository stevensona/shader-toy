'use strict';

import { WebviewExtension } from '../webview_extension';

export class KeyboardShaderExtension implements WebviewExtension {
    private shaderPreamble: string;
    private shaderPreambleLineNumbers: number;

    constructor() {
        this.shaderPreamble =  `\
const int Key_Backspace = 8, Key_Tab = 9, Key_Enter = 13, Key_Shift = 16, Key_Ctrl = 17, Key_Alt = 18, Key_Pause = 19, Key_Caps = 20, Key_Escape = 27, Key_PageUp = 33, Key_PageDown = 34, Key_End = 35,
    Key_Home = 36, Key_LeftArrow = 37, Key_UpArrow = 38, Key_RightArrow = 39, Key_DownArrow = 40, Key_Insert = 45, Key_Delete = 46, Key_0 = 48, Key_1 = 49, Key_2 = 50, Key_3 = 51, Key_4 = 52,
    Key_5 = 53, Key_6 = 54, Key_7 = 55, Key_8 = 56, Key_9 = 57, Key_A = 65, Key_B = 66, Key_C = 67, Key_D = 68, Key_E = 69, Key_F = 70, Key_G = 71, Key_H = 72,
    Key_I = 73, Key_J = 74, Key_K = 75, Key_L = 76, Key_M = 77, Key_N = 78, Key_O = 79, Key_P = 80, Key_Q = 81, Key_R = 82, Key_S = 83, Key_T = 84, Key_U = 85,
    Key_V = 86, Key_W = 87, Key_X = 88, Key_Y = 89, Key_Z = 90, Key_LeftWindow = 91, Key_RightWindows = 92, Key_Select = 93, Key_Numpad0 = 96, Key_Numpad1 = 97, Key_Numpad2 = 98, Key_Numpad3 = 99,
    Key_Numpad4 = 100, Key_Numpad5 = 101, Key_Numpad6 = 102, Key_Numpad7 = 103, Key_Numpad8 = 104, Key_Numpad9 = 105, Key_NumpadMultiply = 106, Key_NumpadAdd = 107, Key_NumpadSubtract = 109, Key_NumpadPeriod = 110, Key_NumpadDivide = 111, Key_F1 = 112, Key_F2 = 113, Key_F3 = 114, Key_F4 = 115, Key_F5 = 116, Key_F6 = 117, Key_F7 = 118, Key_F8 = 119, Key_F9 = 120, Key_F10 = 121, Key_F11 = 122, Key_F12 = 123, Key_NumLock = 144, Key_ScrollLock = 145,
    Key_SemiColon = 186, Key_Equal = 187, Key_Comma = 188, Key_Dash = 189, Key_Period = 190, Key_ForwardSlash = 191, Key_GraveAccent = 192, Key_OpenBracket = 219, Key_BackSlash = 220, Key_CloseBraket = 221, Key_SingleQuote = 222;

bool isKeyDown(int key) {
    vec2 uv = vec2(float(key) / 255.0, 0.125);
    return texture2D(iKeyboard, uv).r > 0.0;
}
bool isKeyPressed(int key) {
    vec2 uv = vec2(float(key) / 255.0, 0.375);
    return texture2D(iKeyboard, uv).r > 0.0;
}
bool isKeyToggled(int key) {
    vec2 uv = vec2(float(key) / 255.0, 0.625);
    return texture2D(iKeyboard, uv).r > 0.0;
}
bool isKeyReleased(int key) {
    vec2 uv = vec2(float(key) / 255.0, 0.875);
    return texture2D(iKeyboard, uv).r > 0.0;
}`;
        this.shaderPreambleLineNumbers = this.shaderPreamble.split(/\r\n|\n/).length;
    }

    public getShaderPreamble() {
        return this.shaderPreamble;
    }
    public getShaderPreambleLineNumbers() {
        return this.shaderPreambleLineNumbers;
    }

    public generateContent(): string {
        return this.getShaderPreamble();
    }
}
