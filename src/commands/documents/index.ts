import { type Command } from 'commander';
import { type CommandModule } from '../types.ts';
import { ensureSpace } from '../../utils/index.ts';
import { parseIntBase10, parseOptionInt, wrapAction } from '../utils/cli_utils.ts';
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
      .description('Generate fake alerts')
      .action(
        wrapAction(async (options) => {
          const alertsCount = parseOptionInt(options.n, 1);
          const hostCount = parseOptionInt(options.h, 1);
          const userCount = parseOptionInt(options.u, 1);
          const space = await ensureSpace(options.s);

          await generateAlerts(alertsCount, userCount, hostCount, space);
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
