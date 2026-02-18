import { Command } from 'commander';
import { CommandModule } from './types';
import { handleCommandError } from './utils/cli_utils';
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
      .action(async (options) => {
        try {
          const ruleCount = parseInt(options.rules);
          const eventCount = parseInt(options.events);
          const fromHours = parseInt(options.from);
          const gaps = parseInt(options.gaps);
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
        } catch (error) {
          handleCommandError(error, 'Error generating rules and events');
        }
      });

    program
      .command('delete-rules')
      .description('Delete all detection rules')
      .option('-s, --space <string>', 'Space to delete rules from')
      .action(async (options) => {
        try {
          await deleteAllRules(options.space);
        } catch (error) {
          handleCommandError(error, 'Error deleting rules');
        }
      });
  },
};
