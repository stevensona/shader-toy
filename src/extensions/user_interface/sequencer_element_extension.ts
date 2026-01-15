'use strict';

import { WebviewExtension } from '../webview_extension';

export class SequencerElementExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
<div id="sequencer_container">
    <div id="sequencer"></div>
</div>`;
    }
}
