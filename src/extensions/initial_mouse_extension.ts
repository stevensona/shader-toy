'use strict';

import * as Types from '../typenames';
import { WebviewExtension } from './webview_extension';

export class InitialMouseExtension implements WebviewExtension {
    private initialMouse: Types.Mouse;

    constructor(initialMouse: Types.Mouse) {
        this.initialMouse = initialMouse;
    }

    public generateContent(): string {
        return `${this.initialMouse.x}, ${this.initialMouse.y}, ${this.initialMouse.z}, ${this.initialMouse.w}`;
    }
}
