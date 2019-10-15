'use strict';

import { WebviewExtension } from '../webview_extension';

export class AudioUpdateExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
for (let audio of audios) {
    // Get audio data
    audio.Analyser.getByteFrequencyData(audio.Data.subarray(0, audio.Data.length / 2));
    audio.Analyser.getByteTimeDomainData(audio.Data.subarray(audio.Data.length / 2, -1));

    // Scale buffer to fill the whole range because
    // frequency data and amplitude data are not necessarily the same length
    audio.Data.subarray(0, audio.Data.length / 2).set(
        audio.Data.slice(0, audio.Data.length / 2)
            .map(function(value, index, array) {
                index = index / (audio.Data.length / 2);
                index = Math.floor(index * audio.FrequencySamples);
                return array[index];
            })
        );
    audio.Data.subarray(audio.Data.length / 2, -1).set(
        audio.Data.slice(audio.Data.length / 2, -1)
            .map(function(value, index, array) {
                index = index / (audio.Data.length / 2);
                index = index * audio.AmplitudeSamples;
                return array[index];
            })
        );
    
    audio.Texture.needsUpdate = true;
}`;
    }
}
