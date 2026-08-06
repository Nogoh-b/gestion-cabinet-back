import { spawn } from 'child_process';
import { Command } from 'commander';
import { readdirSync } from 'fs';
import inquirer from 'inquirer';
// migration-cli.ts
// This script is a CLI tool for managing database migrations.
// It allows users to generate, run, and revert migrations using a command-line interface.
const enum COMMANDS {
  GENERATE = 'generate',
  RUN = 'run',
  REVERT = 'revert',
}

const promptFunc = async (): Promise<string> => {
  // const dir = readdirSync('apps', { withFileTypes: true }).filter((dirent) =>
  //   dirent.isDirectory(),
  // );

  const command = [COMMANDS.GENERATE, COMMANDS.RUN, COMMANDS.REVERT];

  const prompt = inquirer.createPromptModule();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return prompt({
    type: 'list',
    name: 'application',
    message: 'Select application your want to run migration for: ',
    choices: command.map((cmd) => cmd),
  })
    .then((answers) => {
      if (answers.application === COMMANDS.GENERATE) {
        console.log(`Generating migrations for ${answers.application}...`);
        return spawn(
          'yarn',
          [
            'typeorm',
            'migration:generate',
            `./src/core/database/migrations`,
            '--',
            '-d',
            `./src/core/database/dataSource.ts`,
          ],
          {
            stdio: 'inherit',
            shell: true,
          },
        ).on('close', (code) => {
          if (code === 0) {
            console.log('Migration generated successfully.');
          }
        });
      } else if (answers.application === COMMANDS.RUN) {
        console.log(`Running migrations for ${answers.application}...`);
        return spawn(
          'yarn',
          [
            'typeorm',
            'migration:run',
            '--',
            '-d',
            `./src/core/database/dataSource.ts`,
          ],
          {
            stdio: 'inherit',
            shell: true,
          },
        ).on('close', (code) => {
          if (code === 0) {
            console.log('Migration generated successfully.');
          }
        });
      } else if (answers.application === COMMANDS.REVERT) {
        console.log(`Reverting migrations for ${answers.application}...`);
        return spawn(
          'yarn',
          [
            'typeorm',
            'migration:revert',
            '--',
            '-d',
            `./src/core/database/dataSource.ts`,
          ],
          {
            stdio: 'inherit',
            shell: true,
          },
        ).on('close', (code) => {
          if (code === 0) {
            console.log('Migration generated successfully.');
          }
        });
      }
      return answers.application as any;
    })
    .catch((error) => {
      if (error.isTtyError)
        console.error(
          'Prompt cannot be rendered in the current environment. Please run this command in a terminal.',
        );
      else console.error('An error occurred while prompting:', error);
      throw error;
    });
};

const program = new Command();
program
  .command('migrate')
  .description('Run migrations CLI')
  .argument('<command>', 'migration command: generate, run, revert')
  .action(async (action) => {
    console.log(`Executing migration command: ${action}`);
    // if (
    //   action !== COMMANDS.GENERATE &&
    //   action !== COMMANDS.REVERT &&
    //   action !== COMMANDS.RUN
    // ) {
    //   console.log('Unknown command. Please use generate, run, or revert.');
    //   return;
    // }
    console.log(`${action} migrations...`);
    await promptFunc();
  });

program.parse(process.argv);
