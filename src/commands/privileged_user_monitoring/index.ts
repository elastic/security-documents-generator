import { Command } from 'commander';
import { checkbox, input } from '@inquirer/prompts';
import { CommandModule } from '../types';
import {
  PRIVILEGED_USER_MONITORING_OPTIONS,
  PrivilegedUserMonitoringOption,
} from '../../constants';
import { privmonCommand } from './privileged_user_monitoring';

export const privilegedUserMonitoringCommands: CommandModule = {
  register(program: Command) {
    program
      .command('privileged-user-monitoring')
      .alias('privmon')
      .description(
        `Generate source events and anomalous source data for privileged user monitoring and the privileged access detection ML jobs.`
      )
      .option('--space <space>', 'Space to use', 'default')
      .action(async (options) => {
        const answers = await checkbox<PrivilegedUserMonitoringOption>({
          message: 'Select options',
          choices: [
            {
              name: 'Basic events',
              value: PRIVILEGED_USER_MONITORING_OPTIONS.sourceEventData,
              checked: true,
            },
            {
              name: 'Anomaly events',
              value: PRIVILEGED_USER_MONITORING_OPTIONS.anomalyData,
              checked: true,
            },
            {
              name: 'Upload CSV (skip onboarding)',
              value: PRIVILEGED_USER_MONITORING_OPTIONS.csvFile,
              checked: true,
            },
            {
              name: 'Integration data',
              value: PRIVILEGED_USER_MONITORING_OPTIONS.integrationSyncSourceEventData,
              checked: true,
            },
            {
              name: 'Enable risk engine',
              value: PRIVILEGED_USER_MONITORING_OPTIONS.riskEngineAndRule,
              checked: true,
            },
            {
              name: 'Assign asset criticality',
              value: PRIVILEGED_USER_MONITORING_OPTIONS.assetCriticality,
              checked: true,
            },
            {
              name: 'Install PAD',
              value: PRIVILEGED_USER_MONITORING_OPTIONS.installPad,
              checked: true,
            },
          ],
        });
        const userCount = Number(await input({ message: 'How many users', default: '10' }));
        await privmonCommand({
          options: answers,
          userCount,
          space: options.space,
        });
      });

    program
      .command('privmon-quick')
      .alias('privileged-user-monitoring-quick')
      .alias('quickmon')
      .option('--space <space>', 'Space to use', 'default')
      .option('--all', 'Include all options', false)
      .action(async (options) => {
        const excludeOptions: PrivilegedUserMonitoringOption[] = options.all
          ? []
          : [PRIVILEGED_USER_MONITORING_OPTIONS.installPad];
        const quickOptions = [...Object.values(PRIVILEGED_USER_MONITORING_OPTIONS)].filter(
          (opt) => !excludeOptions.includes(opt)
        );
        await privmonCommand({
          options: quickOptions,
          userCount: 100,
          space: options.space,
        });
      });
  },
};
