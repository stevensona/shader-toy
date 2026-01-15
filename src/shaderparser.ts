'use strict';

import * as Types from'./typenames';
import { ShaderStream } from './shaderstream';
import { ShaderLexer, Token, TokenType, LineRange } from './shaderlexer';

export enum ObjectType {
    Include,
    Texture,
    TextureMagFilter,
    TextureMinFilter,
    TextureWrapMode,
    TextureType,
    Number,
    Value,
    Uniform,
    Keyboard,
    FirstPersonControls,
    StrictCompatibility,
    Error
}
type Include = {
    Type: ObjectType.Include,
    Path: string
};
type Texture = {
    Type: ObjectType.Texture,
    Index: number,
    Path: string
};
type TextureMagFilter = {
    Type: ObjectType.TextureMagFilter,
    Index: number,
    Value: Types.TextureMagFilter
};
type TextureMinFilter = {
    Type: ObjectType.TextureMinFilter,
    Index: number,
    Value: Types.TextureMinFilter
};
type TextureWrapMode = {
    Type: ObjectType.TextureWrapMode,
    Index: number,
    Value: Types.TextureWrapMode
};
type TextureType = {
    Type: ObjectType.TextureType,
    Index: number,
    Value: Types.TextureType
};
type LiteralNumber = {
    Type: ObjectType.Number,
    ValueType: string,
    LiteralString: string,
    Value: number
};
type LiteralValue = {
    Type: ObjectType.Value,
    ValueType: string,
    LiteralString: string,
    Value: LiteralNumber[] | LiteralValue[]
};
type Uniform = {
    Type: ObjectType.Uniform,
    Name: string,
    Typename: string,
    Default?: number[],
    Min?: number[],
    Max?: number[],
    Step?: number[],

    // Optional tag used by the sequencer integration.
    // Example: `#iUniform float foo = 0 in { -1, 1 } step 0.1 sequncer {}`
    Sequencer?: {
        // Future: options inside `{ ... }`.
    }
};
type Keyboard = {
    Type: ObjectType.Keyboard
};
type FirstPersonControls = {
    Type: ObjectType.FirstPersonControls
};
type StrictCompatibility = {
    Type: ObjectType.StrictCompatibility
};
type ErrorObject = {
    Type: ObjectType.Error,
    Message: string
};
type TextureObject = Texture | TextureMagFilter | TextureMinFilter | TextureWrapMode | TextureType;
type ParseObject = Include | TextureObject | Uniform | Keyboard | FirstPersonControls | StrictCompatibility;

export class ShaderParser {
    private stream: ShaderStream;
    private lexer: ShaderLexer;
    private lastObjectRange: LineRange | undefined;

    constructor(content: string) {
        this.stream = new ShaderStream(content);
        this.lexer = new ShaderLexer(this.stream);
        this.lastObjectRange = undefined;
    }
    
    public mutate(destRange: LineRange, source: string) {
        return this.lexer.mutate(destRange, source);
    }

    public reset(position: number) {
        this.lexer.reset(position);
    }

    public eof(): boolean {
        return this.stream.eof();
    }

    public line(): number {
        return this.stream.originalLine();
    }

    public getLastObjectRange(): LineRange | undefined {
        return this.lastObjectRange;
    }

    public next(): ParseObject | ErrorObject | undefined {
        let nextToken = this.lexer.next();
        while (!this.lexer.eof() && (nextToken === undefined || nextToken.type !== TokenType.PreprocessorKeyword)) {
            nextToken = this.lexer.next();
        }
        if (this.lexer.eof() || nextToken === undefined) {
            return undefined;
        }

        const rangeBegin = this.lexer.getLastRange().Begin;

        const tokenValue = nextToken.value as string;
        let returnObject: ParseObject | ErrorObject;
        switch (tokenValue) {
        case 'include':
            returnObject = this.getInclude();
            break;
        case 'iKeyboard':
            returnObject = { Type: ObjectType.Keyboard };
            break;
        case 'iFirstPersonControls':
            returnObject = { Type: ObjectType.FirstPersonControls };
            break;
        case 'StrictCompatibility':
            returnObject = { Type: ObjectType.StrictCompatibility };
            break;
        case 'iUniform':
            returnObject = this.getUniformObject();
            break;
        default: // Must be iChannel
            returnObject = this.getTextureObject(nextToken);
            break;
        }

        const rangeEnd = this.lexer.getLastRange().End;
        this.lastObjectRange = { Begin: rangeBegin, End: rangeEnd };

        returnObject = returnObject || {
            Type: ObjectType.Error,
            Message: 'Unkown error while parsing for custom features'
        };
        return returnObject;
    }

    private getInclude(): Include | ErrorObject {
        const nextToken = this.lexer.next();
        if (nextToken === undefined) {
            return this.makeError('Expected string after "include" but got end-of-file');
        }
        if (nextToken.type !== TokenType.String) {
            return this.makeError(`Expected string after "include" but got "${nextToken.value}"`);
        }

        const tokenValue = nextToken.value as string;
        const include: Include = {
            Type: ObjectType.Include,
            Path: tokenValue
        };
        return include;
    }

    private getTextureObject(previous: Token): Texture | TextureMagFilter | TextureMinFilter | TextureWrapMode | TextureType | ErrorObject {
        const nextToken = this.lexer.next();
        if (nextToken === undefined) {
            return this.makeError(`Expected string or "::" after "${previous.value}" but got end-of-file`);
        }
        if (nextToken.type !== TokenType.String &&
            nextToken.value !== '::') {
            return this.makeError(`Expected string or "::" after "${previous.value}" but got "${nextToken.value}"`);
        }

        const channelName = previous.value as string;
        const index = parseInt(channelName.replace('iChannel', ''));

        if (nextToken.type === TokenType.Punctuation) {
            return this.getTextureParameter(index);            
        }

        const tokenValue = nextToken.value as string;
        const texture: Texture = {
            Type: ObjectType.Texture,
            Index: index,
            Path: tokenValue
        };
        return texture;
    }

    private getTextureParameter(index: number): TextureMagFilter | TextureMinFilter | TextureWrapMode | TextureType | ErrorObject {
        const nextToken = this.lexer.next();
        if (nextToken === undefined) {
            return this.makeError('Expected texture parameter keyword after "::" but got end-of-file, valid options are "MinFilter", "MagFilter", "WrapMode" and "Type"');
        }
        if (nextToken.type !== TokenType.Keyword ||
            nextToken.value === 'in') {
            return this.makeError(`Expected texture parameter keyword after "::" but got "${nextToken.value}", valid options are "MinFilter", "MagFilter", "WrapMode" and "Type"`);
        }

        const textureSetting = nextToken.value as string;

        const nextNextToken = this.lexer.next();
        if (nextNextToken === undefined) {
            return this.makeError(`Expected string after "${textureSetting}" but got end-of-file`);
        }
        if (nextNextToken.type !== TokenType.String) {
            return this.makeError(`Expected string after "${textureSetting}" but got "${nextNextToken.value}"`);
        }

        const settingValue = nextNextToken.value as string;

        switch(textureSetting) {
        case 'MagFilter':
            if (Object.values(Types.TextureMagFilter).includes(settingValue as Types.TextureMagFilter)) {
                const magFilter: TextureMagFilter = {
                    Type: ObjectType.TextureMagFilter,
                    Index: index,
                    Value: settingValue as Types.TextureMagFilter
                };
                return magFilter;
            }
            else {
                return this.makeError(`Expected one of "Nearest" or "Linear" after "${textureSetting}" but got "${settingValue}"`);
            }
        case 'MinFilter':
            if (Object.values(Types.TextureMinFilter).includes(settingValue as Types.TextureMinFilter)) {
                const minFilter: TextureMinFilter = {
                    Type: ObjectType.TextureMinFilter,
                    Index: index,
                    Value: settingValue as Types.TextureMinFilter
                };
                return minFilter;
            }
            else {
                return this.makeError(`Expected one of "Nearest", "NearestMipMapNearest", "NearestMipMapLinear", "Linear", "LinearMipMapNearest" or "LinearMipMapLinear" after "${textureSetting}" but got "${settingValue}"`);
            }
        case 'WrapMode':
            if (Object.values(Types.TextureWrapMode).includes(settingValue as Types.TextureWrapMode)) {
                const wrapMode: TextureWrapMode = {
                    Type: ObjectType.TextureWrapMode,
                    Index: index,
                    Value: settingValue as Types.TextureWrapMode
                };
                return wrapMode;
            }
            else {
                return this.makeError(`Expected one of "Clamp", "Repeat" or "Mirror" after "${textureSetting}" but got "${settingValue}"`);
            }
        case 'Type':
            if (Object.values(Types.TextureType).includes(settingValue as Types.TextureType)) {
                const textureType: TextureType = {
                    Type: ObjectType.TextureType,
                    Index: index,
                    Value: settingValue as Types.TextureType
                };
                return textureType;
            }
            else {
                return this.makeError(`Expected one of "Texture2D" or "CubeMap" after "${textureSetting}" but got "${settingValue}"`);
            }
        }

        return this.makeError('Unkown error while parsing texture setting');
    }

    private getUniformObject(): Uniform | ErrorObject {
        let nextToken = this.lexer.next();
        if (nextToken === undefined) {
            return this.makeError('Expected type after "iUniform" but got end-of-file');
        }
        if (nextToken.type !== TokenType.Type) {
            return this.makeError(`Expected type after "iUniform" but got "${nextToken.value}"`);
        }

        const type = nextToken.value as string;

        nextToken = this.lexer.next();
        if (nextToken === undefined) {
            return this.makeError(`Expected identifier after "${type}" but got end-of-file`);
        }
        if (nextToken.type !== TokenType.Identifier) {
            return this.makeError(`Expected identifier after "${type}" but got "${nextToken.value}"`);
        }

        const name = nextToken.value as string;

        let defaultvalue: LiteralNumber | LiteralValue | undefined;
        let minValue: LiteralNumber | LiteralValue | undefined;
        let maxValue: LiteralNumber | LiteralValue | undefined;
        let stepValue: LiteralNumber | LiteralValue | undefined;

        nextToken = this.lexer.peek();
        if (nextToken !== undefined && nextToken.value === '=') {
            this.lexer.next();
            const nextValue = this.getValue();
            if (nextValue.Type === ObjectType.Error) {
                return nextValue;
            }
            defaultvalue = nextValue;
            if (!this.testAssignable(type, defaultvalue.ValueType)) {
                return this.makeError(`Expected initializer of type assignable to "${type}" but got "${defaultvalue.LiteralString}" which is of type "${defaultvalue.ValueType}"`);
            }
            nextToken = this.lexer.peek();
        }
        if (nextToken !== undefined && nextToken.value === 'in') {
            this.lexer.next();
            const rangeArray = this.getArray();
            
            if (rangeArray.Type === ObjectType.Error) {
                return rangeArray;
            }
            if (rangeArray.Value.length !== 2) {
                return this.makeError(`Expected array of type "${type}[2]" but got "${rangeArray.LiteralString}"`);
            }

            [ minValue, maxValue ] = rangeArray.Value;
            if (!this.testAssignable(type, minValue.ValueType)) {
                return this.makeError(`Expected initializer of type "${type}" but got "${minValue.LiteralString}" which is of type ${minValue.ValueType}`);
            }
            if (!this.testAssignable(type, maxValue.ValueType)) {
                return this.makeError(`Expected initializer of type "${type}" but got "${maxValue.LiteralString}" which is of type ${maxValue.ValueType}`);
            }
            nextToken = this.lexer.peek();
        }
        if (nextToken !== undefined && nextToken.value === 'step') {
            this.lexer.next();
            const step = this.getValue();
            
            if (step.Type === ObjectType.Error) {
                return step;
            }

            if (!this.testAssignable(type, step.ValueType)) {
                return this.makeError(`Expected initializer of type "${type}" but got "${step.LiteralString}" which is of type ${step.ValueType}`);
            }

            stepValue = step;
        }

        // Optional sequencer tag (intentionally tolerant):
        // - Accept `sequncer` (typo preserved for backward compatibility) and `sequencer`.
        // - Allow optional `{ ... }` (ignored for now).
        // Note: use the same peek/next pattern as the rest of the parser so we don't
        // disturb tokens that may already be peeked across newlines.
        let sequencerTag: Uniform['Sequencer'] | undefined;
        {
            const tagPeek = this.lexer.peek();
            const tagName = tagPeek && tagPeek.type === TokenType.Identifier ? String(tagPeek.value) : '';
            if (tagName === 'sequncer' || tagName === 'sequencer') {
                this.lexer.next();
                sequencerTag = {};

                // Optional options block `{ ... }`.
                const maybeBrace = this.lexer.peek();
                if (maybeBrace && maybeBrace.type === TokenType.Punctuation && maybeBrace.value === '{') {
                    this.lexer.next();
                    let depth = 1;
                    while (depth > 0) {
                        const t = this.lexer.next();
                        if (t === undefined) {
                            return this.makeError(`Unterminated ${tagName} options block (missing "}")`);
                        }
                        if (t.type === TokenType.Punctuation) {
                            if (t.value === '{') {
                                depth++;
                            } else if (t.value === '}') {
                                depth--;
                            }
                        }
                    }
                }
            }
        }

        const isIntegerType = [ 'int', 'ivec2', 'ivec3', 'ivec4' ].findIndex((value: string) => value === type) >= 0; 

        const flattenLiteral = (source: LiteralNumber | LiteralValue | undefined) => {
            if (source !== undefined) {
                const flattenRecurse = (source: LiteralNumber | LiteralValue) => {
                    if (source.Type === ObjectType.Number) {
                        return [ source.Value ];
                    }
                    else {
                        let result: number[] = [];
                        for (const value of source.Value) {
                            result = result.concat(flattenRecurse(value));
                        }
                        return result;
                    }
                };
                return flattenRecurse(source);
            }
        };

        const defaultAsNumber = flattenLiteral(defaultvalue);
        const minValueAsNumber = flattenLiteral(minValue);
        const maxValueAsNumber = flattenLiteral(maxValue);
        const stepValueAsNumber = flattenLiteral(stepValue) || (isIntegerType ? [ 1.0 ] : undefined);
        
        const uniform: Uniform = {
            Type: ObjectType.Uniform,
            Name: name,
            Typename: type,
            Default: defaultAsNumber,
            Min: minValueAsNumber,
            Max: maxValueAsNumber,
            Step: stepValueAsNumber,
            ...(sequencerTag ? { Sequencer: sequencerTag } : {})
        };
        return uniform;
    }

    private getValue(): LiteralNumber | LiteralValue | ErrorObject {
        const beginPos = this.stream.pos(); 

        let nextToken = this.lexer.peek();
        if (nextToken === undefined) {
            return this.makeError('Expected a number, a type or \'{\' but got end-of-file');
        }
        if (nextToken.type !== TokenType.Integer && nextToken.type !== TokenType.Float && nextToken.type !== TokenType.Type && (nextToken.value !== '[' || nextToken.value !== '{')) {
            return this.makeError(`Expected a number, a type or '{' but got ${nextToken.value}`);
        }

        if (nextToken.type === TokenType.Integer || nextToken.type === TokenType.Float) {
            this.lexer.next();
            const number = nextToken.value as number;
            const numberObject: LiteralNumber = {
                Type: ObjectType.Number,
                ValueType: nextToken.type === TokenType.Integer ? 'int' : 'float',
                LiteralString: this.stream.code().substring(beginPos, this.stream.pos()).trim(),
                Value: number
            };
            return numberObject;
        }
        else if (nextToken.type === TokenType.Type) {
            this.lexer.next();
            const type = nextToken.value as string;

            // TODO: Check if type is array type

            const expectedType = type[0] === 'i' ? 'int' : 'float';
            const expectedSize = parseInt(type[type.length - 1]);

            nextToken = this.lexer.next();
            if (nextToken === undefined) {
                return this.makeError('Expected "(" but got end-of-file');
            }
            if (nextToken.value !== '(') {
                return this.makeError(`Expected "(" but got ${nextToken.value}`);
            }

            const firstValue = this.getValue();
            if (firstValue.Type === ObjectType.Error) {
                return firstValue;
            }
            if (!this.testAssignable(expectedType, firstValue.ValueType)) {
                return this.makeError(`Expected value assignable to type ${expectedType} but got ${firstValue.LiteralString} which is of type ${firstValue.Type}`);
            }

            const values: LiteralNumber[] | LiteralValue[] = firstValue.Type === ObjectType.Number ? [ firstValue ] : [ firstValue ];

            for (let i = 1; i < expectedSize; i++) {
                nextToken = this.lexer.next();
                if (nextToken === undefined) {
                    return this.makeError('Expected "," but got end-of-file');
                }
                if (nextToken.value !== ',') {
                    return this.makeError(`Expected "," but got "${nextToken.value}"`);
                }

                const nextValue = this.getValue();
                if (nextValue.Type === ObjectType.Error) {
                    return nextValue;
                }
                if (!this.testAssignable(expectedType, nextValue.ValueType)) {
                    return this.makeError(`Expected value assignable to type ${firstValue.ValueType} but got ${nextValue.LiteralString} which is of type ${nextValue.ValueType}`);
                }

                // Workaround because ts won't recognise values type by itself
                if (nextValue.Type === ObjectType.Number) {
                    (values as LiteralNumber[]).push(nextValue);
                }
                else {
                    (values as LiteralValue[]).push(nextValue);
                }
            }

            nextToken = this.lexer.next();
            if (nextToken === undefined) {
                return this.makeError('Expected ")" but got end-of-file');
            }
            if (nextToken.value !== ')') {
                return this.makeError(`Expected ")" but got ${nextToken.value}`);
            }

            const valueObject: LiteralValue = {
                Type: ObjectType.Value,
                ValueType: type,
                LiteralString: this.stream.code().substring(beginPos, this.stream.pos()).trim(),
                Value: values
            };
            return valueObject;
        }
        else {
            return this.getArray();
        }
    }

    private getArray(): LiteralValue | ErrorObject {
        const beginPos = this.stream.pos(); 

        let nextToken = this.lexer.next();
        if (nextToken === undefined) {
            return this.makeError('Expected "{" after "in" but got end-of-file');
        }
        if (nextToken.value !== '[' && nextToken.value !== '{') {
            return this.makeError(`Expected "{" after "in" but got ${nextToken.value}`);
        }

        const closePunc = nextToken.value === '[' ? ']' : '}';

        let currentValue = this.getValue();
        if (currentValue.Type === ObjectType.Error) {
            return currentValue;
        }

        const type = currentValue.ValueType;
        const values: LiteralNumber[] | LiteralValue[] = currentValue.Type === ObjectType.Number ? [ currentValue ] : [ currentValue ];
        
        for (;;) {
            nextToken = this.lexer.next();
            if (nextToken === undefined) {
                return this.makeError(`Expected "," or "}" after "${currentValue.LiteralString}" but got end-of-file`);
            }
            if (nextToken.value !== ',' && nextToken.value !== closePunc) {
                return this.makeError(`Expected "," or "}" after "${currentValue.LiteralString}" but ${nextToken.value}`);
            }
            if (nextToken.value === closePunc) {
                break;
            }
    
            currentValue = this.getValue();
            if (currentValue.Type === ObjectType.Error) {
                return currentValue;
            }
            if (!this.testAssignable(type, currentValue.ValueType)) {
                return this.makeError(`Expected value assignable to type ${type} but got "${currentValue.LiteralString}" which is of type ${currentValue.ValueType}`);
            }

            // Workaround because ts won't recognise values type by itself
            if (currentValue.Type === ObjectType.Number) {
                (values as LiteralNumber[]).push(currentValue);
            }
            else {
                (values as LiteralValue[]).push(currentValue);
            }
        }

        const valueObject: LiteralValue = {
            Type: ObjectType.Value,
            ValueType: `${type}[${values.length}]`,
            LiteralString: this.stream.code().substring(beginPos, this.stream.pos()).trim(),
            Value: values
        };
        return valueObject;
    }

    private makeError(message: string): ErrorObject {
        const lastRange = this.lexer.getLastRange();
        const lastRangeSize = lastRange.End - lastRange.Begin;
        const currentColumn = this.stream.column();
        const lastRangeColumn = currentColumn - lastRangeSize;
        const lastRangeHighlight = `${' '.repeat(lastRangeColumn - 1)}^${'~'.repeat(lastRangeSize)}^`;
        const error: ErrorObject = {
            Type: ObjectType.Error,
            Message: message + `\n${this.lexer.getCurrentLine()}\n${lastRangeHighlight}`
        };
        return error;
    }

    private mapVecTypesToArrayTypes(type: string) {
        if (type.indexOf('vec') === 0) {
            return [ `float[${type[type.length - 1]}]`, true ];
        }
        else if (type === 'color3') {
            return [ 'float[3]', true ];
        }
        else if (type.indexOf('ivec') === 0) {
            return [ `int[${type[type.length - 1]}]`, true ];
        }
        return [ type, false];
    }

    private testAssignable(leftType: string, rightType: string) {
        if (leftType === rightType) {
            return true;
        }

        if (leftType === 'float' && rightType === 'int') {
            return true;
        }
        else if (leftType == 'int' && rightType == 'float') {
            return false;
        }

        const [ leftMappedType, leftIsVecType ] = this.mapVecTypesToArrayTypes(leftType);
        const [ rightMappedType ] = this.mapVecTypesToArrayTypes(rightType);

        type TypeDesc = {
            BaseTypeName: string,
            ArraySizes: number[]
        };
        const getTypeDesc = (typeName: string): TypeDesc => {
            const elements = typeName.split('[');
            const stripped_elements = elements.map((element: string, index: number) => {
                if (index == 0)
                    return element;
                return element.slice(0, -1);
            });
            const baseTypeName = stripped_elements.shift();
            const arraySizes = stripped_elements.map(s => Number(s));
            return {
                BaseTypeName: baseTypeName || 'error',
                ArraySizes: arraySizes
            };
        };
        const leftTypeDesc = getTypeDesc(leftMappedType as string);
        const rightTypeDesc = getTypeDesc(rightMappedType as string);

        const leftIsArray = leftTypeDesc.ArraySizes.length > 0;
        const rightIsArray = rightTypeDesc.ArraySizes.length > 0;

        if (leftIsArray || rightIsArray) {
            const arrayElementTypesAssignable = this.testAssignable(leftTypeDesc.BaseTypeName, rightTypeDesc.BaseTypeName);
            if (!arrayElementTypesAssignable) {
                return false;
            }
        }
        else {
            return false;
        }
        
        if (leftIsVecType as boolean && !rightIsArray && this.testAssignable(leftTypeDesc.BaseTypeName, rightTypeDesc.BaseTypeName)) {
            return true;
        }

        if (leftTypeDesc.ArraySizes.length != rightTypeDesc.ArraySizes.length) {
            return false;
        }

        const leftUndefinedArraySize = leftTypeDesc.ArraySizes.indexOf(0);
        if (leftUndefinedArraySize >= 0 && leftUndefinedArraySize < leftTypeDesc.ArraySizes.length - 1) {
            return false;
        }

        const rightUndefinedArraySize = rightTypeDesc.ArraySizes.indexOf(0);
        if (rightUndefinedArraySize >= 0 && rightUndefinedArraySize < rightTypeDesc.ArraySizes.length - 1) {
            return false;
        }

        const arraySizesMatch = leftTypeDesc.ArraySizes.every((arraySize: number) => arraySize == 0 || arraySize == rightTypeDesc.ArraySizes[0]);
        return arraySizesMatch;
    }
}
