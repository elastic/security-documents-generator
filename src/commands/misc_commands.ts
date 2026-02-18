import { Command } from 'commander';
import { CommandModule } from './types';
import { kibanaApi } from '../utils';
import { generateAssetCriticality } from './asset_criticality';
import { generateInsights } from './insights';
import { generateLegacyRiskScore } from './legacy_risk_score';
import { singleEntityCommand } from './single_entity';

export const miscCommands: CommandModule = {
  register(program: Command) {
    program
      .command('test-risk-score')
      .description('Test risk score API')
      .action(kibanaApi.fetchRiskScore);

    program
      .command('generate-entity-insights')
      .description('Generate entities vulnerabilities and misconfigurations')
      .action(async (options) => {
        const users = parseInt(options.u || '10');
        const hosts = parseInt(options.h || '10');
        const space = options.s || 'default';
        generateInsights({ users, hosts, space });
      });

    program
      .command('generate-asset-criticality')
      .option('-h <h>', 'number of hosts')
      .option('-u <u>', 'number of users')
      .option('-s <s>', 'space')
      .description('Generate asset criticality for entities')
      .action(async (options) => {
        const users = parseInt(options.u || '10');
        const hosts = parseInt(options.h || '10');
        const space = options.s || 'default';
        generateAssetCriticality({ users, hosts, space });
      });

    program
      .command('generate-legacy-risk-score')
      .description('Install legacy risk score and generate data')
      .action(generateLegacyRiskScore);

    program
      .command('single-entity')
      .description(
        'Create a single entity with optional risk score, asset criticality, and privileged status'
      )
      .option('--space <space>', 'Space to use', 'default')
      .action(async (options) => {
        await singleEntityCommand(options);
      });
  },
};
