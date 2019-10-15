'use strict';

import { WebviewExtension } from '../webview_extension';

export class KeyboardInitExtension implements WebviewExtension {
    private startingKeys: number[];

    public constructor(startingKeys: number[]) {
        this.startingKeys = startingKeys;
    }

    public generateContent(): string {
        return `\
const numKeys = 256;
const numStates = 4;
let keyBoardData = new Uint8Array(numKeys * numStates);
let keyBoardTexture = new THREE.DataTexture(keyBoardData, numKeys, numStates, THREE.LuminanceFormat, THREE.UnsignedByteType);
keyBoardTexture.magFilter = THREE.NearestFilter;
keyBoardTexture.needsUpdate = true;
let pressedKeys = [];
let releasedKeys = [];
let toggledKeys = [${this.startingKeys}];
for (let key of toggledKeys) {
    keyBoardData[key + 512] = 255; // Toggled
}`;
    }
}
