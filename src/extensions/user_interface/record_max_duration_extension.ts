'use strict';

import { WebviewExtension } from '../webview_extension';

export class RecordMaxDurationExtension implements WebviewExtension {
    private recordMaxDuration: number;

    public constructor(recordMaxDuration: number) {
        this.recordMaxDuration = recordMaxDuration;
    }

    public generateContent(): string {
        return `${this.recordMaxDuration}`;
    }
}
