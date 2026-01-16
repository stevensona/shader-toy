'use strict';

import { WebviewExtension } from '../../webview_extension';
import { buildErrorDisplayWrapper } from './error_display_wrapper';

export class DefaultErrorsExtension implements WebviewExtension {
    public generateContent(): string {
        return buildErrorDisplayWrapper({ emitDiagnostics: false });
    }
}
