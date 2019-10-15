'use strict';

import { WebviewExtension } from '../webview_extension';

export class KeyboardCallbacksExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
document.addEventListener('keydown', function(evt) {
    const i = evt.keyCode;
    if (i >= 0 && i <= 255) {
        // Key is being held, don't register input
        if (keyBoardData[i] == 0) {
            keyBoardData[i] = 255; // Held
            keyBoardData[i + 256] = 255; // Pressed
            keyBoardData[i + 512] = (keyBoardData[i + 512] == 255 ? 0 : 255); // Toggled

            if (keyBoardData[i + 512] > 0) {
                toggledKeys.push(i);
            }
            else {
                toggledKeys = toggledKeys.filter(function(value, index, arr){
                    return value != i;
                });
            }

            pressedKeys.push(i);
            keyBoardTexture.needsUpdate = true;
        }
    }
});
document.addEventListener('keyup', function(evt) {
    const i = evt.keyCode;
    if (i >= 0 && i <= 255) {
        keyBoardData[i] = 0; // Not held
        keyBoardData[i + 768] = 255; // Released
        releasedKeys.push(i);
        keyBoardTexture.needsUpdate = true;
    }
});`;
    }
}
