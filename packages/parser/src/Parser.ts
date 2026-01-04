import { AttributeValue, Program, ResourceBlock } from './ast';
import { Token, TokenType } from './tokens';

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  public parse(): Program {
    const program: Program = [];
    while (!this.isAtEnd()) program.push(this.parseStatement());
    return program;
  }

  private parseStatement(): ResourceBlock {
    if (this.matchToken(TokenType.Resource)) return this.parseResource();
    throw new Error(`Unexpected token at line ${this.peek().line}: ${this.peek().value}`);
  }

  private parseResource(): ResourceBlock {
    // resource "type" "name" { ... }
    const typeToken = this.consume(TokenType.String, "Expect resource type string after 'resource'.");
    const nameToken = this.consume(TokenType.String, 'Expect resource name string after resource type.');

    this.consume(TokenType.LBrace, "Expect '{' after resource name.");

    const attributes: Record<string, AttributeValue> = {};
    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const key = this.consume(TokenType.Identifier, 'Expect attribute name.').value;
      this.consume(TokenType.Assign, "Expect '=' after attribute name.");
      const value = this.parseValue();
      attributes[key] = value;
    }

    this.consume(TokenType.RBrace, "Expect '}' after block body.");

    return {
      type: 'Resource',
      resourceType: typeToken.value,
      name: nameToken.value,
      attributes,
    };
  }

  private parseValue(): AttributeValue {
    if (this.matchToken(TokenType.String)) return { type: 'String', value: this.previous().value };
    if (this.matchToken(TokenType.Number)) return { type: 'Number', value: Number(this.previous().value) };
    if (this.matchToken(TokenType.Boolean)) return { type: 'Boolean', value: this.previous().value === 'true' };
    throw new Error(`Unexpected value at line ${this.peek().line}: ${this.peek().value}`);
  }

  private matchToken(...types: TokenType[]): boolean {
    for (const type of types)
      if (this.check(type)) {
        this.advance();
        return true;
      }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(`${message} At line ${this.peek().line}`);
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }
}
