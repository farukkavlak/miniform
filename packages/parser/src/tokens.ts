export enum TokenType {
  Resource = 'RESOURCE', // 'resource' keyword
  Variable = 'VARIABLE', // 'variable' keyword
  Identifier = 'IDENTIFIER', // Variable names, Types
  String = 'STRING', // "value"
  Number = 'NUMBER', // 123
  Boolean = 'BOOLEAN', // true, false
  LBrace = 'LBRACE', // {
  RBrace = 'RBRACE', // }
  Assign = 'ASSIGN', // =
  Dot = 'DOT', // . (for references)
  EOF = 'EOF', // End of File
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}
