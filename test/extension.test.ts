import * as assert from 'assert';

import { ShaderLexer, TokenType } from '../src/shaderlexer';
import { ShaderStream } from '../src/shaderstream';

suite("Parsing Tests", () => {
    {
        let typesContent = `\
int float vec2 /* a random comment */ ivec2 vec3 ivec3 vec4 ivec4 // an eof comment`;
        let stream = new ShaderStream(typesContent);
        let lexer = new ShaderLexer(stream);
        
        test("Parse Type", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'int' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'float' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'vec2' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'ivec2' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'vec3' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'ivec3' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'vec4' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'ivec4' });
            assert.equal(lexer.next(), undefined);
        });
    }
    
    {
        let stringsContents = `\
"a string" "a \\"string\\"" "a 'string'" /* a random comment */ /* back to back comments */ 'a string' 'a "string"' 'a \\'string\\''
/* 
    a
    multiline
    comment
*/`;
        let stream = new ShaderStream(stringsContents);
        let lexer = new ShaderLexer(stream);
        
        test("Parse String", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.String, value: 'a string' });
            assert.deepEqual(lexer.next(), { type: TokenType.String, value: 'a "string"' });
            assert.deepEqual(lexer.next(), { type: TokenType.String, value: 'a \'string\'' });
            assert.deepEqual(lexer.next(), { type: TokenType.String, value: 'a string' });
            assert.deepEqual(lexer.next(), { type: TokenType.String, value: 'a "string"' });
            assert.deepEqual(lexer.next(), { type: TokenType.String, value: 'a \'string\'' });
            assert.equal(lexer.next(), undefined);
        });
    }
    
    {
        let numbersContent = `\
1 999999999999999999999999999999999 1e6 1e-6 999999999999999.999999999999999999 1. .1 1.e6 1.e-6  .1e6 .1e-6
+1 +999999999999999999999999999999999 +1e6 +1e-6 +999999999999999.999999999999999999 +1. +.1 +1.e6 +1.e-6 +.1e6 +.1e-6
-1 -999999999999999999999999999999999 -1e6 -1e-6 -999999999999999.999999999999999999 -1. -.1 -1.e6 -1.e-6 -.1e6 -.1e-6 `;
        let stream = new ShaderStream(numbersContent);
        let lexer = new ShaderLexer(stream);
        
        test("Parse Integers", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 1 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 999999999999999999999999999999999 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 1e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 1e-6 });
        });

        test("Parse Floats", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 999999999999999.999999999999999999 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 1. });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: .1 });
        });

        test("Parse Floats with Exponents", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 1.e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 1.e-6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: .1e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: .1e-6 });
        });

        test("Parse Integers with explicit Plus", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 1 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 999999999999999999999999999999999 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 1e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 1e-6 });
        });

        test("Parse Floats with explicit Plus", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 999999999999999.999999999999999999 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 1. });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: .1 });
        });

        test("Parse Floats with explicit Plus with Exponents", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 1.e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 1.e-6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: .1e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: .1e-6 });
        });

        test("Parse negative Integers", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: -1 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: -999999999999999999999999999999999 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: -1e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: -1e-6 });
        });

        test("Parse negative Floats", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: -999999999999999.999999999999999999 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: -1. });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: -.1 });
        });

        test("Parse negative Floats with Exponents", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: -1.e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: -1.e-6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: -.1e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: -.1e-6 });
            assert.equal(lexer.next(), undefined);
        });
    }

    {
        let identifiersContent = `\
aFineVariable aFineVariable_1 a_fine_1_variable __a_fine_var__ 1_a_fine_var_`;
        let stream = new ShaderStream(identifiersContent);
        let lexer = new ShaderLexer(stream);
        
        test("Parse Identifiers", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Identifier, value: 'aFineVariable' });
            assert.deepEqual(lexer.next(), { type: TokenType.Identifier, value: 'aFineVariable_1' });
            assert.deepEqual(lexer.next(), { type: TokenType.Identifier, value: 'a_fine_1_variable' });
            assert.deepEqual(lexer.next(), { type: TokenType.Identifier, value: '__a_fine_var__' });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: '1' });
            assert.deepEqual(lexer.next(), { type: TokenType.Identifier, value: '_a_fine_var_' });
            assert.equal(lexer.next(), undefined);
        });
    }
});