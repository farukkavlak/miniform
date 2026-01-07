import { AttributeValue, DataBlock, OutputBlock, Program, ResourceBlock, Statement, VariableBlock } from './ast';
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

  private statementParsers: Record<string, () => Statement> = {
    [TokenType.Resource]: this.parseResource.bind(this),
    [TokenType.Variable]: this.parseVariable.bind(this),
    [TokenType.Data]: this.parseData.bind(this),
    [TokenType.Output]: this.parseOutput.bind(this),
  };

  private parseStatement(): Statement {
    for (const [tokenType, handler] of Object.entries(this.statementParsers)) if (this.matchToken(tokenType as TokenType)) return handler();
    return this.error(`Unexpected token: ${this.peek().value}`);
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

  private parseData(): DataBlock {
    // data "type" "name" { ... }
    const typeToken = this.consume(TokenType.String, "Expect data source type string after 'data'.");
    const nameToken = this.consume(TokenType.String, 'Expect data source name string after data source type.');

    this.consume(TokenType.LBrace, "Expect '{' after data source name.");

    const attributes: Record<string, AttributeValue> = {};
    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const key = this.consume(TokenType.Identifier, 'Expect attribute name.').value;
      this.consume(TokenType.Assign, "Expect '=' after attribute name.");
      const value = this.parseValue();
      attributes[key] = value;
    }

    this.consume(TokenType.RBrace, "Expect '}' after block body.");

    return {
      type: 'Data',
      dataSourceType: typeToken.value,
      name: nameToken.value,
      attributes,
    };
  }

  private parseVariable(): VariableBlock {
    // variable "name" { ... }
    const nameToken = this.consume(TokenType.String, "Expect variable name string after 'variable'.");

    this.consume(TokenType.LBrace, "Expect '{' after variable name.");

    const attributes: Record<string, AttributeValue> = {};
    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const key = this.consume(TokenType.Identifier, 'Expect attribute name.').value;
      this.consume(TokenType.Assign, "Expect '=' after attribute name.");
      const value = this.parseValue();
      attributes[key] = value;
    }

    this.consume(TokenType.RBrace, "Expect '}' after block body.");

    return {
      type: 'Variable',
      name: nameToken.value,
      attributes,
    };
  }

  private parseOutput(): OutputBlock {
    // output "name" { value = ... }
    const nameToken = this.consume(TokenType.String, "Expect output name string after 'output'.");

    this.consume(TokenType.LBrace, "Expect '{' after output name.");
    this.consume(TokenType.Identifier, "Expect 'value' keyword in output block.");
    this.consume(TokenType.Assign, "Expect '=' after 'value'.");

    const value = this.parseValue();

    this.consume(TokenType.RBrace, "Expect '}' after output block.");

    return {
      type: 'Output',
      name: nameToken.value,
      value,
    };
  }

  private parseValue(): AttributeValue {
    if (this.matchToken(TokenType.String)) return { type: 'String', value: this.previous().value };
    if (this.matchToken(TokenType.Number)) return { type: 'Number', value: Number(this.previous().value) };
    if (this.matchToken(TokenType.Boolean)) return { type: 'Boolean', value: this.previous().value === 'true' };

    // Reference Parsing: identifier.key.subkey
    if (this.check(TokenType.Identifier) || this.check(TokenType.Data)) {
      const parts: string[] = [];

      // First part
      parts.push(this.advance().value);

      // Subsequent parts (dot separated)
      while (this.matchToken(TokenType.Dot)) {
        if (this.check(TokenType.Identifier) || this.check(TokenType.Data) || this.check(TokenType.Variable) || this.check(TokenType.Resource) || this.check(TokenType.Output)) {
          parts.push(this.advance().value);
        } else {
          return this.error('Expect property name after dot.');
        }
      }

      return { type: 'Reference', value: parts };
    }

    return this.error(`Unexpected value: ${this.peek().value}`);
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
    return this.error(message);
  }

  private error(message: string): never {
    const token = this.peek();
    throw new Error(`[Line ${token.line}, Column ${token.column}] ${message}`);
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
