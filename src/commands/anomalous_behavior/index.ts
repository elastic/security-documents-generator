import { Command } from 'commander';
import { CommandModule } from '../types';
import { parseOptionInt, wrapAction } from '../utils/cli_utils';
import { generateAnomalousBehaviorDataWithMlJobs } from './generate_anomalous_behavior_data';
import { ensureSpace } from '../../utils';

export const anomalousBehaviorCommands: CommandModule = {
  register(program: Command) {
    program
      .command('generate-anomalous-behavior')
      .option('--space <space>', 'Space to use', 'default')
      .option('-n <n>', 'number of records per job id (default 10)')
      .option(
        '--modules-only',
        'create ML modules without starting datafeeds or generating anomaly records'
      )
      .description(
        'Generate and index ML anomaly records that indicate the presence of anomalous behavior, such as lateral movement, data exfiltration, unusual access.'
      )
      .action(
        wrapAction(async (options) => {
          const space = await ensureSpace(options.space);
          const recordCount = parseOptionInt(options.n, 10);
          const modulesOnly = options.modulesOnly || false;
          await generateAnomalousBehaviorDataWithMlJobs(space, recordCount, modulesOnly);
        })
      );
  },
};
