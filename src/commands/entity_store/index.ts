import { type Command } from 'commander';
import { type CommandModule } from '../types.ts';
import { wrapAction } from '../utils/cli_utils.ts';
import { log } from '../../utils/logger.ts';
import {
  ENTITY_STORE_OPTIONS,
  ENTITY_MAINTAINERS_OPTIONS,
  generateNewSeed,
} from '../../constants.ts';
import type { EntityMaintainerOption } from '../../constants.ts';
import { cleanEntityStore, generateEntityStore } from './entity_store.ts';
import { setupEntityResolutionDemo } from './entity_resolution.ts';
import { generateEntityMaintainersData } from './entity_maintainers.ts';
import {
  promptForNumericInputs,
  promptForSelection,
  promptForTextInput,
} from '../utils/interactive_prompts.ts';
import { ensureSpace } from '../../utils/index.ts';
import { riskScoreV2Command } from './risk_score_v2.ts';

export const entityStoreCommands: CommandModule = {
  register(program: Command) {
    program
      .command('entity-resolution-demo')
      .option('--mini', 'Only load the mini dataset', false)
      .option('--delete', 'Delete old data', false)
      .option('--keep-emails', 'No Email variants', false)
      .option('--space', 'space to use', 'default')
      .description('Load entity resolution demo data')
      .action(
        wrapAction(async ({ mini, deleteData, keepEmails, space }) => {
          setupEntityResolutionDemo({ mini, deleteData, keepEmails, space });
        }),
      );

    program
      .command('entity-store')
      .description('Generate entity store')
      .option('--space <space>', 'Space to create entity store in')
      .action(
        wrapAction(async (options) => {
          const entityStoreAnswers = await promptForSelection<keyof typeof ENTITY_STORE_OPTIONS>({
            message: 'Select options',
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
                seed,
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
        }),
      );

    program
      .command('quick-entity-store')
      .description('Generate quick entity store')
      .option('--space <space>', 'Space to create entity store in')
      .action(
        wrapAction(async (options) => {
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
        }),
      );

    program
      .command('clean-entity-store')
      .description('clean entity store')
      .action(wrapAction(cleanEntityStore));

    program
      .command('generate-entity-maintainers-data')
      .description(
        'Generate maintainers and snapshot data for Entity Store V2 entities (risk score, asset criticality, anomaly behaviors, relationships, watchlists)',
      )
      .option('--space <space>', 'Kibana space ID', 'default')
      .option('--quick', 'Run all maintainers for 10000 entities without prompts')
      .action(
        wrapAction(async ({ space, quick }: { space: string; quick?: boolean }) => {
          if (quick) {
            await generateEntityMaintainersData({
              count: 10000,
              maintainers: Object.values(ENTITY_MAINTAINERS_OPTIONS) as EntityMaintainerOption[],
              space,
            });
            return;
          }
          const selectedMaintainers = await promptForSelection<EntityMaintainerOption>({
            message: 'Select maintainers to generate data for',
            choices: [
              {
                name: 'Risk Score',
                value: ENTITY_MAINTAINERS_OPTIONS.riskScore,
                checked: true,
              },
              {
                name: 'Asset Criticality',
                value: ENTITY_MAINTAINERS_OPTIONS.assetCriticality,
                checked: true,
              },
              {
                name: 'Anomaly Behaviors',
                value: ENTITY_MAINTAINERS_OPTIONS.anomalyBehaviors,
                checked: true,
              },
              {
                name: 'Relationships',
                value: ENTITY_MAINTAINERS_OPTIONS.relationships,
                checked: true,
              },
              {
                name: 'Watchlist',
                value: ENTITY_MAINTAINERS_OPTIONS.watchlist,
                checked: true,
              },
              {
                name: 'Snapshot (30-day history)',
                value: ENTITY_MAINTAINERS_OPTIONS.snapshot,
                checked: true,
              },
            ],
          });

          if (selectedMaintainers.length === 0) {
            log.info('No maintainers selected. Exiting.');
            return;
          }

          const counts = await promptForNumericInputs([
            {
              key: 'entityCount',
              message: 'How many entities should be updated?',
              defaultValue: '10',
            },
          ]);

          await generateEntityMaintainersData({
            count: counts.entityCount,
            maintainers: selectedMaintainers,
            space,
          });
        }),
      );

    program
      .command('risk-score-v2')
      .description('End-to-end Entity Store V2 risk score test command')
      .option(
        '--entity-kinds <kinds>',
        'comma-separated kinds: host,idp_user,local_user,service (default: host,idp_user,local_user,service)',
      )
      .option('--users <n>', 'number of user entities (default 10)')
      .option('--hosts <n>', 'number of host entities (default 10)')
      .option('--local-users <n>', 'number of local user entities when local_user kind is enabled')
      .option('--services <n>', 'number of service entities when service kind is enabled')
      .option('--alerts-per-entity <n>', 'number of alerts per entity (default 5)')
      .option('--space <space>', 'space to use', 'default')
      .option('--event-index <index>', 'event index to ingest source documents into')
      .option('--seed-source <source>', 'entity seed source: basic|org (default basic)')
      .option(
        '--org-size <size>',
        'org size when --seed-source org: john_doe|small|medium|enterprise (default small)',
      )
      .option(
        '--org-productivity-suite <suite>',
        'productivity suite when --seed-source org: microsoft|google (default microsoft)',
      )
      .option('--offset-hours <n>', 'event timestamp offset in hours (default 1)')
      .option('--perf', 'scale preset: 1000 users, 1000 hosts, 50 alerts each', false)
      .option('--no-setup', 'skip entity store V2 setup')
      .option('--no-criticality', 'skip asset criticality assignment')
      .option('--no-watchlists', 'skip watchlist creation and assignment')
      .option('--no-alerts', 'skip alert generation')
      .option('--follow-on', 'enable interactive follow-on actions after initial summary')
      .option('--no-follow-on', 'disable interactive follow-on actions')
      .action(
        wrapAction(async (options) => {
          await riskScoreV2Command(options);
        }),
      );
  },
};
