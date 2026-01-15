'use strict';

import { WebviewExtension } from '../webview_extension';

export class SequencerUpdateExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
if (window.ShaderToySequencer && window.ShaderToySequencer.enabled && window.ShaderToySequencer.timeline) {
    const seq = window.ShaderToySequencer;
    seq.syncing = true;
    try {
        seq.timeline.setTime((time || 0) * 1000);
    } catch {
        // ignore
    } finally {
        seq.syncing = false;
    }
}`;
    }
}
