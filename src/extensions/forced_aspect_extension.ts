'use strict';

import { WebviewExtension } from './webview_extension';

export class ForcedAspectExtension implements WebviewExtension {
    private forcedAspect: [ number, number ];

    constructor(forcedAspect: [ number, number ]) {
        this.forcedAspect = forcedAspect;
    }

    public generateContent(): string {
        return `${this.forcedAspect}`;
    }
}
