'use strict';

import { WebviewContent } from './webviewcontent';
import { Context } from './context';
import { WebviewExtension } from './extensions/webview_extension';

enum ModuleType {
    Insert,
    Replace
}
type InsertModule = {
    Type: ModuleType.Insert,
    Extension: WebviewExtension,
    OriginalLine: string,
};
type ReplaceModule = {
    Type: ModuleType.Replace,
    SourceContent: string,
    Extension: WebviewExtension,
};

type WebviewModule = {
    Module: InsertModule | ReplaceModule,
    LineNumber: number,
};

export class WebviewContentAssembler {
    private webviewContent: WebviewContent;
    private webviewModules: WebviewModule[];
    
    constructor(context: Context) {
        this.webviewContent = new WebviewContent(context.getResourceUri('webview_base.html').fsPath);
        this.webviewModules = [];
    }

    public addWebviewModule(extension: WebviewExtension, lineNumber: number, originalLine: string) {
        let insertModule: InsertModule = {
            Type: ModuleType.Insert,
            Extension: extension,
            OriginalLine: originalLine.trim()
        };
        let webviewModule: WebviewModule = {
            Module: insertModule,
            LineNumber: lineNumber
        };

        this.insertModule(webviewModule);
    }

    public addReplaceModule(extension: WebviewExtension, lineNumber: number, sourceContent: string) {
        let replaceModule: ReplaceModule = {
            Type: ModuleType.Replace,
            SourceContent: sourceContent,
            Extension: extension
        };
        let webviewModule: WebviewModule = {
            Module: replaceModule,
            LineNumber: lineNumber
        };

        this.insertModule(webviewModule);
    }

    private insertModule(webviewModule: WebviewModule) {
        let sortedIndex = this.webviewModules.findIndex((module: WebviewModule) => module.LineNumber < webviewModule.LineNumber);
        if (sortedIndex < 0) {
            this.webviewModules.push(webviewModule);    
        }
        else {
            this.webviewModules.splice(sortedIndex, 0, webviewModule);
        }
    }

    public assembleWebviewConent() {
        for (let webviewModule of this.webviewModules) {
            if (webviewModule.Module.Type === ModuleType.Insert) {
                let originalLine = this.webviewContent.getLine(webviewModule.LineNumber).trim();
                if (originalLine !== webviewModule.Module.OriginalLine) {
                    throw new Error(`Original webview content does not look as expected, should be '${webviewModule.Module.OriginalLine}' but got '${originalLine}'`);
                }
                this.webviewContent.insertAfterLine(webviewModule.Module.Extension.generateContent(), webviewModule.LineNumber);
            }
            else {
                let originalLine = this.webviewContent.getLine(webviewModule.LineNumber);
                if (originalLine.search(webviewModule.Module.SourceContent) === -1) {
                    throw new Error(`Original webview content does not look as expected, should contain '${webviewModule.Module.SourceContent}' but got '${originalLine}'`);
                }
                this.webviewContent.replaceWithinLine(webviewModule.Module.SourceContent, webviewModule.Module.Extension.generateContent(), webviewModule.LineNumber);
            }
        }
        return this.webviewContent.getContent();
    }
}
