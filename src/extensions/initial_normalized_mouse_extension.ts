'use strict';

import * as Types from '../typenames';
import { WebviewExtension } from './webview_extension';

export class InitialNormalizedMouseExtension implements WebviewExtension {
    private initialMouse: Types.NormalizedMouse;

    constructor(initialMouse: Types.NormalizedMouse) {
        this.initialMouse = initialMouse;
    }

    public generateContent(): string {
        return `${this.initialMouse.x}, ${this.initialMouse.y}`;
    }
}
