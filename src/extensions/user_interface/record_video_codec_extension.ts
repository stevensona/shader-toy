'use strict';

import { WebviewExtension } from '../webview_extension';

export class RecordVideoCodecExtension implements WebviewExtension {
    private recordVideoCodec: string;

    public constructor(recordVideoCodec: string) {
        this.recordVideoCodec = recordVideoCodec;
    }

    public generateContent(): string {
        return `"${this.recordVideoCodec}"`;
    }
}
