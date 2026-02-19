import { Command } from 'commander';
import { CommandModule } from './types';
import { parseIntBase10, wrapAction } from './utils/cli_utils';
import { deleteAllRules, generateRulesAndAlerts } from './rules';

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
          console.log(`Generating ${ruleCount} rules and ${eventCount} events...`);
          console.log(`Using interval: ${options.interval}`);
          console.log(`Generating events from last ${fromHours} hours`);
          console.log(`Generating ${gaps} gaps per rule`);
          if (options.clean) {
            await deleteAllRules();
          }
          await generateRulesAndAlerts(ruleCount, eventCount, {
            interval: options.interval,
            from: fromHours,
            gapsPerRule: gaps,
          });
          console.log('Successfully generated rules and events');
        })
      );

    program
      .command('delete-rules')
      .description('Delete all detection rules')
      .option('-s, --space <string>', 'Space to delete rules from')
      .action(
        wrapAction(async (options) => {
          await deleteAllRules(options.space);
        })
      );
  },
};
