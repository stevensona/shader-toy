'use strict';

import { WebviewExtension } from '../../webview_extension';
import { buildErrorDisplayWrapper } from './error_display_wrapper';

export class DiagnosticsErrorsExtension implements WebviewExtension {
    public generateContent(): string {
        return buildErrorDisplayWrapper({ emitDiagnostics: true });
    }
}
