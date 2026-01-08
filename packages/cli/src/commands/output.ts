import { LocalBackend } from '@miniform/state';
import { StateManager } from '@miniform/state';
import chalk from 'chalk';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function createOutputCommand(): Command {
  const command = new Command('output');

  command
    .description('Show output values from the current state')
    .option('--json', 'Output in JSON format')
    .option('--state <path>', 'Path to state file', '.miniform/terraform.tfstate')
    .action(async (options) => {
      const statePath = options.state ? path.resolve(process.cwd(), options.state) : path.resolve(process.cwd(), '.miniform/state.json');

      if (!fs.existsSync(statePath)) {
        console.log(chalk.yellow('No state file found at ' + statePath));
        return;
      }

      try {
        // Read state
        const backend = new LocalBackend(statePath);
        const stateManager = new StateManager(backend);
        const state = await stateManager.read();

        // Extract outputs from state
        const outputs: Record<string, unknown> = {};

        // Outputs are stored in state.variables with scope prefix
        // Root scope outputs are in '' or 'root' scope
        if (state.variables) {
          for (const [scope, vars] of Object.entries(state.variables)) {
            // Root scope outputs don't have module prefix
            if (scope === '' || !scope.includes('module.')) {
              if (typeof vars === 'object' && vars !== null) {
                for (const [key, varValue] of Object.entries(vars)) {
                  // Skip internal variables, only show outputs
                  if (typeof varValue === 'object' && varValue !== null && 'value' in varValue) {
                    outputs[key] = (varValue as { value: unknown }).value;
                  } else {
                    outputs[key] = varValue;
                  }
                }
              }
            }
          }
        }

        // Display outputs
        if (options.json) {
          console.log(JSON.stringify(outputs, null, 2));
        } else {
          if (Object.keys(outputs).length === 0) {
            console.log(chalk.yellow('No outputs found in state.'));
          } else {
            console.log(chalk.bold('\nOutputs:\n'));
            for (const [key, value] of Object.entries(outputs)) {
              console.log(`${chalk.cyan(key)} = ${chalk.green(JSON.stringify(value))}`);
            }
            console.log();
          }
        }
      } catch (error) {
        console.error(chalk.red('Error reading outputs:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return command;
}
