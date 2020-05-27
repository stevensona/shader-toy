import * as assert from 'assert';

import { ShaderLexer, TokenType } from '../src/shaderlexer';
import { ShaderStream } from '../src/shaderstream';
import { ShaderParser, ObjectType } from '../src/shaderparser';

suite("Lexing Tests", () => {
    
    {
        let shaderContent = `\
/******************************************************************************
*   Multiline Comment
******************************************************************************/
void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    // Output to screen
    fragColor = vec4(0.0, 0.0, 1.0, 1.0);
 }`;
        let stream = new ShaderStream(shaderContent);
        let lexer = new ShaderLexer(stream);
        
        test("Lex Whole Shader", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Identifier, value: 'void' });
            assert.deepEqual(lexer.next(), { type: TokenType.Identifier, value: 'mainImage' });
            assert.deepEqual(lexer.next(), { type: TokenType.Punctuation, value: '(' });
            assert.deepEqual(lexer.next(), { type: TokenType.Keyword, value: 'out' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'vec4' });
            assert.deepEqual(lexer.next(), { type: TokenType.Identifier, value: 'fragColor' });
            assert.deepEqual(lexer.next(), { type: TokenType.Punctuation, value: ',' });
            assert.deepEqual(lexer.next(), { type: TokenType.Keyword, value: 'in' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'vec2' });
            assert.deepEqual(lexer.next(), { type: TokenType.Identifier, value: 'fragCoord' });
            assert.deepEqual(lexer.next(), { type: TokenType.Punctuation, value: ')' });
            assert.deepEqual(lexer.next(), { type: TokenType.Punctuation, value: '{' });
            assert.deepEqual(lexer.next(), { type: TokenType.Identifier, value: 'fragColor' });
            assert.deepEqual(lexer.next(), { type: TokenType.Operator, value: '=' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'vec4' });
            assert.deepEqual(lexer.next(), { type: TokenType.Punctuation, value: '(' });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: '0.0' });
            assert.deepEqual(lexer.next(), { type: TokenType.Punctuation, value: ',' });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: '0.0' });
            assert.deepEqual(lexer.next(), { type: TokenType.Punctuation, value: ',' });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: '1.0' });
            assert.deepEqual(lexer.next(), { type: TokenType.Punctuation, value: ',' });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: '1.0' });
            assert.deepEqual(lexer.next(), { type: TokenType.Punctuation, value: ')' });
            assert.deepEqual(lexer.next(), { type: TokenType.Punctuation, value: ';' });
            assert.deepEqual(lexer.next(), { type: TokenType.Punctuation, value: '}' });
            assert.equal(lexer.next(), undefined);
        });
    }

    {
        let typesContent = `\
int float vec2 /* a random comment */ ivec2 vec3 ivec3 vec4 ivec4
color3// an eof comment`;
        let stream = new ShaderStream(typesContent);
        let lexer = new ShaderLexer(stream);
        
        test("Lex Type", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'int' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'float' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'vec2' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'ivec2' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'vec3' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'ivec3' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'vec4' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'ivec4' });
            assert.deepEqual(lexer.next(), { type: TokenType.Type, value: 'color3' });
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
        
        test("Lex String", () => {
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
        
        test("Lex Integers", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 1 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 999999999999999999999999999999999 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 1e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 1e-6 });
        });

        test("Lex Floats", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 999999999999999.999999999999999999 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 1. });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: .1 });
        });

        test("Lex Floats with Exponents", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 1.e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 1.e-6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: .1e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: .1e-6 });
        });

        test("Lex Integers with explicit Plus", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 1 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 999999999999999999999999999999999 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 1e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: 1e-6 });
        });

        test("Lex Floats with explicit Plus", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 999999999999999.999999999999999999 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 1. });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: .1 });
        });

        test("Lex Floats with explicit Plus with Exponents", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 1.e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: 1.e-6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: .1e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: .1e-6 });
        });

        test("Lex negative Integers", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: -1 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: -999999999999999999999999999999999 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: -1e6 });
            assert.deepEqual(lexer.next(), { type: TokenType.Integer, value: -1e-6 });
        });

        test("Lex negative Floats", () => {
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: -999999999999999.999999999999999999 });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: -1. });
            assert.deepEqual(lexer.next(), { type: TokenType.Float, value: -.1 });
        });

        test("Lex negative Floats with Exponents", () => {
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
        
        test("Lex Identifiers", () => {
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

suite("Parsing Tests", () => {
    {
        let uniformsContents = `\
#iUniform float test_float = 1
#iUniform float test_float_with_range = 1 in { -1, 1 }
#iUniform vec4 test_vec4 = vec4(1, 1, 1, 1)
#iUniform vec4 test_vec4_with_range = vec4(1, 1, 1, 1) in { vec4(0, 1, 2, 3), vec4(99, 98, 97, 96) }
#iUniform vec4 test_vec4_with_mismatched_range = vec4(1, 1, 1, 1) in { 0, 99 }
#iUniform color3 test_color = color3(0.5, 0.5, 0.5)
`;
        let parser = new ShaderParser(uniformsContents);
        
        test("Parse Uniforms", () => {
            assert.deepEqual(parser.next(), { 
                Type: ObjectType.Uniform,
                Name: 'test_float',
                Typename: 'float',
                Default: [ 1.0 ],
                Min: undefined,
                Max: undefined,
                Step: undefined
            });
            assert.deepEqual(parser.next(), { 
                Type: ObjectType.Uniform,
                Name: 'test_float_with_range',
                Typename: 'float',
                Default: [ 1.0 ],
                Min: [ -1.0 ],
                Max: [ 1.0 ],
                Step: undefined
            });
            assert.deepEqual(parser.next(), { 
                Type: ObjectType.Uniform,
                Name: 'test_vec4',
                Typename: 'vec4',
                Default: [ 1.0, 1.0, 1.0, 1.0 ],
                Min: undefined,
                Max: undefined,
                Step: undefined
            });
            assert.deepEqual(parser.next(), { 
                Type: ObjectType.Uniform,
                Name: 'test_vec4_with_range',
                Typename: 'vec4',
                Default: [ 1.0, 1.0, 1.0, 1.0 ],
                Min: [ 0.0, 1.0, 2.0, 3.0 ],
                Max: [ 99.0, 98.0, 97.0, 96.0 ],
                Step: undefined
            });
            assert.deepEqual(parser.next(), { 
                Type: ObjectType.Uniform,
                Name: 'test_vec4_with_mismatched_range',
                Typename: 'vec4',
                Default: [ 1.0, 1.0, 1.0, 1.0 ],
                Min: [ 0.0 ],
                Max: [ 99.0 ],
                Step: undefined
            });
            assert.deepEqual(parser.next(), { 
                Type: ObjectType.Uniform,
                Name: 'test_color',
                Typename: 'color3',
                Default: [ 0.5, 0.5, 0.5 ],
                Min: undefined,
                Max: undefined,
                Step: undefined
            });
            assert.equal(parser.next(), undefined);
        });
    }
});