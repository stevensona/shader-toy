'use strict';

import { WebviewExtension } from './webview_extension';

export class ForcedScreenshotResolutionExtension implements WebviewExtension {
    private forcedScreenshotResolution: [ number, number ];

    constructor(forcedScreenshotResolution: [ number, number ]) {
        this.forcedScreenshotResolution = forcedScreenshotResolution;
    }

    public generateContent(): string {
        return `${this.forcedScreenshotResolution}`;
    }
}
