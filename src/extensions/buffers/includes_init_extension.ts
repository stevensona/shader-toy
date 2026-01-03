'use strict';

import * as Types from '../../typenames';
import { WebviewExtension } from '../webview_extension';

export class IncludesInitExtension implements WebviewExtension {
    private content: string;

    constructor(includes: Types.IncludeDefinition[]) {
        this.content = '';
        this.processBuffers(includes);
    }

    private processBuffers(includes: Types.IncludeDefinition[]) {
        for (const include of includes) {
            this.content += `\
commonIncludes.push({
    Name: ${JSON.stringify(include.Name)},
    File: ${JSON.stringify(include.File)}
});`;
        }
    }

    public generateContent(): string {
        return this.content;
    }
}
