import { Command } from 'commander';
import { CommandModule } from '../types';
import { initializeSpace } from '../../utils';
import {
  deleteAllAlerts,
  deleteAllEvents,
  generateAlerts,
  generateEvents,
  generateGraph,
} from './documents';

export {
  deleteAllAlerts,
  deleteAllEvents,
  generateAlerts,
  generateEvents,
  generateGraph,
} from './documents';

export const documentCommands: CommandModule = {
  register(program: Command) {
    program
      .command('generate-alerts')
      .option('-n <n>', 'number of alerts')
      .option('-h <h>', 'number of hosts')
      .option('-u <h>', 'number of users')
      .option('-s <h>', 'space (will be created if it does not exist)')
      .description('Generate fake alerts')
      .action(async (options) => {
        const alertsCount = parseInt(options.n || '1');
        const hostCount = parseInt(options.h || '1');
        const userCount = parseInt(options.u || '1');
        const space = options.s || 'default';

        if (space !== 'default') {
          await initializeSpace(space);
        }

        await generateAlerts(alertsCount, userCount, hostCount, space);
      });

    program
      .command('generate-events')
      .argument('<n>', 'integer argument', (v) => parseInt(v, 10))
      .description('Generate events')
      .action(generateEvents);

    program.command('generate-graph').description('Generate fake graph').action(generateGraph);

    program.command('delete-alerts').description('Delete all alerts').action(deleteAllAlerts);

    program.command('delete-events').description('Delete all events').action(deleteAllEvents);
  },
};
