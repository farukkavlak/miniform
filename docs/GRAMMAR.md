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

The Lexer recognizes these tokens:

| Token Type   | Pattern / Example             | Description                              |
| :----------- | :---------------------------- | :--------------------------------------- |
| `IDENTIFIER` | `resource`, `path`, `content` | Alphanumeric keywords or variable names. |
| `STRING`     | `"hello world"`               | Double-quoted strings.                   |
| `NUMBER`     | `123`, `4.5`                  | Numeric values.                          |
| `BOOLEAN`    | `true`, `false`               | Boolean values.                          |
| `LBRACE`     | `{`                           | Start of a block.                        |
| `RBRACE`     | `}`                           | End of a block.                          |
| `ASSIGN`     | `=`                           | Assignment operator.                     |
| `DOT`        | `.`                           | Reference separator.                     |
| `COMMENT`    | `# ...` or `// ...`           | Ignored by parser.                       |

## 3. Supported Block Types

### Resource Block

```hcl
resource "local_file" "config" {
  path = "/tmp/config.json"
  content = "Hello World"
}
```

**Fields:**

- `resource` - Keyword
- `"local_file"` - Resource type (string)
- `"config"` - Resource name (string)
- `{ ... }` - Attribute block

## 4. Value Types

### Primitive Types

- **String:** `"hello"`
- **Number:** `42`, `3.14`
- **Boolean:** `true`, `false`

### References

- **Variable:** `var.region`
- **Resource:** `local_file.config.path`

**Reference Format:**

```
<type>.<name>.<attribute>
```

Examples:

- `var.environment` → Variable reference
- `local_file.base.path` → Resource attribute reference

## 5. Abstract Syntax Tree (AST)

```typescript
type Program = Statement[];

type Statement = ResourceStatement;

interface ResourceStatement {
  type: 'Resource';
  resourceType: string;
  name: string;
  attributes: Record<string, AttributeValue>;
}

interface AttributeValue {
  type: 'String' | 'Number' | 'Boolean' | 'Reference';
  value: string | number | boolean;
  path?: string[]; // For references: ['local_file', 'config', 'path']
}
```

## 6. Comments

```hcl
# Single line comment
// Also single line comment

resource "local_file" "example" {
  path = "/tmp/file.txt"  # Inline comment
  content = "data"
}
```

## 7. Example Configurations

### Simple File Creation

```hcl
resource "local_file" "welcome" {
  path = "./welcome.txt"
  content = "Hello Miniform!"
}
```

### Multiple Resources

```hcl
resource "local_file" "base" {
  path = "/tmp/base.txt"
  content = "Base content"
}

resource "local_file" "derived" {
  path = "/tmp/derived.txt"
  content = "Derived content"
}
```

### With Variable References

```hcl
resource "local_file" "config" {
  path = var.config_path
  content = "Environment config"
}
```

### With Resource References

```hcl
resource "local_file" "base" {
  path = "/tmp/base.txt"
  content = "Base"
}

resource "local_file" "derived" {
  path = local_file.base.path
  content = "Uses base path"
}
```

## 8. Reserved Keywords

- `resource` - Resource block
- `var` - Variable reference prefix

## 9. Limitations

**Not Yet Supported:**

- Variable blocks (`variable "name" {}`)
- Output blocks (`output "name" {}`)
- Data sources (`data "type" "name" {}`)
- Modules (`module "name" {}`)
- String interpolation (`"${var.x}"`)
- Lists/Arrays (`["a", "b"]`)
- Maps/Objects (`{key = "value"}`)
- Meta-arguments (`count`, `for_each`, `depends_on`)
- Lifecycle blocks
- Provisioners

See [TASKS.md](./TASKS.md) for planned features.
