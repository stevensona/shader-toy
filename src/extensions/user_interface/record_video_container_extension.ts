'use strict';

import { WebviewExtension } from '../webview_extension';

export class RecordVideoContainerExtension implements WebviewExtension {
    private recordVideoContainer: string;

    public constructor(recordVideoContainer: string) {
        this.recordVideoContainer = recordVideoContainer;
    }

    public generateContent(): string {
        return `"${this.recordVideoContainer}"`;
    }
}
