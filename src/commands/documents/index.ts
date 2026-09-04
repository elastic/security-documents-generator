import { type Command } from 'commander';
import { type CommandModule } from '../types.ts';
import { ensureSpace } from '../../utils/index.ts';
import { parseDuration, parseIntBase10, parseOptionInt, wrapAction } from '../utils/cli_utils.ts';
import {
  deleteAllAlerts,
  deleteAllEvents,
  generateAlerts,
  generateEvents,
  generateGraph,
} from './documents.ts';

export {
  deleteAllAlerts,
  deleteAllEvents,
  generateAlerts,
  generateEvents,
  generateGraph,
} from './documents.ts';

export const documentCommands: CommandModule = {
  register(program: Command) {
    program
      .command('generate-alerts')
      .option('-n <n>', 'number of alerts')
      .option('-h <h>', 'number of hosts')
      .option('-u <h>', 'number of users')
      .option('-s <h>', 'space (will be created if it does not exist)')
      .option(
        '--time-spread <duration>',
        'Spread alert @timestamp values randomly over the given duration ending at now (e.g., 7d, 12h, 30m). Without it, every alert lands at the moment of generation',
      )
      .description('Generate fake alerts')
      .action(
        wrapAction(async (options) => {
          const alertsCount = parseOptionInt(options.n, 1);
          const hostCount = parseOptionInt(options.h, 1);
          const userCount = parseOptionInt(options.u, 1);
          const timeSpreadMs =
            options.timeSpread !== undefined
              ? parseDuration(options.timeSpread as string)
              : undefined;
          const space = await ensureSpace(options.s);

          await generateAlerts(alertsCount, hostCount, userCount, space, timeSpreadMs);
        }),
      );

    program
      .command('generate-events')
      .argument('<n>', 'integer argument', parseIntBase10)
      .description('Generate events')
      .action(wrapAction(generateEvents));

    program.command('generate-graph').description('Generate fake graph').action(generateGraph);

    program
      .command('delete-alerts')
      .description('Delete all alerts')
      .action(wrapAction(deleteAllAlerts));

    program
      .command('delete-events')
      .description('Delete all events')
      .action(wrapAction(deleteAllEvents));
  },
};
