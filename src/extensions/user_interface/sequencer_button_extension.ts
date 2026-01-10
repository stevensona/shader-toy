'use strict';

import { WebviewExtension } from '../webview_extension';

export class SequencerButtonExtension implements WebviewExtension {
    public generateContent(): string {
        return '<span id=\'sequencer_button\' class=\'rec_base\'></span>';
    }
}
