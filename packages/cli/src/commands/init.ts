import { StateManager } from '@miniform/state';
import chalk from 'chalk';
import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';

export const initCommand = new Command('init').description('Initialize a new Miniform workspace').action(async () => {
  const cwd = process.cwd();
  const miniformDir = path.join(cwd, '.miniform');

  console.log(chalk.blue('Initializing Miniform workspace...'));

  try {
    // 1. Create .miniform directory
    await fs.mkdir(miniformDir, { recursive: true });
    console.log(chalk.green(`✓ Created ${miniformDir}`));

    // 2. Initialize empty state
    const stateManager = new StateManager(cwd);
    // Create empty state
    await stateManager.write({ version: 1, resources: {} });
    console.log(chalk.green(`✓ Initialized state.json`));

    console.log(chalk.bold.green('\nMiniform initialized successfully! 🚀'));
  } catch (error: any) {
    console.error(chalk.red('Failed to initialize workspace:'), error.message);
    process.exit(1);
  }
});
