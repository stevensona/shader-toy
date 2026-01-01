'use strict';

import { WebviewExtension } from './webview_extension';

export class WebviewModuleScriptExtension implements WebviewExtension {
    private getWebviewResourcePath: (relativePath: string) => string;
    private getResourceText?: (relativePath: string) => string;
    private generateStandalone: boolean;
    private relativePath: string;

    constructor(
        getWebviewResourcePath: (relativePath: string) => string,
        generateStandalone: boolean,
        relativePath: string,
        getResourceText?: (relativePath: string) => string,
    ) {
        this.getWebviewResourcePath = getWebviewResourcePath;
        this.generateStandalone = generateStandalone;
        this.relativePath = relativePath;
        this.getResourceText = getResourceText;
    }

    public generateContent(): string {
        if (this.generateStandalone) {
            const text = this.getResourceText?.(this.relativePath);
            if (!text) {
                return '';
            }

            // Inline JS for portable previews so the generated HTML is self-contained.
            return `<script type="text/javascript">\n${text}\n</script>`;
        }

        const src = this.getWebviewResourcePath(this.relativePath);
        return `<script src="${src}"></script>`;
    }
}
