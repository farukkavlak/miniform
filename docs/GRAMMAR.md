# Miniform Grammar Specification

## 1. Basic Structure

Miniform uses a declarative syntax composed of **Blocks** and **Attributes**.

```hcl
resource "type" "name" {
  key = "value"
  number = 42
  boolean = true
}
```

## 2. Token Definitions

The Lexer must recognize these tokens:

| Token Type   | Pattern / Example             | Description                              |
| :----------- | :---------------------------- | :--------------------------------------- |
| `IDENTIFIER` | `resource`, `path`, `content` | Alphanumeric keywords or variable names. |
| `STRING`     | `"hello world"`               | Double-quoted strings.                   |
| `NUMBER`     | `123`, `4.5`                  | Numeric values.                          |
| `BOOLEAN`    | `true`, `false`               | Boolean values.                          |
| `LBRACE`     | `{`                           | Start of a block.                        |
| `RBRACE`     | `}`                           | End of a block.                          |
| `ASSIGN`     | `=`                           | Assignment operator.                     |
| `COMMENT`    | `# ...` or `// ...`           | Ignored by parser.                       |

## 3. Abstract Syntax Tree (AST)

The parser will convert the tokens into an AST like this:

```typescript
type AST = Block[];

interface Block {
  type: string; // "resource"
  resourceType: string; // "file"
  name: string; // "example"
  attributes: Record<string, string | number | boolean>;
}
```

## 4. Example File (`main.mini`)

```miniform
resource "local_file" "welcome" {
  path = "./welcome.txt"
  content = "Hello Miniform!"
  overwrite = true
}

resource "random_string" "suffix" {
  length = 8
}
```
