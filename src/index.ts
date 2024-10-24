#! /usr/bin/env node
import { program } from 'commander';
import {
  generateAlerts,
  deleteAllAlerts,
  deleteAllEvents,
  generateGraph,
  generateEvents,
} from './commands/documents';
import { setupEntityResolutionDemo } from './commands/entity_resolution';
import { kibanaApi } from './utils/';
import {
  cleanEntityStore,
  generateEntityStore,
} from './commands/entity-store';

import {
  createPerfDataFile,
  uploadPerfDataFile,
  listPerfDataFiles,
} from './commands/entity-store-perf';
import inquirer from 'inquirer';
import { ENTITY_STORE_OPTIONS, generateNewSeed } from './constants';
import { initializeSpace } from './utils/initialize_space';

program
  .command('generate-alerts')
  .option('-n <n>', 'number of alerts')
  .option('-h <h>', 'number of hosts')
  .option('-u <h>', 'number of users')
  .option('-s <h>', 'space (will be created if it does not exist)')
  .description('Generate fake alerts')
  .action(async (options) => {
    const alertsCount = parseInt(options.n || 1);
    const hostCount = parseInt(options.h || 1);
    const userCount = parseInt(options.u || 1);
    const space = options.s || 'default';

    if(space !== 'default') {
      await initializeSpace(space);
    }
    
    generateAlerts(alertsCount, userCount, hostCount, space);
  });

program
  .command('generate-events')
  .argument('<n>', 'integer argument', parseInt)
  .description('Generate events')
  .action(generateEvents);

program
  .command('generate-graph')
  // .argument('<n>', 'integer argument', parseInt)
  .description('Generate fake graph')
  .action(generateGraph);

program
  .command('delete-alerts')
  .description('Delete all alerts')
  .action(deleteAllAlerts);

program
  .command('delete-events')
  .description('Delete all events')
  .action(deleteAllEvents);

program
  .command('test-risk-score')
  .description('Test risk score API')
  .action(kibanaApi.fetchRiskScore);

program
  .command('create-perf-data')
  .argument('<name>', 'name of the file')
  .argument('<entity-count>', 'number of entities', parseInt)
  .argument('<logs-per-entity>', 'number of logs per entity', parseInt)
  .argument('[start-index]', 'for sequential data, which index to start at', parseInt, 0)
  .description('Create performance data')
  .action((name, entityCount, logsPerEntity, startIndex) => {
    createPerfDataFile({ name, entityCount, logsPerEntity, startIndex });
  });

program
  .command('upload-perf-data')
  .argument('[file]', 'File to upload')
  .option('--index <index>', 'Destination index')
  .description('Upload performance data file')
  .action(async (file, options) => {
    let selectedFile = file;

    if (!selectedFile) {
      const files = await listPerfDataFiles();

      if (files.length === 0) {
        console.log('No files to upload');
        process.exit(1);
      }

      const response = await inquirer.prompt<{ selectedFile: string }>([
        {
          type: 'list',
          name: 'selectedFile',
          message: 'Select a file to upload',
          choices: files,
        },
      ]);
      selectedFile = response.selectedFile;
    }

    await uploadPerfDataFile(selectedFile, options.index);
  });

program
  .command('entity-resolution-demo')
  .option('--mini', 'Only load the mini dataset', false)
  .option('--delete', 'Delete old data', false)
  .option('--keep-emails', 'No Email variants', false)
  .description('Load entity resolution demo data')
  .action(({ mini, deleteData, keepEmails }) =>{ 
    setupEntityResolutionDemo({ mini, deleteData, keepEmails });
  });

type EntityStoreAnswers = {
  options: string[];
  users: number;
  hosts: number;
  seed: number;
};

program
  .command('entity-store')
  .description('Generate entity store')
  .action(
    () => {
      inquirer
        .prompt<EntityStoreAnswers>([
          {
            type: 'checkbox',
            message: 'Select options',
            name: 'options',
            choices: [
              {
                name: 'Seed (stable random data)',
                value: ENTITY_STORE_OPTIONS.seed,
                checked: true,
              },
              {
                name: 'Assign asset criticality',
                value: ENTITY_STORE_OPTIONS.criticality,
                checked: true,
              },
              {
                name: 'Enable Risk Engine',
                value: ENTITY_STORE_OPTIONS.riskEngine,
                checked: true,
              },
              {
                name: 'Create detection rule',
                value: ENTITY_STORE_OPTIONS.rule,
                checked: true,
              },
              {
                name: 'Generate fake elastic agents for hosts',
                value: ENTITY_STORE_OPTIONS.agent,
                checked: true,
              },
            ],
          },
          {
            type: 'input',
            name: 'users',
            message: 'How many users',
            default() {
              return 10;
            },
            filter(input) {
              return parseInt(input, 10);
            },
          },
          {
            type: 'input',
            name: 'hosts',
            message: 'How many hosts',
            filter(input) {
              return parseInt(input, 10);
            },
            default() {
              return 10;
            },
          },
        ])
        .then(answers => {
          const seed = generateNewSeed();
          if (answers.options.includes(ENTITY_STORE_OPTIONS.seed)) {
            return inquirer.prompt<{ seed: number }>([
              {
                type: 'input',
                name: 'seed',
                message: 'Enter seed to generate stable random data or <enter> to use a new seed',
                filter(input) {
                  return parseInt(input, 10);
                },
                default() {
                  return seed;
                },
              },
            ]).then(seedAnswer => {
              return { ...answers, ...seedAnswer };
            })
          }
          return { ...answers, seed }
        })
        .then((answers) => {

          const {
            users, hosts, seed } = answers;
          generateEntityStore({
            users,
            hosts,
            seed,
            options: answers.options,
          });
        });
    }

  );

cleanEntityStore;

program
  .command('clean-entity-store')
  .description('Generate entity store')
  .action(cleanEntityStore);

program.parse();
