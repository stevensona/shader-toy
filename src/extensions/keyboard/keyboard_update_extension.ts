'use strict';

import { WebviewExtension } from '../webview_extension';

export class KeyboardUpdateExtension implements WebviewExtension {
    public generateContent(): string {
        return `\
if (pressedKeys.length > 0 || releasedKeys.length > 0) {
    for (let key of pressedKeys) {
        keyBoardData[key + 256] = 0;
    }
    for (let key of releasedKeys) {
        keyBoardData[key + 768] = 0;
    }

    if (pressedKeys.length > 0) {
        if (vscode !== undefined) {
            vscode.postMessage({
                command: 'updateKeyboard',
                keys: toggledKeys
            });
        }
    }
    
    keyBoardTexture.needsUpdate = true;
    pressedKeys = [];
    releasedKeys = [];
}`;
    }
}
