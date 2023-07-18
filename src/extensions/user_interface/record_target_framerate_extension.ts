'use strict';

import { WebviewExtension } from '../webview_extension';

export class RecordTargetFramerateExtension implements WebviewExtension {
    private targetFramerate: number;

    public constructor(targetFramerate: number) {
        this.targetFramerate = targetFramerate;
    }

    public generateContent(): string {
        return `${this.targetFramerate}`;
    }
}
