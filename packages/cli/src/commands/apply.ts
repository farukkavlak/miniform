import { Orchestrator } from '@miniform/orchestrator';
import { LocalProvider } from '@miniform/provider-local';
import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'node:fs/promises';
import path from 'node:path';

export function createApplyCommand() {
  return new Command('apply')
    .description('Create or update infrastructure')
    .option('-y, --yes', 'Approve changes automatically')
    .action(async (options) => {
      const cwd = process.cwd();
      const configPath = path.join(cwd, 'main.mini');

      try {
        await fs.access(configPath);
      } catch {
        console.error(chalk.red('Error: main.mini not found.'));
        process.exit(1);
      }

      try {
        const configContent = await fs.readFile(configPath, 'utf-8');

        const orchestrator = new Orchestrator(cwd);
        orchestrator.registerProvider(new LocalProvider());

        // Show plan first
        console.log(chalk.blue('Calculating plan...'));
        const actions = await orchestrator.plan(configContent);

        if (actions.length === 0 || actions.every((a) => a.type === 'NO_OP')) {
          console.log(chalk.green('No changes needed.'));
          return;
        }

        // Re-use plan logic to show output (duplicated for now, could be shared)
        console.log(chalk.bold('\nMiniform will perform the following actions:\n'));
        for (const action of actions) {
          if (action.type === 'NO_OP') continue;
          const symbol = action.type === 'CREATE' ? chalk.green('+') : action.type === 'UPDATE' ? chalk.yellow('~') : action.type === 'DELETE' ? chalk.red('-') : ' ';
          console.log(`  ${symbol} ${action.resourceType}.${action.name}`);
        }

        if (!options.yes) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Do you want to perform these actions?',
              default: false,
            },
          ]);

          if (!confirm) {
            console.log(chalk.yellow('Apply cancelled.'));
            return;
          }
        }

        console.log(chalk.blue('\napplying...'));
        await orchestrator.apply(configContent);
        console.log(chalk.green('\nApply complete! Resources: ' + actions.length + ' processed.'));
      } catch (error: any) {
        console.error(chalk.red('Apply failed:'), error.message);
        process.exit(1);
      }
    });
}
