import { Orchestrator } from '@miniform/orchestrator';
import { LocalProvider } from '@miniform/provider-local';
import chalk from 'chalk';
import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';

export function createPlanCommand() {
  return new Command('plan').description('Show changes required by the current configuration').action(async () => {
    const cwd = process.cwd();
    const configPath = path.join(cwd, 'main.mini');

    try {
      // Check if config exists
      await fs.access(configPath);
    } catch {
      console.error(chalk.red('Error: main.mini not found in current directory.'));
      process.exit(1);
    }

    try {
      const configContent = await fs.readFile(configPath, 'utf-8');

      const orchestrator = new Orchestrator(cwd);
      orchestrator.registerProvider(new LocalProvider());

      console.log(chalk.blue('Refreshing state...'));

      const actions = await orchestrator.plan(configContent);

      if (actions.length === 0) {
        console.log(chalk.green('No changes. Your infrastructure matches the configuration.'));
        return;
      }

      console.log(chalk.bold('\nMiniform will perform the following actions:\n'));

      for (const action of actions) {
        if (action.type === 'NO_OP') continue;

        const symbol = action.type === 'CREATE' ? chalk.green('+') : action.type === 'UPDATE' ? chalk.yellow('~') : action.type === 'DELETE' ? chalk.red('-') : ' ';

        const typeColor =
          action.type === 'CREATE' ? chalk.green('create') : action.type === 'UPDATE' ? chalk.yellow('update') : action.type === 'DELETE' ? chalk.red('destroy') : 'no-op';

        console.log(`  ${symbol} ${action.resourceType}.${action.name} will be ${typeColor}d`);

        if (action.type === 'UPDATE' && action.changes)
          for (const [key, change] of Object.entries(action.changes)) console.log(`      ${key}: ${JSON.stringify(change.old)} -> ${JSON.stringify(change.new)}`);
      }

      const createCount = actions.filter((a) => a.type === 'CREATE').length;
      const updateCount = actions.filter((a) => a.type === 'UPDATE').length;
      const deleteCount = actions.filter((a) => a.type === 'DELETE').length;

      console.log(chalk.bold(`\nPlan: ${createCount} to add, ${updateCount} to change, ${deleteCount} to destroy.`));
    } catch (error: any) {
      console.error(chalk.red('Planning failed:'), error.message);
      process.exit(1);
    }
  });
}
