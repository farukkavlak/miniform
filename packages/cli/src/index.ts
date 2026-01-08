import { Command } from 'commander';

import { createApplyCommand } from './commands/apply';
import { createInitCommand } from './commands/init';
import { createOutputCommand } from './commands/output';
import { createPlanCommand } from './commands/plan';
import { createValidateCommand } from './commands/validate';

const program = new Command();

program.name('miniform').description('Infrastructure as Code for local resources').version('1.0.0');

program.addCommand(createInitCommand());
program.addCommand(createPlanCommand());
program.addCommand(createApplyCommand());
program.addCommand(createOutputCommand());
program.addCommand(createValidateCommand());

program.parse();
