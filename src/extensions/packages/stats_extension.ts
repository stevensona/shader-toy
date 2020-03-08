'use strict';

import { Context } from '../../context';
import { WebviewExtension } from '../webview_extension';

export class StatsExtension implements WebviewExtension {
    private context: Context;
    private generateStandalone: boolean;

    constructor(context: Context, generateStandalone: boolean) {
        this.context = context;
        this.generateStandalone = generateStandalone;
    }

    public generateContent(): string {
        let codeOrigin;
        if (this.generateStandalone) {
            codeOrigin = 'https://cdnjs.cloudflare.com/ajax/libs/stats.js/r16/Stats.min.js';
        }
        else {
            codeOrigin = this.context.getWebviewResourcePath('stats.min.js');
        }
        return `\
<script src='${codeOrigin}' onload='
let stats = new Stats();
compileTimePanel = stats.addPanel(new Stats.Panel('CT MS', '#ff8', '#221'));
stats.showPanel(1);
document.body.appendChild(stats.dom);
requestAnimationFrame(function loop() {
    stats.update();
    requestAnimationFrame(loop);
});
'></script>`;
    }
}
