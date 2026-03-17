import { type Command } from 'commander';
import { type CommandModule } from '../types.ts';
import { parseIntBase10, wrapAction } from '../utils/cli_utils.ts';
import { log } from '../../utils/logger.ts';
import { deleteAllRules, generateRulesAndAlerts } from './rules.ts';

export const rulesCommands: CommandModule = {
  register(program: Command) {
    program
      .command('rules')
      .description('Generate detection rules and events')
      .option('-r, --rules <number>', 'Number of rules to generate', '10')
      .option('-e, --events <number>', 'Number of events to generate', '50')
      .option('-i, --interval <string>', 'Rule execution interval', '5m')
      .option('-f, --from <number>', 'Generate events from last N hours', '24')
      .option('-g, --gaps <number>', 'Amount of gaps per rule', '0')
      .option('-c, --clean', 'Clean gap events before generating rules', 'false')
      .action(
        wrapAction(async (options) => {
          const ruleCount = parseIntBase10(options.rules);
          const eventCount = parseIntBase10(options.events);
          const fromHours = parseIntBase10(options.from);
          const gaps = parseIntBase10(options.gaps);
          log.info(`Generating ${ruleCount} rules and ${eventCount} events...`);
          log.info(`Using interval: ${options.interval}`);
          log.info(`Generating events from last ${fromHours} hours`);
          log.info(`Generating ${gaps} gaps per rule`);
          if (options.clean) {
            await deleteAllRules();
          }
          await generateRulesAndAlerts(ruleCount, eventCount, {
            interval: options.interval,
            from: fromHours,
            gapsPerRule: gaps,
          });
          log.info('Successfully generated rules and events');
        }),
      );

    program
      .command('delete-rules')
      .description('Delete all detection rules')
      .option('-s, --space <string>', 'Space to delete rules from')
      .action(
        wrapAction(async (options) => {
          await deleteAllRules(options.space);
        }),
      );
  },
};
