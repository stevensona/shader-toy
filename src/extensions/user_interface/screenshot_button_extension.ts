'use strict';

import { WebviewExtension } from '../webview_extension';

export class ScreenshotButtonExtension implements WebviewExtension {
    public generateContent(): string {
        return '<span id=\'screenshot\' class=\'rec_base\'></span>';
    }
}
