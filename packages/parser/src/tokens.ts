export enum TokenType {
  Resource = 'RESOURCE', // 'resource' keyword
  Variable = 'VARIABLE', // 'variable' keyword
  Output = 'OUTPUT', // 'output' keyword
  Module = 'MODULE', // 'module' keyword
  Data = 'DATA', // 'data' keyword
  Identifier = 'IDENTIFIER', // Variable names, Types
  String = 'STRING', // "value"
  Number = 'NUMBER', // 123
  Boolean = 'BOOLEAN', // true, false
  LBrace = 'LBRACE', // {
  RBrace = 'RBRACE', // }
  Assign = 'ASSIGN', // =
  Dot = 'DOT', // . (for references)
  LBracket = 'LBRACKET', // [
  RBracket = 'RBRACKET', // ]
  Comma = 'COMMA', // ,
  EOF = 'EOF', // End of File
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}
