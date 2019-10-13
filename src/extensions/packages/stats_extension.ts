'use strict';

import { Context } from '../../context';
import { WebviewExtension } from '../webview_extension';

export class StatsExtension implements WebviewExtension {
    private context: Context;

    constructor(context: Context) {
        this.context = context;
    }

    public generateContent(): string {
        return `\
<script src="${this.context.getWebviewResourcePath('stats.min.js')}" onload="
let stats = new Stats();
compileTimePanel = stats.addPanel(new Stats.Panel('CT MS', '#ff8', '#221'));
stats.showPanel(1);
document.body.appendChild(stats.dom);
requestAnimationFrame(function loop() {
    stats.update();
    requestAnimationFrame(loop);
});
"></script>`;
    }
}
