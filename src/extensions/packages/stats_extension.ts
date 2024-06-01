'use strict';

import { WebviewExtension } from '../webview_extension';

export class StatsExtension implements WebviewExtension {
    private getWebviewResourcePath: (relativePath: string) => string;
    private generateStandalone: boolean;

    constructor(getWebviewResourcePath: (relativePath: string) => string, generateStandalone: boolean) {
        this.getWebviewResourcePath = getWebviewResourcePath;
        this.generateStandalone = generateStandalone;
    }

    public generateContent(): string {
        let codeOrigin;
        if (this.generateStandalone) {
            codeOrigin = 'https://cdnjs.cloudflare.com/ajax/libs/stats.js/r16/Stats.min.js';
        }
        else {
            codeOrigin = this.getWebviewResourcePath('stats.min.js');
        }

        // Note: Workaround for a broken r17 on cdnjs and an incompatible r16 that we're forced to use
        let domElement;
        if (this.generateStandalone) {
            domElement = 'domElement';
        }
        else {
            domElement = 'dom';
        }

        return `\
<script src='${codeOrigin}' onload="
let stats = new Stats();
compileTimePanel = stats.addPanel(new Stats.Panel('CT MS', '#ff8', '#221'));
stats.showPanel(1);
stats.${domElement}.style.removeProperty('top');
stats.${domElement}.style.bottom = '0px';
document.body.appendChild(stats.${domElement});
requestAnimationFrame(function loop() {
    stats.update();
    requestAnimationFrame(loop);
});
"></script>`;
    }
}
