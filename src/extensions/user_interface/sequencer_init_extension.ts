'use strict';

import { WebviewExtension } from '../webview_extension';

export class SequencerInitExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
(function () {
    const button = document.getElementById('sequencer_button');

    if (!button) {
        return;
    }

    // Request extension to open/close the sequencer panel.
    button.addEventListener('click', () => {
        if (vscode === undefined) {
            return;
        }
        vscode.postMessage({
            command: 'toggleSequencerPanel'
        });
    });

    // Receive state updates and time scrubs from the sequencer panel.
    window.addEventListener('message', (event) => {
        const message = event && event.data ? event.data : undefined;
        if (!message || !message.command) {
            return;
        }

        switch (message.command) {
            case 'sequencerState':
                if (message.active) {
                    button.classList.add('active');
                } else {
                    button.classList.remove('active');
                }
                return;
            case 'setTime':
            {
                const newTime = message.time || 0;

                startingTime = newTime;
                pausedTime = 0.0;
                if (clock && typeof clock.start === 'function') {
                    clock.start();
                }

                time = newTime;
                deltaTime = 0.0;
                forceRenderOneFrame = true;
                return;
            }
        }
    });
})();`;
    }
}
