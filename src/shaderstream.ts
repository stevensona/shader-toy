'use strict';

export class ShaderStream {
    private content: string;
    private position: number;
    private currentLine: number;
    private currentColumn: number;

    constructor(content: string) {
        this.content = content;
        this.position = 0;
        this.currentLine = 1;
        this.currentColumn = 0;
    }

    public reset(content: string, position: number) {
        this.content = content;
        this.position = position;

        let preparsedContent = content.substring(0, position).split(/\r\n|\n/);
        this.currentLine = preparsedContent.length;
        this.currentColumn = 0;
        let currentLineBegin = preparsedContent.pop();
        if (currentLineBegin) {
            this.currentColumn = this.position - currentLineBegin.length;
        }
    }

    public peek(ahead: number = 0): string {
        return this.content[this.position + ahead];
    }
    public next(): string {
        let ret = this.content[this.position];
        this.position++;
        this.currentColumn++;
        if (ret === '\n' || ret === '\r\n') {
            this.currentColumn = 0;
            this.currentLine++;
        }
        return ret;
    }
    public code(): string {
        return this.content;
    }
    public pos(): number {
        return this.position;
    }
    public line(): number {
        return this.currentLine;
    }
    public column(): number {
        return this.currentColumn;
    }
    public eof(): boolean {
        return this.position >= this.content.length;
    }

    public getCurrentLine(): string {
        let lineFirstHalf = this.content.substring(0, this.position).split(/\r\n|\n/).pop() || '';
        let lineSecondHalf = this.content.substring(this.position).split(/\r\n|\n/)[0] || '';
        return lineFirstHalf + lineSecondHalf;
    }
}
