import { type Command } from 'commander';
import { type CommandModule } from '../types.ts';
import { wrapAction } from '../utils/cli_utils.ts';
import { execBriefScenarioCommand } from './run.ts';
import type { AdMode } from './extras.ts';

const AD_MODES: AdMode[] = ['dev-route', 'bulk', 'none'];

export const execBriefCommands: CommandModule = {
  register(program: Command) {
    program
      .command('exec-brief-scenario')
      .description(
        'Seed the Executive Brief demo: three storylines (S1 planted, S2 handled, S3 no-AD), noise, blind-spot triggers and a ground-truth JSON',
      )
      .option('--space <space>', 'space to seed', 'default')
      .option('--clean', 'remove previously seeded scenario data first', false)
      .option('--connector <id>', 'ignored: no LLM is used (leads are seeded as documents)')
      .option('--no-ml', 'skip ML jobs and anomaly data (blind spot B12)')
      .option('--ad-mode <mode>', `attack discovery mode: ${AD_MODES.join('|')}`, 'dev-route')
      .option('--anchor <iso>', 'ISO timestamp used as "now" for the scenario (default: now)')
      .option(
        '--out <dir>',
        'directory for ground_truth.json and verification.txt',
        './exec-brief-output',
      )
      .option('--no-verify', 'skip the verification checklist')
      .action(
        wrapAction(async (options) => {
          const adMode = options.adMode as AdMode;
          if (!AD_MODES.includes(adMode)) {
            throw new Error(`Invalid --ad-mode "${options.adMode}". Use ${AD_MODES.join('|')}`);
          }
          await execBriefScenarioCommand({
            space: options.space,
            clean: Boolean(options.clean),
            ml: options.ml !== false,
            adMode,
            anchor: options.anchor,
            connector: options.connector,
            out: options.out,
            verify: options.verify !== false,
          });
        }),
      );
  },
};
