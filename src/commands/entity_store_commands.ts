import { Command } from 'commander';
import { checkbox, input } from '@inquirer/prompts';
import { CommandModule } from './types';
import { parseIntBase10 } from './utils/cli_utils';
import { ENTITY_STORE_OPTIONS, generateNewSeed } from '../constants';
import { cleanEntityStore, generateEntityStore } from './entity_store';
import { setupEntityResolutionDemo } from './entity_resolution';

export const entityStoreCommands: CommandModule = {
  register(program: Command) {
    program
      .command('entity-resolution-demo')
      .option('--mini', 'Only load the mini dataset', false)
      .option('--delete', 'Delete old data', false)
      .option('--keep-emails', 'No Email variants', false)
      .option('--space', 'space to use', 'default')
      .description('Load entity resolution demo data')
      .action(({ mini, deleteData, keepEmails, space }) => {
        setupEntityResolutionDemo({ mini, deleteData, keepEmails, space });
      });

    program
      .command('entity-store')
      .description('Generate entity store')
      .option('--space <space>', 'Space to create entity store in')
      .action(async (options) => {
        const entityStoreAnswers = await checkbox<keyof typeof ENTITY_STORE_OPTIONS>({
          message: 'Select options',
          choices: [
            { name: 'Seed (stable random data)', value: ENTITY_STORE_OPTIONS.seed, checked: true },
            {
              name: 'Assign asset criticality',
              value: ENTITY_STORE_OPTIONS.criticality,
              checked: true,
            },
            { name: 'Enable Risk Engine', value: ENTITY_STORE_OPTIONS.riskEngine, checked: true },
            { name: 'Create detection rule', value: ENTITY_STORE_OPTIONS.rule, checked: true },
            {
              name: 'Generate fake elastic agents for hosts',
              value: ENTITY_STORE_OPTIONS.agent,
              checked: false,
            },
            {
              name: 'Enrich entities via API (adds behaviors, attributes, lifecycle, relationships)',
              value: ENTITY_STORE_OPTIONS.apiEnrichment,
              checked: false,
            },
          ],
        });

        const userCount = await input({ message: 'How many users', default: '10' });
        const hostCount = await input({ message: 'How many hosts', default: '10' });
        const serviceCount = await input({ message: 'How many services', default: '10' });
        const genericEntitiesCount = await input({
          message: 'How many generic entities',
          default: '10',
        });
        const offsetHours = await input({
          message: 'Event date offset in hours (how many hours ago events should be generated)',
          default: '1',
        });
        const seed = generateNewSeed() + '';
        const seedAnswer = entityStoreAnswers.includes(ENTITY_STORE_OPTIONS.seed)
          ? await input({
              message: 'Enter seed to generate stable random data or <enter> to use a new seed',
              default: seed,
            })
          : seed;

        generateEntityStore({
          space: options.space,
          users: parseIntBase10(userCount),
          hosts: parseIntBase10(hostCount),
          services: parseIntBase10(serviceCount),
          genericEntities: parseIntBase10(genericEntitiesCount),
          seed: parseIntBase10(seedAnswer),
          options: entityStoreAnswers,
          offsetHours: parseIntBase10(offsetHours),
        });
      });

    program
      .command('quick-entity-store')
      .description('Generate quick entity store')
      .option('--space <space>', 'Space to create entity store in')
      .action(async (options) => {
        const space = options.space || 'default';
        generateEntityStore({
          space,
          users: 10,
          hosts: 10,
          services: 10,
          genericEntities: 10,
          seed: generateNewSeed(),
          options: [
            ENTITY_STORE_OPTIONS.criticality,
            ENTITY_STORE_OPTIONS.riskEngine,
            ENTITY_STORE_OPTIONS.rule,
          ],
          offsetHours: 1,
        });
      });

    program
      .command('clean-entity-store')
      .description('clean entity store')
      .action(cleanEntityStore);
  },
};
