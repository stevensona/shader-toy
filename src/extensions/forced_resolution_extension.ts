'use strict';

import { WebviewExtension } from './webview_extension';

export class ForcedResolutionExtension implements WebviewExtension {
    private forcedResolution: [ number, number ];

    constructor(forcedResolution: [ number, number ]) {
        this.forcedResolution = forcedResolution;
    }

    public generateContent(): string {
        return `${this.forcedResolution}`;
    }
}
