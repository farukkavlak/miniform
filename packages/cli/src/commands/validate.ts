import { Graph } from '@miniform/graph';
import { Lexer, Parser } from '@miniform/parser';
import { LocalProvider } from '@miniform/provider-local';
import chalk from 'chalk';
import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export function createValidateCommand(): Command {
  const command = new Command('validate');

  command
    .description('Validate configuration files')
    .argument('[config]', 'Path to config file', 'main.mf')
    .action(async (configPath: string) => {
      try {
        const fullPath = path.resolve(process.cwd(), configPath);

        console.log(chalk.bold(`\nValidating ${configPath}...\n`));

        // Check if file exists
        try {
          await fs.access(fullPath);
        } catch {
          console.log(chalk.red('✗ File not found'));
          process.exit(1);
        }

        // Read config
        const configContent = await fs.readFile(fullPath, 'utf8');

        // 1. Syntax Validation
        console.log(chalk.cyan('→ Checking syntax...'));
        let program;
        try {
          const lexer = new Lexer(configContent);
          const tokens = lexer.tokenize();
          const parser = new Parser(tokens);
          program = parser.parse();
          console.log(chalk.green('  ✓ Syntax is valid'));
        } catch (error) {
          console.log(chalk.red('  ✗ Syntax error:'), error instanceof Error ? error.message : error);
          process.exit(1);
        }

        // 2. Schema Validation
        console.log(chalk.cyan('→ Validating resource schemas...'));
        const provider = new LocalProvider();
        let schemaErrors = 0;

        for (const stmt of program) {
          if (stmt.type === 'Resource') {
            try {
              const schema = await provider.getSchema(stmt.resourceType);
              if (!schema) {
                console.log(chalk.yellow(`  ⚠ No schema found for ${stmt.resourceType}`));
                continue;
              }

              // Convert attributes to plain object for validation
              const attrs: Record<string, unknown> = {};
              if (stmt.attributes) {
                for (const [key, value] of Object.entries(stmt.attributes)) {
                  attrs[key] = (value as { type: string; value: unknown }).value;
                }
              }

              await provider.validate(stmt.resourceType, attrs);
              console.log(chalk.green(`  ✓ ${stmt.resourceType}.${stmt.name}`));
            } catch (error) {
              console.log(chalk.red(`  ✗ ${stmt.resourceType}.${stmt.name}:`), error instanceof Error ? error.message : error);
              schemaErrors++;
            }
          }
        }

        if (schemaErrors > 0) {
          console.log(chalk.red(`\n✗ Validation failed with ${schemaErrors} error(s)`));
          process.exit(1);
        }

        // 3. Dependency Validation (check for cycles)
        console.log(chalk.cyan('→ Checking dependencies...'));
        try {
          const graph = new Graph<null>();

          // Add all resources to graph
          for (const stmt of program) {
            if (stmt.type === 'Resource') {
              const key = `${stmt.resourceType}.${stmt.name}`;
              graph.addNode(key, null);
            }
          }

          // Simple reference detection (basic validation)
          for (const stmt of program) {
            if (stmt.type === 'Resource') {
              const key = `${stmt.resourceType}.${stmt.name}`;

              // Check attributes for references
              if (stmt.attributes) {
                for (const attr of Object.values(stmt.attributes)) {
                  const typedAttr = attr as { type: string; value: unknown };
                  if (typedAttr.type === 'Reference') {
                    const refParts = typedAttr.value as string[];
                    if (refParts.length >= 2 && refParts[0] !== 'var' && refParts[0] !== 'data') {
                      const depKey = `${refParts[0]}.${refParts[1]}`;
                      if (graph.hasNode(depKey)) {
                        graph.addEdge(depKey, key);
                      }
                    }
                  }
                }
              }
            }
          }

          // Check for cycles
          graph.topologicalSort();
          console.log(chalk.green('  ✓ No circular dependencies'));
        } catch (error) {
          console.log(chalk.red('  ✗ Dependency error:'), error instanceof Error ? error.message : error);
          process.exit(1);
        }

        console.log(chalk.bold.green('\n✓ Configuration is valid\n'));
      } catch (error) {
        console.error(chalk.red('Validation error:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return command;
}
