# Miniform Execution Checklist

## 0. Architectural Standards

**Constraint:** Zero Runtime Dependencies (Only devDependencies allowed).

## 1. Project Initialization

**Requirement:** Setup a TypeScript Node.js environment.

- [x] Initialize `package.json`
- [x] Configure `tsconfig.json` for strict typing
- [x] Add linting tools (ESLint/Prettier)

## 2. Syntax & Parsing (The DSL)

**Requirement:** A custom, clean syntax for defining resources.

- [x] **Grammar Design:** Define allowed tokens and structure
- [x] **Lexer:** Implement tokenizer to convert string input -> Tokens
- [ ] **Parser:** Implement parser to convert Tokens -> AST (Abstract Syntax Tree)
- [ ] **Unit Tests:** Verify handling of valid/invalid syntax

## 3. Core Engine Logic

**Requirement:** A system to manage state, resolve dependencies, and execute changes.

- [ ] **State Management:** Implement JSON reader/writer for `miniform.state.json`
- [ ] **Graph System:** Implement DAG (Directed Acyclic Graph) for dependency sorting
- [ ] **Diff Engine:** Logic to compare _Desired State_ (Config) vs _Actual State_ (JSON)
- [ ] **Integration Tests:** Verify simple apply/plan cycles

## 4. Providers & Resource Coverage

**Requirement:** Implement specific resource types to prove the engine works.

### 4.1. Core Resources

- [ ] **`local_file`**:
  - Manage files on disk.
  - Inputs: `filename`, `content`
- [ ] **`random_string`**:
  - Generate random strings (good for testing state persistence).
  - Inputs: `length`, `special` (bool)
- [ ] **`null_resource`**:
  - Do nothing (good for testing dependency chains).
  - Inputs: `triggers` (map)
- [ ] **`command_exec`**:
  - Execute shell commands.
  - Inputs: `command`, `cwd`

## 5. CLI Implementation

**Requirement:** Command-line interface for user interaction.

- [ ] `miniform init`: Workspace setup
- [ ] `miniform plan`: Dry-run (show diffs)
- [ ] `miniform apply`: Execute changes

## 6. Future Scope: Scalable Provider Architecture

**Requirement:** Design the engine to support any provider (AWS, Azure, GitHub), not just local files.

- [ ] **Provider Interface:** Design a generic interface (Connection, CRUD methods).
- [ ] **Plugin System:** Way to load external providers (even if hardcoded initially).
- [ ] **AWS Provider (Future):**
  - `aws_s3_bucket`
  - `aws_instance`
- [ ] **Multi-Provider Support:** Handle `provider "aws" { ... }` and `provider "local" { ... }` in the same graph.
