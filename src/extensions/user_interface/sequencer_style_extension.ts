'use strict';

import { WebviewExtension } from '../webview_extension';

export class SequencerStyleExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
#sequencer_container {
    display: none;
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 220px;
    z-index: 4;
}

#sequencer {
    width: 100%;
    height: 100%;
}`;
    }
}
