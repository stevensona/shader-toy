'use strict';

type MutatedRange = {
    Begin: number;
    Length: number;
    LinesInOriginal: number;
};

export class ShaderStream {
    private content: string;
    private position: number;
    private currentLine: number;
    private currentColumn: number;
    private mutations: MutatedRange[];

    constructor(content: string) {
        this.content = content;
        this.position = 0;
        this.currentLine = 1;
        this.currentColumn = 0;
        this.mutations = [];
    }

    public mutate(destRangeBegin: number, destRangeEnd: number, source: string) {
        const preDestContent = this.content.substring(0, destRangeBegin);
        const destContent = this.content.substring(destRangeBegin, destRangeEnd);
        const postDestContent = this.content.substring(destRangeEnd);

        const destLineNumber = preDestContent.split(/\r\n|\n/).length;
        const sourceLineCount = source.split(/\r\n|\n/).length;
        const destLineCount = destContent.split(/\r\n|\n/).length;

        if (sourceLineCount !== destLineCount) {
            let preceedingRange: number | undefined = undefined;
            let isInsideExistingRange = false;
            for (const mutatedRangeIndex in this.mutations) {
                const mutatedRange = this.mutations[mutatedRangeIndex];
                if (mutatedRange.Begin < destLineNumber) {
                    if (mutatedRange.Length > destLineCount) {
                        isInsideExistingRange = true;
                        break;
                    }
                }
                preceedingRange = parseInt(mutatedRangeIndex);
            }

            if (!isInsideExistingRange) {
                const mutatedRange = {
                    Begin: destLineNumber,
                    Length: sourceLineCount,
                    LinesInOriginal: destLineCount
                };
                preceedingRange = preceedingRange || 0;
                this.mutations.splice(preceedingRange, 0, mutatedRange);
            }
        }

        this.content = preDestContent + source + postDestContent;
        
        return this.content; 
    }

    public reset(position: number) {
        this.position = position;

        const preparsedContent = this.content.substring(0, position).split(/\r\n|\n/);
        this.currentLine = preparsedContent.length;
        this.currentColumn = 0;
        const currentLineBegin = preparsedContent.pop();
        if (currentLineBegin) {
            this.currentColumn = this.position - currentLineBegin.length;
        }
    }

    public peek(ahead: number = 0): string {
        return this.content[this.position + ahead];
    }
    public next(): string {
        const ret = this.content[this.position];
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
    public originalLine(): number {
        let originalLine = this.currentLine;
        for (const mutatedRange of this.mutations) {
            if (mutatedRange.Begin < originalLine) {
                originalLine -= mutatedRange.Length - mutatedRange.LinesInOriginal;
            }
            else {
                break;
            }
        }
        return originalLine;
    }
    public column(): number {
        return this.currentColumn;
    }
    public eof(): boolean {
        return this.position >= this.content.length;
    }

    public getCurrentLine(): string {
        const lineFirstHalf = this.content.substring(0, this.position).split(/\r\n|\n/).pop() || '';
        const lineSecondHalf = this.content.substring(this.position).split(/\r\n|\n/)[0] || '';
        return lineFirstHalf + lineSecondHalf;
    }
}
