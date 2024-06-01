'use strict';

import { WebviewExtension } from '../webview_extension';

export class RecordVideoBitRateExtension implements WebviewExtension {
    private recordVideoBitRate: number;

    public constructor(recordVideoBitRate: number) {
        this.recordVideoBitRate = recordVideoBitRate;
    }

    public generateContent(): string {
        return `${this.recordVideoBitRate}`;
    }
}
