export enum TokenType {
  Resource = 'RESOURCE', // 'resource' keyword
  Identifier = 'IDENTIFIER', // Variable names, Types
  String = 'STRING', // "value"
  Number = 'NUMBER', // 123
  Boolean = 'BOOLEAN', // true, false
  LBrace = 'LBRACE', // {
  RBrace = 'RBRACE', // }
  Assign = 'ASSIGN', // =
  EOF = 'EOF', // End of File
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}
