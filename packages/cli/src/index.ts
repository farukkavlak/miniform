import { Command } from 'commander';

import { applyCommand } from './commands/apply';
import { initCommand } from './commands/init';
import { planCommand } from './commands/plan';

const program = new Command();

program.name('miniform').description('Infrastructure as Code for local resources').version('1.0.0');

program.addCommand(initCommand);
program.addCommand(planCommand);
program.addCommand(applyCommand);

program.parse();
