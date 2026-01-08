import { LocalBackend, StateManager } from '@miniform/state';
import chalk from 'chalk';
import { Command } from 'commander';
import * as fs from 'node:fs';
// eslint-disable-next-line unicorn/import-style
import * as path from 'node:path';

function extractOutputs(variables: Record<string, any> | undefined): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};
  if (!variables) return outputs;

  for (const [scope, vars] of Object.entries(variables)) {
    // Root scope outputs don't have module prefix
    // eslint-disable-next-line max-depth
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
  return outputs;
}

function displayOutputs(outputs: Record<string, unknown>, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(outputs, null, 2));
    return;
  }

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
        const outputs = extractOutputs(state.variables);

        // Display outputs
        displayOutputs(outputs, options.json);
      } catch (error) {
        console.error(chalk.red('Error reading outputs:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return command;
}
