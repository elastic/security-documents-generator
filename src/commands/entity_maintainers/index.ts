import { Command } from 'commander';
import { CommandModule } from '../types';
import { wrapAction } from '../utils/cli_utils';
import { ENTITY_MAINTAINERS_OPTIONS, type EntityMaintainerOption } from '../../constants';
import { promptForSelection, promptForNumericInputs } from '../utils/interactive_prompts';
import { generateEntityMaintainersData } from './entity_maintainers';

export const entityMaintainersCommands: CommandModule = {
  register(program: Command) {
    program
      .command('generate-entity-maintainers-data')
      .description(
        'Generate maintainers data for Entity Store V2 Identity entities (risk score, asset criticality, anomaly behaviors, relationships, watchlists)'
      )
      .action(
        wrapAction(async () => {
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
            ],
          });

          if (selectedMaintainers.length === 0) {
            console.log('No maintainers selected. Exiting.');
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
          });
        })
      );
  },
};
