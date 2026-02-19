import { Command } from 'commander';
import { CommandModule } from './types';
import { wrapAction } from './utils/cli_utils';
import { ENTITY_STORE_OPTIONS, generateNewSeed } from '../constants';
import { cleanEntityStore, generateEntityStore } from './entity_store';
import { setupEntityResolutionDemo } from './entity_resolution';
import {
  promptForNumericInputs,
  promptForSelection,
  promptForTextInput,
} from './utils/interactive_prompts';
import { ensureSpace } from '../utils';

export const entityStoreCommands: CommandModule = {
  register(program: Command) {
    program
      .command('entity-resolution-demo')
      .option('--mini', 'Only load the mini dataset', false)
      .option('--delete', 'Delete old data', false)
      .option('--keep-emails', 'No Email variants', false)
      .option('--space', 'space to use', 'default')
      .description('Load entity resolution demo data')
      .action(wrapAction(async ({ mini, deleteData, keepEmails, space }) => {
        setupEntityResolutionDemo({ mini, deleteData, keepEmails, space });
      }));

    program
      .command('entity-store')
      .description('Generate entity store')
      .option('--space <space>', 'Space to create entity store in')
      .action(wrapAction(async (options) => {
        const entityStoreAnswers = await promptForSelection<keyof typeof ENTITY_STORE_OPTIONS>({
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

        const counts = await promptForNumericInputs([
          { key: 'users', message: 'How many users', defaultValue: '10' },
          { key: 'hosts', message: 'How many hosts', defaultValue: '10' },
          { key: 'services', message: 'How many services', defaultValue: '10' },
          {
            key: 'genericEntities',
            message: 'How many generic entities',
            defaultValue: '10',
          },
          {
            key: 'offsetHours',
            message: 'Event date offset in hours (how many hours ago events should be generated)',
            defaultValue: '1',
          },
        ]);

        const seed = generateNewSeed() + '';
        const seedAnswer = entityStoreAnswers.includes(ENTITY_STORE_OPTIONS.seed)
          ? await promptForTextInput(
              'Enter seed to generate stable random data or <enter> to use a new seed',
              seed
            )
          : seed;

        await generateEntityStore({
          space: options.space,
          users: counts.users,
          hosts: counts.hosts,
          services: counts.services,
          genericEntities: counts.genericEntities,
          seed: Number(seedAnswer),
          options: entityStoreAnswers,
          offsetHours: counts.offsetHours,
        });
      }));

    program
      .command('quick-entity-store')
      .description('Generate quick entity store')
      .option('--space <space>', 'Space to create entity store in')
      .action(wrapAction(async (options) => {
        const space = await ensureSpace(options.space);
        await generateEntityStore({
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
      }));

    program
      .command('clean-entity-store')
      .description('clean entity store')
      .action(wrapAction(cleanEntityStore));
  },
};
