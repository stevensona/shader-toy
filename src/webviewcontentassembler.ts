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
    Extension: WebviewExtension
};
type ReplaceModule = {
    Type: ModuleType.Replace,
    ReplaceContent: string,
    Extension: WebviewExtension,
};

type WebviewModule = {
    Module: InsertModule | ReplaceModule,
    LineNumber: number,
};

export class WebviewContentAssembler {
    private webviewContent: WebviewContent;
    private webviewModules: WebviewModule[];
    private webviewContentLineMappings: Map<string, number[]>;
    
    constructor(context: Context) {
        this.webviewContent = new WebviewContent(context.getResourceUri('webview_base.html').fsPath);
        this.webviewModules = [];

        this.webviewContentLineMappings = new Map<string, number[]>();
        let lineNumber = 1;
        for (let line of this.webviewContent.getLines()) {
            line = line.trim();
            let lines = this.webviewContentLineMappings.get(line);
            if (lines !== undefined) {
                lines.push(lineNumber);
            }
            else {
                this.webviewContentLineMappings.set(line, [ lineNumber ]);
            }
            lineNumber++;
        }
    }

    public addWebviewModule(extension: WebviewExtension, originalLine: string) {
        let insertModule: InsertModule = {
            Type: ModuleType.Insert,
            Extension: extension
        };

        originalLine = originalLine.trim();
        let lines = this.webviewContentLineMappings.get(originalLine);
        if (lines !== undefined) {
            for (let lineNumber of lines) {
                let webviewModule: WebviewModule = {
                    Module: insertModule,
                    LineNumber: lineNumber
                };
                this.insertModule(webviewModule);
            }
        }
    }

    public addReplaceModule(extension: WebviewExtension, originalLine: string, replaceContent: string) {
        let replaceModule: ReplaceModule = {
            Type: ModuleType.Replace,
            ReplaceContent: replaceContent,
            Extension: extension
        };

        originalLine = originalLine.trim();
        let lines = this.webviewContentLineMappings.get(originalLine);
        if (lines !== undefined) {
            for (let lineNumber of lines) {
                let webviewModule: WebviewModule = {
                    Module: replaceModule,
                    LineNumber: lineNumber
                };
                this.insertModule(webviewModule);
            }
        }
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

    public assembleWebviewContent() {
        for (let webviewModule of this.webviewModules) {
            if (webviewModule.Module.Type === ModuleType.Insert) {
                this.webviewContent.insertAfterLine(webviewModule.Module.Extension.generateContent(), webviewModule.LineNumber);
            }
            else {
                this.webviewContent.replaceWithinLine(webviewModule.Module.ReplaceContent, webviewModule.Module.Extension.generateContent(), webviewModule.LineNumber);
            }
        }
        return this.webviewContent.getContent();
    }
}
