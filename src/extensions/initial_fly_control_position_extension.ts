'use strict';

import * as Types from '../typenames';
import { WebviewExtension } from './webview_extension';

export class InitialFlyControlPositionExtension implements WebviewExtension {
    private initialPosition: Types.Position;

    constructor(initialPosition: Types.Position) {
        this.initialPosition = initialPosition;
    }

    public generateContent(): string {
        return `${this.initialPosition}`;
    }
}
