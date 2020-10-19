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
    Step?: number[]
};
type Keyboard = {
    Type: ObjectType.Keyboard
};
type StrictCompatibility = {
    Type: ObjectType.StrictCompatibility
};
type ErrorObject = {
    Type: ObjectType.Error,
    Message: string
};
type TextureObject = Texture | TextureMagFilter | TextureMinFilter | TextureWrapMode | TextureType;
type Object = Include | TextureObject | Uniform | Keyboard | StrictCompatibility;

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

    public next(): Object | ErrorObject | undefined {
        let nextToken = this.lexer.next();
        while (!this.lexer.eof() && (nextToken === undefined || nextToken.type !== TokenType.PreprocessorKeyword)) {
            nextToken = this.lexer.next();
        }
        if (this.lexer.eof() || nextToken === undefined) {
            return undefined;
        }

        let rangeBegin = this.lexer.getLastRange().Begin;

        let tokenValue = nextToken.value as string;
        let returnObject: Object | ErrorObject;
        switch (tokenValue) {
            case 'include':
                returnObject = this.getInclude();
                break;
            case 'iKeyboard':
                returnObject = { Type: ObjectType.Keyboard };
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

        let rangeEnd = this.lexer.getLastRange().End;
        this.lastObjectRange = { Begin: rangeBegin, End: rangeEnd };

        returnObject = returnObject || {
            Type: ObjectType.Error,
            Message: `Unkown error while parsing for custom features`
        };
        return returnObject;
    }

    private getInclude(): Include | ErrorObject {
        let nextToken = this.lexer.next();
        if (nextToken === undefined) {
            return this.makeError(`Expected string after "include" but got end-of-file`);
        }
        if (nextToken.type !== TokenType.String) {
            return this.makeError(`Expected string after "include" but got "${nextToken.value}"`);
        }

        let tokenValue = nextToken.value as string;
        let include: Include = {
            Type: ObjectType.Include,
            Path: tokenValue
        };
        return include;
    }

    private getTextureObject(previous: Token): Texture | TextureMagFilter | TextureMinFilter | TextureWrapMode | TextureType | ErrorObject {
        let nextToken = this.lexer.next();
        if (nextToken === undefined) {
            return this.makeError(`Expected string or "::" after "${previous.value}" but got end-of-file`);
        }
        if (nextToken.type !== TokenType.String &&
            nextToken.value !== '::') {
            return this.makeError(`Expected string or "::" after "${previous.value}" but got "${nextToken.value}"`);
        }

        let channelName = previous.value as string;
        let index = parseInt(channelName.replace('iChannel', ''));

        if (nextToken.type === TokenType.Punctuation) {
            return this.getTextureParameter(index);            
        }

        let tokenValue = nextToken.value as string;
        let texture: Texture = {
            Type: ObjectType.Texture,
            Index: index,
            Path: tokenValue
        };
        return texture;
    }

    private getTextureParameter(index: number): TextureMagFilter | TextureMinFilter | TextureWrapMode | TextureType | ErrorObject {
        let nextToken = this.lexer.next();
        if (nextToken === undefined) {
            return this.makeError(`Expected texture parameter keyword after "::" but got end-of-file, valid options are "MinFilter", "MagFilter", "WrapMode" and "Type"`);
        }
        if (nextToken.type !== TokenType.Keyword ||
            nextToken.value === 'in') {
            return this.makeError(`Expected texture parameter keyword after "::" but got "${nextToken.value}", valid options are "MinFilter", "MagFilter", "WrapMode" and "Type"`);
        }

        let textureSetting = nextToken.value as string;

        let nextNextToken = this.lexer.next();
        if (nextNextToken === undefined) {
            return this.makeError(`Expected string after "${textureSetting}" but got end-of-file`);
        }
        if (nextNextToken.type !== TokenType.String) {
            return this.makeError(`Expected string after "${textureSetting}" but got "${nextNextToken.value}"`);
        }

        let settingValue = nextNextToken.value as string;

        switch(textureSetting) {
            case "MagFilter":
                if (Object.values(Types.TextureMagFilter).includes(settingValue as Types.TextureMagFilter)) {
                    let magFilter: TextureMagFilter = {
                        Type: ObjectType.TextureMagFilter,
                        Index: index,
                        Value: settingValue as Types.TextureMagFilter
                    };
                    return magFilter;
                }
                else {
                    return this.makeError(`Expected one of "Nearest" or "Linear" after "${textureSetting}" but got "${settingValue}"`);
                }
            case "MinFilter":
                if (Object.values(Types.TextureMinFilter).includes(settingValue as Types.TextureMinFilter)) {
                    let minFilter: TextureMinFilter = {
                        Type: ObjectType.TextureMinFilter,
                        Index: index,
                        Value: settingValue as Types.TextureMinFilter
                    };
                    return minFilter;
                }
                else {
                    return this.makeError(`Expected one of "Nearest", "NearestMipMapNearest", "NearestMipMapLinear", "Linear", "LinearMipMapNearest" or "LinearMipMapLinear" after "${textureSetting}" but got "${settingValue}"`);
                }
            case "WrapMode":
                if (Object.values(Types.TextureWrapMode).includes(settingValue as Types.TextureWrapMode)) {
                    let wrapMode: TextureWrapMode = {
                        Type: ObjectType.TextureWrapMode,
                        Index: index,
                        Value: settingValue as Types.TextureWrapMode
                    };
                    return wrapMode;
                }
                else {
                    return this.makeError(`Expected one of "Clamp", "Repeat" or "Mirror" after "${textureSetting}" but got "${settingValue}"`);
                }
            case "Type":
                if (Object.values(Types.TextureType).includes(settingValue as Types.TextureType)) {
                    let textureType: TextureType = {
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

        return this.makeError(`Unkown error while parsing texture setting`);
    }

    private getUniformObject(): Uniform | ErrorObject {
        let nextToken = this.lexer.next();
        if (nextToken === undefined) {
            return this.makeError(`Expected type after "iUniform" but got end-of-file`);
        }
        if (nextToken.type !== TokenType.Type) {
            return this.makeError(`Expected type after "iUniform" but got "${nextToken.value}"`);
        }

        let type = nextToken.value as string;

        nextToken = this.lexer.next();
        if (nextToken === undefined) {
            return this.makeError(`Expected identifier after "${type}" but got end-of-file`);
        }
        if (nextToken.type !== TokenType.Identifier) {
            return this.makeError(`Expected identifier after "${type}" but got "${nextToken.value}"`);
        }

        let name = nextToken.value as string;

        let defaultvalue: LiteralNumber | LiteralValue | undefined;
        let minValue: LiteralNumber | LiteralValue | undefined;
        let maxValue: LiteralNumber | LiteralValue | undefined;
        let stepValue: LiteralNumber | LiteralValue | undefined;

        nextToken = this.lexer.peek();
        if (nextToken !== undefined && nextToken.value === "=") {
            this.lexer.next();
            let nextValue = this.getValue();
            if (nextValue.Type === ObjectType.Error) {
                return nextValue;
            }
            defaultvalue = nextValue;
            if (!ShaderParser.testAssignable(type, defaultvalue.ValueType)) {
                return this.makeError(`Expected initializer of type assignable to "${type}" but got "${defaultvalue.LiteralString}" which is of type "${defaultvalue.ValueType}"`);
            }
            nextToken = this.lexer.peek();
        }
        if (nextToken !== undefined && nextToken.value === "in") {
            this.lexer.next();
            let rangeArray = this.getArray();
            
            if (rangeArray.Type === ObjectType.Error) {
                return rangeArray;
            }
            if (rangeArray.Value.length !== 2) {
                return this.makeError(`Expected array of type "${type}[2]" but got "${rangeArray.LiteralString}"`);
            }

            [ minValue, maxValue ] = rangeArray.Value;
            if (!ShaderParser.testAssignable(type, minValue.ValueType)) {
                return this.makeError(`Expected initializer of type "${type}" but got "${minValue.LiteralString}" which is of type ${minValue.ValueType}`);
            }
            if (!ShaderParser.testAssignable(type, maxValue.ValueType)) {
                return this.makeError(`Expected initializer of type "${type}" but got "${maxValue.LiteralString}" which is of type ${maxValue.ValueType}`);
            }
            nextToken = this.lexer.peek();
        }
        if (nextToken !== undefined && nextToken.value === "step") {
            this.lexer.next();
            let step = this.getValue();
            
            if (step.Type === ObjectType.Error) {
                return step;
            }

            if (!ShaderParser.testAssignable(type, step.ValueType)) {
                return this.makeError(`Expected initializer of type "${type}" but got "${step.LiteralString}" which is of type ${step.ValueType}`);
            }

            stepValue = step;
        }

        let isIntegerType = [ "int", "ivec2", "ivec3", "ivec4" ].findIndex((value: string) => value === type) >= 0; 

        let flattenLiteral = (source: LiteralNumber | LiteralValue | undefined) => {
            if (source !== undefined) {
                let flattenRecurse = (source: LiteralNumber | LiteralValue) => {
                    if (source.Type === ObjectType.Number) {
                        return [ source.Value ];
                    }
                    else {
                        let result: number[] = [];
                        for (let value of source.Value) {
                            result = result.concat(flattenRecurse(value));
                        }
                        return result;
                    }
                };
                return flattenRecurse(source);
            }
        };

        let defaultAsNumber = flattenLiteral(defaultvalue);
        let minValueAsNumber = flattenLiteral(minValue);
        let maxValueAsNumber = flattenLiteral(maxValue);
        let stepValueAsNumber = flattenLiteral(stepValue) || (isIntegerType ? [ 1.0 ] : undefined);
        
        let uniform: Uniform = {
            Type: ObjectType.Uniform,
            Name: name,
            Typename: type,
            Default: defaultAsNumber,
            Min: minValueAsNumber,
            Max: maxValueAsNumber,
            Step: stepValueAsNumber
        };
        return uniform;
    }

    private getValue(): LiteralNumber | LiteralValue | ErrorObject {
        let beginPos = this.stream.pos(); 

        let nextToken = this.lexer.peek();
        if (nextToken === undefined) {
            return this.makeError(`Expected a number, a type or '{' but got end-of-file`);
        }
        if (nextToken.type !== TokenType.Integer && nextToken.type !== TokenType.Float && nextToken.type !== TokenType.Type && (nextToken.value !== '[' || nextToken.value !== '{')) {
            return this.makeError(`Expected a number, a type or '{' but got ${nextToken.value}`);
        }

        if (nextToken.type === TokenType.Integer || nextToken.type === TokenType.Float) {
            this.lexer.next();
            let number = nextToken.value as number;
            let numberObject: LiteralNumber = {
                Type: ObjectType.Number,
                ValueType: nextToken.type === TokenType.Integer ? 'int' : 'float',
                LiteralString: this.stream.code().substring(beginPos, this.stream.pos()).trim(),
                Value: number
            };
            return numberObject;
        }
        else if (nextToken.type === TokenType.Type) {
            this.lexer.next();
            let type = nextToken.value as string;

            // TODO: Check if type is array type

            let expectedType = type[0] === 'i' ? 'int' : 'float';
            let expectedSize = parseInt(type[type.length - 1]);

            nextToken = this.lexer.next();
            if (nextToken === undefined) {
                return this.makeError(`Expected "(" but got end-of-file`);
            }
            if (nextToken.value !== '(') {
                return this.makeError(`Expected "(" but got ${nextToken.value}`);
            }

            let firstValue = this.getValue();
            if (firstValue.Type === ObjectType.Error) {
                return firstValue;
            }
            if (!ShaderParser.testAssignable(expectedType, firstValue.ValueType)) {
                return this.makeError(`Expected value assignable to type ${expectedType} but got ${firstValue.LiteralString} which is of type ${firstValue.Type}`);
            }

            let values: LiteralNumber[] | LiteralValue[] = firstValue.Type === ObjectType.Number ? [ firstValue ] : [ firstValue ];

            for (let i = 1; i < expectedSize; i++) {
                nextToken = this.lexer.next();
                if (nextToken === undefined) {
                    return this.makeError(`Expected "," but got end-of-file`);
                }
                if (nextToken.value !== ',') {
                    return this.makeError(`Expected "," but got "${nextToken.value}"`);
                }

                let nextValue = this.getValue();
                if (nextValue.Type === ObjectType.Error) {
                    return nextValue;
                }
                if (!ShaderParser.testAssignable(expectedType, nextValue.ValueType)) {
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
                return this.makeError(`Expected ")" but got end-of-file`);
            }
            if (nextToken.value !== ')') {
                return this.makeError(`Expected ")" but got ${nextToken.value}`);
            }

            let valueObject: LiteralValue = {
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
        let beginPos = this.stream.pos(); 

        let nextToken = this.lexer.next();
        if (nextToken === undefined) {
            return this.makeError(`Expected "{" after "in" but got end-of-file`);
        }
        if (nextToken.value !== '[' && nextToken.value !== "{") {
            return this.makeError(`Expected "{" after "in" but got ${nextToken.value}`);
        }

        let closePunc = nextToken.value === '[' ? ']' : '}';

        let currentValue = this.getValue();
        if (currentValue.Type === ObjectType.Error) {
            return currentValue;
        }

        let type = currentValue.ValueType;
        let values: LiteralNumber[] | LiteralValue[] = currentValue.Type === ObjectType.Number ? [ currentValue ] : [ currentValue ];
        
        while (true) {
            nextToken = this.lexer.next();
            if (nextToken === undefined) {
                return this.makeError(`Expected "," or "}" after "${currentValue.LiteralString}" but got end-of-file`);
            }
            if (nextToken.value !== "," && nextToken.value !== closePunc) {
                return this.makeError(`Expected "," or "}" after "${currentValue.LiteralString}" but ${nextToken.value}`);
            }
            if (nextToken.value === closePunc) {
                break;
            }
    
            currentValue = this.getValue();
            if (currentValue.Type === ObjectType.Error) {
                return currentValue;
            }
            if (!ShaderParser.testAssignable(type, currentValue.ValueType)) {
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

        let valueObject: LiteralValue = {
            Type: ObjectType.Value,
            ValueType: `${type}[${values.length}]`,
            LiteralString: this.stream.code().substring(beginPos, this.stream.pos()).trim(),
            Value: values
        };
        return valueObject;
    }

    private makeError(message: string): ErrorObject {
        let lastRange = this.lexer.getLastRange();
        let lastRangeSize = lastRange.End - lastRange.Begin;
        let currentColumn = this.stream.column();
        let lastRangeColumn = currentColumn - lastRangeSize;
        let lastRangeHighlight = `${' '.repeat(lastRangeColumn - 1)}^${'~'.repeat(lastRangeSize)}^`;
        let error: ErrorObject = {
            Type: ObjectType.Error,
            Message: message + `\n${this.lexer.getCurrentLine()}\n${lastRangeHighlight}`
        };
        return error;
    }

    private static mapVecTypesToArrayTypes(type: string) {
        if (type.indexOf('vec') === 0) {
            return `float[${type[type.length - 1]}]`;
        }
        else if (type === 'color3') {
            return `float[3]`;
        }
        else if (type.indexOf('ivec') === 0) {
            return `int[${type[type.length - 1]}]`;
        }
        return type;
    }

    private static getArrayElementType(type: string) {
        let first_bracket = type.indexOf('[');
        return first_bracket >= 0 ? type.substring(0, first_bracket) : undefined;
    }

    private static testAssignable(leftType: string, rightType: string) {
        if (leftType === rightType) {
            return true;
        }

        if (leftType === 'float' && rightType === 'int') {
            return true;
        }

        leftType = this.mapVecTypesToArrayTypes(leftType);
        rightType = this.mapVecTypesToArrayTypes(rightType);

        {
            let leftArrayElementType = this.getArrayElementType(leftType) || leftType;
            let rightArrayElementType = this.getArrayElementType(rightType) || rightType;
            let leftIsArrayType = leftArrayElementType !== leftType;
            let rightIsArrayType = rightArrayElementType !== rightType;
            if (leftIsArrayType || rightIsArrayType) {
                let arrayElementTypesAssignable = this.testAssignable(leftArrayElementType, rightArrayElementType);
                if (!arrayElementTypesAssignable) {
                    return false;
                }
                else if (leftIsArrayType !== rightIsArrayType) {
                    return true;
                }
            }
        }

        let lPos = 0;
        while (leftType[lPos] === rightType[lPos] && leftType[lPos] !== '[') { lPos++; }

        let isFirst = true;

        let rPos = lPos;
        while (lPos !== leftType.length && rPos !== rightType.length) {
            let lStart = lPos + 1;
            while(leftType[lPos] !== ']') { lPos++; }
            let lNumber = parseInt(leftType.substring(lStart, lPos - 1));

            let rStart = lPos + 1;
            while(rightType[rPos] !== ']') { rPos++; }
            let rNumber = parseInt(rightType.substring(rStart, rPos - 1));

            if (isNaN(lNumber) && isFirst) { continue; }

            if (isNaN(lNumber) || isNaN(rNumber)) { return false; }
            if (lNumber !== rNumber) { return false; }

            isFirst = false;
        }

        return lPos === leftType.length && rPos === rightType.length;
    }
}
