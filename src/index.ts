#! /usr/bin/env node
import { program } from 'commander';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createConfigFileOnFirstRun } from './utils/create_config_on_first_run';
import { documentCommands } from './commands/documents/index';
import { riskEngineCommands } from './commands/risk_engine';
import { entityStoreCommands } from './commands/entity_store/index';
import { entityStorePerfCommands } from './commands/entity_store_perf/index';
import { rulesCommands } from './commands/rules/index';
import { privilegedUserMonitoringCommands } from './commands/privileged_user_monitoring';
import { miscCommands } from './commands/misc';
import { baselineMetricsCommands } from './commands/baseline_metrics';
import { cloudSecurityPostureCommands } from './commands/generate_cloud_security_posture';
import { anomalousBehaviorCommands } from './commands/anomalous_behavior';
import { parseIntBase10 } from './commands/utils/cli_utils';

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
  anomalousBehaviorCommands,
];

commands.forEach((cmd) => cmd.register(program));
program.parse();
