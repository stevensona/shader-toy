'use strict';

import { WebviewExtension } from './webview_extension';

export type WebglVersionSetting = 'Default' | 'WebGL2';

export class WebglVersionExtension implements WebviewExtension {
    private webglVersion: WebglVersionSetting;

    constructor(webglVersion: WebglVersionSetting) {
        this.webglVersion = webglVersion;
    }

    public generateContent(): string {
        return `${this.webglVersion}`;
    }
}
