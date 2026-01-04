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

**Requirement:** A modular system to manage state, resolve dependencies, and execute changes.

- [x] **Implement Modular Core Engine** (`@miniform/contracts`, `@miniform/graph`, `@miniform/state`, `@miniform/planner`, `@miniform/orchestrator`)
  - [x] Define `IResource`, `IProvider` interfaces
  - [x] Implement Schema Validation (Runtime type checking)
  - [x] Implement DAG & Topological Sort (No deps)
  - [x] Implement Parallel Execution (Batch-wise layers)
  - [x] Basic State Manager (JSON I/O)
  - [x] Implement Locking & Backup (Reliability)
  - [x] Enhance Error Reporting (Line/Col in Parser)
  - [x] Implement Variables Support (`var.name` references)
  - [x] Implement Diff Engine (Plan logic)
  - [x] Implement Orchestrator (Runner)
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

## 7. Technical Debt (Missings)

**Requirement:** List of identified gaps to be addressed in future iterations.

- [x] **State Locking:** Race condition protection (lock file).
- [x] **State Backup:** Atomic writes with backup (.bak) generation.
- [x] **Parser Error Reporting:** Detailed line/column error messages.
- [x] **Variables Support:** Support for usage of `var.name`.
- [x] **Parallel Graph Execution:** Execute independent nodes in parallel.
- [x] **Provider Schema Validation:** Runtime validation of inputs in Contracts.
- [ ] **String Interpolation:** `${var.x}` support (requires Lexer templates).
- [ ] **Variable Blocks:** `variable "env" { default = "dev" }` parsing.
- [ ] **Reference Resolution:** Planner logic to resolve `Reference` nodes to values.
