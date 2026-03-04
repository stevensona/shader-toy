'use strict';

/**
 * Static shader analysis engine — detects potentially dangerous GLSL operations.
 * Port of FragCoord v0.7.1's Mj() analyzer.
 *
 * 9 warning categories: division, sqrt, inversesqrt, log, pow, asin, acos, atan, mod.
 * Runs in the extension host on raw user source (before preamble injection).
 *
 * Ref: inspector(0.7.1)/071_shader_warnings_full.txt
 */

export type WarningKind = 'division' | 'sqrt' | 'inversesqrt' | 'log' | 'pow' | 'asin' | 'acos' | 'atan' | 'mod';

export interface ShaderWarning {
    kind: WarningKind;
    line: number;
    column: number;
    endColumn: number;
    label: string;
    rawExpr: string;
    reason: string;
}

export const WARNING_CATEGORIES: Record<WarningKind, { color: string; description: string }> = {
    division:     { color: '#ff6666', description: 'Division — 0/0 produces NaN' },
    sqrt:         { color: '#66ccff', description: 'sqrt of negative → NaN' },
    inversesqrt:  { color: '#66ccff', description: 'inversesqrt of ≤0 → NaN' },
    log:          { color: '#88ddaa', description: 'log/log2 of ≤0 → undefined' },
    pow:          { color: '#ffaa44', description: 'pow with negative base → NaN' },
    asin:         { color: '#cc88ff', description: 'asin of |x|>1 → NaN' },
    acos:         { color: '#cc88ff', description: 'acos of |x|>1 → NaN' },
    atan:         { color: '#cc88ff', description: 'atan(0,0) → undefined' },
    mod:          { color: '#ffcc44', description: 'mod(x,0) → NaN' }
};

/**
 * Strip comments while preserving character positions.
 * Port of kj(source).
 */
function stripComments(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length))
        .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
}

/**
 * Convert character offset to line/column (1-based).
 * Port of i2(source, offset).
 */
function offsetToPosition(source: string, offset: number): { line: number; column: number } {
    const prefix = source.slice(0, offset);
    const lastNL = prefix.lastIndexOf('\n');
    const line = (prefix.match(/\n/g)?.length ?? 0) + 1;
    const column = lastNL >= 0 ? offset - lastNL : offset + 1;
    return { line, column };
}

/**
 * Check if a string is a non-zero numeric constant.
 * Port of inner Mj() constant checker.
 * Suppresses false positives like `1.0 / 2.0`.
 */
function isNonZeroConstant(str: string): boolean {
    const trimmed = str.trim();
    if (/^[+-]?(\d+\.?\d*|\d*\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
        const val = parseFloat(trimmed);
        return !isNaN(val) && val !== 0;
    }
    return false;
}

/**
 * Find the matching closing parenthesis.
 * Port of Rj(source, openIndex).
 */
function findMatchingParen(source: string, openIndex: number): number {
    let depth = 1;
    for (let i = openIndex + 1; i < source.length; i++) {
        if (source[i] === '(') depth++;
        else if (source[i] === ')') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/** Truncate expression labels to 30 chars. Port of o2(). */
function truncateLabel(expr: string): string {
    const trimmed = expr.trim();
    return trimmed.length <= 30 ? trimmed : trimmed.slice(0, 27) + '…';
}

/**
 * Analyze shader source for potentially dangerous operations.
 * Port of the outer Mj(source) analyzer.
 *
 * @param source Raw shader source (before preamble injection)
 * @returns Warnings sorted by line, then column
 */
export function analyzeShader(source: string): ShaderWarning[] {
    const cleaned = stripComments(source);
    const warnings: ShaderWarning[] = [];

    // --- Division detection ---
    const divRegex = /(?<!\/)\/(?![\/\*=])/g;
    let match: RegExpExecArray | null;
    while ((match = divRegex.exec(cleaned)) !== null) {
        const pos = match.index;
        const leftCtx = cleaned.slice(Math.max(0, pos - 60), pos);
        const rightCtx = cleaned.slice(pos + 1, Math.min(cleaned.length, pos + 61));
        const leftMatch = leftCtx.match(/(\b[\w.]+(?:\([^)]*\))?)\s*$/);
        const rightMatch = rightCtx.match(/^\s*([\w.]+(?:\([^)]*\))?)/);
        const left = leftMatch?.[1] ?? '…';
        const right = rightMatch?.[1] ?? '…';

        if (isNonZeroConstant(right)) continue;

        const { line, column } = offsetToPosition(source, pos);
        warnings.push({
            kind: 'division',
            line,
            column,
            endColumn: column + 1,
            label: `${truncateLabel(left)} / ${truncateLabel(right)}`,
            rawExpr: `(${left}) / (${right})`,
            reason: 'Division by zero: 0/0 produces NaN, x/0 produces ±Inf'
        });
    }

    // --- Function call detection ---
    const functionPatterns: Array<{ re: RegExp; kind: WarningKind; reason: string }> = [
        { re: /\bsqrt\s*\(/g,         kind: 'sqrt',         reason: 'sqrt(x) is NaN when x < 0' },
        { re: /\binversesqrt\s*\(/g,   kind: 'inversesqrt',  reason: 'inversesqrt(x) is undefined when x ≤ 0' },
        { re: /\blog2?\s*\(/g,         kind: 'log',          reason: 'log/log2(x) is undefined when x ≤ 0' },
        { re: /\bpow\s*\(/g,           kind: 'pow',          reason: 'pow(x,y) is undefined when x < 0 or x = 0 with y ≤ 0' },
        { re: /\basin\s*\(/g,          kind: 'asin',         reason: 'asin(x) is undefined when |x| > 1' },
        { re: /\bacos\s*\(/g,          kind: 'acos',         reason: 'acos(x) is undefined when |x| > 1' },
        { re: /\batan\s*\(/g,          kind: 'atan',         reason: 'atan(y, x) is undefined when x = 0 and y = 0' },
        { re: /\bmod\s*\(/g,           kind: 'mod',          reason: 'mod(x, y) is undefined when y = 0' }
    ];

    for (const { re, kind, reason } of functionPatterns) {
        while ((match = re.exec(cleaned)) !== null) {
            const funcStart = match.index;
            const parenOpen = cleaned.indexOf('(', funcStart);
            if (parenOpen < 0) continue;
            const parenClose = findMatchingParen(cleaned, parenOpen);
            if (parenClose < 0) continue;

            const args = cleaned.slice(parenOpen + 1, parenClose).trim();
            const funcName = match[0].replace(/\s*\($/, '');
            const { line, column } = offsetToPosition(source, funcStart);
            const endCol = offsetToPosition(source, parenClose).column + 1;

            warnings.push({
                kind,
                line,
                column,
                endColumn: endCol,
                label: `${funcName}(${truncateLabel(args)})`,
                rawExpr: cleaned.slice(funcStart, parenClose + 1).trim(),
                reason
            });
        }
    }

    return warnings.sort((a, b) => a.line - b.line || a.column - b.column);
}
