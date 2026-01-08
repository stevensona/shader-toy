'use strict';

import { WebviewExtension } from './webview_extension';

export class SelfSourceIdExtension implements WebviewExtension {
    private selfSourceId: number;

    constructor(selfSourceId: number) {
        this.selfSourceId = selfSourceId;
    }

    public generateContent(): string {
        return String(this.selfSourceId);
    }
}
