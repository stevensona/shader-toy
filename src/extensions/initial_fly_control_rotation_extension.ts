'use strict';

import * as Types from '../typenames';
import { WebviewExtension } from './webview_extension';

export class InitialFlyControlRotationExtension implements WebviewExtension {
    private initialRotation: Types.Quaternion;

    constructor(initialRotation: Types.Quaternion) {
        this.initialRotation = initialRotation;
    }

    public generateContent(): string {
        return `${this.initialRotation}`;
    }
}
