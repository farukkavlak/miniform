import { Command } from 'commander';

import { initCommand } from './commands/init';

const program = new Command();

program.name('miniform').description('Infrastructure as Code for local resources').version('1.0.0');

program.addCommand(initCommand);

program.parse();
