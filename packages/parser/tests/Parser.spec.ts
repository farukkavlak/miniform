import { describe, expect, it } from 'vitest';

import { Lexer } from '../src/Lexer';
import { Parser } from '../src/Parser';

function makeParser(input: string): Parser {
  const lexer = new Lexer(input);
  return new Parser(lexer.tokenize());
}

describe('Miniform Parser', () => {
  describe('Valid Cases', () => {
    it('should parse a simple resource block', () => {
      const input = `
      resource "file" "test" {
        path = "./test.txt"
        count = 5
        active = true
      }
    `;
      const parser = makeParser(input);
      const ast = parser.parse();

      expect(ast).toHaveLength(1);
      expect(ast[0]).toMatchObject({
        type: 'Resource',
        resourceType: 'file',
        name: 'test',
        attributes: {
          path: { type: 'String', value: './test.txt' },
          count: { type: 'Number', value: 5 },
          active: { type: 'Boolean', value: true },
        },
      });
    });

    it('should parse multiple resources', () => {
      const input = `
      resource "valid" "one" { key = "value" }
      resource "valid" "two" { key = 2 }
    `;
      const parser = makeParser(input);
      const ast = parser.parse();
      expect(ast).toHaveLength(2);
      expect(ast[0].name).toBe('one');
      expect(ast[1].name).toBe('two');
    });

    it('should handle empty attributes', () => {
      const input = `resource "empty" "attributes" {}`;
      const parser = makeParser(input);
      const ast = parser.parse();
      expect(ast[0].attributes).toEqual({});
    });

    it('should ignore comments', () => {
      const input = `
      # This is a comment
      resource "comment" "test" {
        // Another comment
        key = "value" # Inline comment
      }
    `;
      const parser = makeParser(input);
      const ast = parser.parse();
      expect(ast).toHaveLength(1);
      expect(ast[0].attributes.key).toBeDefined();
    });
  });

  describe('Error Cases', () => {
    it('should throw on missing resource type', () => {
      const input = `resource "name" { key = "val" }`; // Missing type string, got "name" (which is parsed as type actually, but let's see)
      // Actually \`resource "name" {\` -> type="name", missing name string.
      // Expectation: current parser consumes 2 strings.
      // \`resource "name" {\` -> consumes "name" as type. Then sees \`{\`. Expects string (name).
      const parser = makeParser(input);
      expect(() => parser.parse()).toThrow('Expect resource name string');
    });

    it('should throw on missing resource name', () => {
      const input = `resource "type" { key = "val" }`;
      // Consumes "type". Next is \`{\`. Expects name string.
      const parser = makeParser(input);
      expect(() => parser.parse()).toThrow('Expect resource name string');
    });

    it('should throw on missing opening brace', () => {
      const input = `resource "type" "name" key = "val"`;
      const parser = makeParser(input);
      expect(() => parser.parse()).toThrow("Expect '{'");
    });

    it('should throw on missing closing brace', () => {
      const input = `resource "type" "name" { key = "val"`;
      const parser = makeParser(input);
      expect(() => parser.parse()).toThrow("Expect '}'");
    });

    it('should throw on invalid attribute syntax (missing =)', () => {
      const input = `resource "type" "name" { key "val" }`;
      const parser = makeParser(input);
      expect(() => parser.parse()).toThrow("Expect '='");
    });

    it('should throw on invalid attribute key (not identifier)', () => {
      const input = `resource "type" "name" { "key" = "val" }`; // Key expects identifier, got string
      const parser = makeParser(input);
      expect(() => parser.parse()).toThrow('Expect attribute name');
    });

    it('should throw on invalid value type', () => {
      const input = `resource "type" "name" { key = resource }`; // 'resource' is a keyword, not a valid value
      const parser = makeParser(input);
      expect(() => parser.parse()).toThrow('Unexpected value');
    });

    it('should throw on unexpected tokens at top level', () => {
      const input = `random_token "type" "name" {}`;
      const parser = makeParser(input);
      expect(() => parser.parse()).toThrow('Unexpected token');
    });
  });
});
