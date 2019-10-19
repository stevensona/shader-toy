'use strict';

import * as fs from 'fs';

export class WebviewContent {
    private content: string[];
    
    constructor(originalFile: string) {
        let rawContent = fs.readFileSync(originalFile, "utf-8");
        this.content = rawContent.split(/\r?\n/);
    }

    public getLines() {
        return this.content;
    }
    public getLine(lineNumber: number) {
        return this.content[lineNumber - 1];
    }

    public insertAfterLine(content: string, lineNumber: number) {
        let indentationAmount = this.content[lineNumber - 1].split(/[^ ]/)[0].length;
        let indentation = ' '.repeat(indentationAmount);

        let splitContent = content.split('\n');
        splitContent = splitContent.map((line: string) => indentation + line);

        this.content.splice(lineNumber, 0, ...splitContent);
    }

    public replaceWithinLine(sourceContent: string, destinationContent: string, lineNumber: number) {
        let line = this.content[lineNumber - 1];
        line = line.replace(sourceContent, destinationContent);
        this.content[lineNumber - 1] = line;
    }

    public getContent() {
        return this.content.join('\n');
    }
}
