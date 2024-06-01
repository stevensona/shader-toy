'use strict';

import { WebviewExtension } from '../webview_extension';

export class RecordOfflineQualityExtension implements WebviewExtension {
    private recordOfflineQuality: number;

    public constructor(recordOfflineQuality: number) {
        this.recordOfflineQuality = recordOfflineQuality;
    }

    public generateContent(): string {
        return `${this.recordOfflineQuality}`;
    }
}
