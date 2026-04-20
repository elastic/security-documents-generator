#! /usr/bin/env node
import { program } from 'commander';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createConfigFileOnFirstRun } from './utils/create_config_on_first_run.ts';
import { documentCommands } from './commands/documents/index.ts';
import { riskEngineCommands } from './commands/risk_engine/index.ts';
import { entityStoreCommands } from './commands/entity_store/index.ts';
import { entityStorePerfCommands } from './commands/entity_store_perf/index.ts';
import { rulesCommands } from './commands/rules/index.ts';
import { privilegedUserMonitoringCommands } from './commands/privileged_user_monitoring/index.ts';
import { miscCommands } from './commands/misc/index.ts';
import { baselineMetricsCommands } from './commands/baseline_metrics/index.ts';
import { cloudSecurityPostureCommands } from './commands/generate_cloud_security_posture/index.ts';
import { orgDataCommands } from './commands/org_data/index.ts';
import { leadGenerationCommands } from './commands/lead_generation/index.ts';
import { watchlistCommands } from './commands/watchlist/index.ts';
import { parseIntBase10 } from './commands/utils/cli_utils.ts';

await createConfigFileOnFirstRun();

export const srcDirectory = dirname(fileURLToPath(import.meta.url));
export { parseIntBase10 };

const commands = [
  documentCommands,
  riskEngineCommands,
  entityStoreCommands,
  entityStorePerfCommands,
  rulesCommands,
  privilegedUserMonitoringCommands,
  miscCommands,
  baselineMetricsCommands,
  cloudSecurityPostureCommands,
  orgDataCommands,
  leadGenerationCommands,
  watchlistCommands,
];

commands.forEach((cmd) => cmd.register(program));
program.parse();
