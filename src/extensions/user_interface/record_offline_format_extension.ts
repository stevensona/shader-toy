'use strict';

import { WebviewExtension } from '../webview_extension';

export class RecordOfflineFormatExtension implements WebviewExtension {
    private recordOfflineFormat: string;

    public constructor(recordOfflineFormat: string) {
        this.recordOfflineFormat = recordOfflineFormat;
    }

    public generateContent(): string {
        return `"${this.recordOfflineFormat}"`;
    }
}
