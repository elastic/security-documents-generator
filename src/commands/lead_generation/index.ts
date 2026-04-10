import { type Command } from 'commander';
import { select } from '@inquirer/prompts';
import { type CommandModule } from '../types.ts';
import { wrapAction } from '../utils/cli_utils.ts';
import { log } from '../../utils/logger.ts';
import { kibanaFetch, enableEntityStoreV2, installEntityStoreV2 } from '../../utils/kibana_api.ts';
import { ensureSecurityDefaultDataView } from '../../utils/security_default_data_view.ts';
import {
  INFERENCE_CONNECTORS_URL,
  LEAD_GENERATION_ENABLE_URL,
  LEAD_GENERATION_GENERATE_URL,
  LEAD_GENERATION_STATUS_URL,
  LEAD_GENERATION_LIST_URL,
} from '../../constants.ts';

interface InferenceConnector {
  connectorId: string;
  name: string;
  type: string;
}

interface InferenceConnectorsResponse {
  connectors: InferenceConnector[];
}

interface Lead {
  id: string;
  title: string;
  byline: string;
  description: string;
  priority: number;
  tags: string[];
  executionUuid: string;
  entities: Array<{ type: string; name: string }>;
}

interface FindLeadsResponse {
  leads: Lead[];
  total: number;
}

interface GenerateLeadsResponse {
  executionUuid: string;
}

interface LeadGenerationStatusResponse {
  status: string;
  lastExecutionTimestamp?: string;
  runs?: number;
}

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 90_000;

const listConnectors = async (space?: string): Promise<InferenceConnector[]> => {
  const { connectors } = await kibanaFetch<InferenceConnectorsResponse>(
    INFERENCE_CONNECTORS_URL,
    { method: 'GET' },
    { space },
  );
  return connectors;
};

const enableLeadGeneration = async (space?: string): Promise<void> => {
  await kibanaFetch<{ success: boolean }>(
    LEAD_GENERATION_ENABLE_URL,
    { method: 'POST' },
    { space },
  );
};

const generateLeads = async (
  space?: string,
  connectorId?: string,
): Promise<GenerateLeadsResponse> =>
  kibanaFetch<GenerateLeadsResponse>(
    LEAD_GENERATION_GENERATE_URL,
    { method: 'POST', body: JSON.stringify({ connectorId }) },
    { space },
  );

const getStatus = async (space?: string): Promise<LeadGenerationStatusResponse> =>
  kibanaFetch<LeadGenerationStatusResponse>(
    LEAD_GENERATION_STATUS_URL,
    { method: 'GET' },
    { space },
  );

const fetchLeadsByExecutionUuid = async (
  executionUuid: string,
  space?: string,
): Promise<Lead[]> => {
  const { leads } = await kibanaFetch<FindLeadsResponse>(
    LEAD_GENERATION_LIST_URL,
    { method: 'GET' },
    { space },
  );
  return leads.filter((l) => l.executionUuid === executionUuid);
};

const pollForLeads = async (executionUuid: string, space?: string): Promise<Lead[]> => {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let dots = 0;

  while (Date.now() < deadline) {
    const leads = await fetchLeadsByExecutionUuid(executionUuid, space);
    if (leads.length > 0) return leads;

    process.stdout.write(`\rWaiting for leads${'.'.repeat((dots % 3) + 1)}   `);
    dots++;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  process.stdout.write('\n');
  return [];
};

const printLeads = (leads: Lead[]): void => {
  process.stdout.write('\n');
  log.info(`Generated ${leads.length} lead(s):\n`);
  for (const lead of leads) {
    const entities = lead.entities.map((e) => `${e.name} (${e.type})`).join(', ');
    log.info(`  [P${lead.priority}] ${lead.title}`);
    log.info(`         ${lead.byline}`);
    log.info(`         Entities: ${entities}`);
    log.info(`         Tags: ${lead.tags.join(', ')}`);
    log.info(`         ${lead.description}`);
    log.info('');
  }
};

const promptForConnector = async (
  space?: string,
): Promise<{ connectorId: string | undefined; cancelled: boolean }> => {
  const connectors = await listConnectors(space);

  if (connectors.length === 0) {
    log.warn(
      'No inference connectors configured. Generation will use rule-based synthesis (no AI).',
    );
    const confirm = await select<string>({
      message: 'Continue without an AI connector?',
      choices: [
        { name: 'Yes, use rule-based synthesis', value: 'yes' },
        { name: 'No, go back', value: 'no' },
      ],
    });
    return { connectorId: undefined, cancelled: confirm === 'no' };
  }

  const connectorId = await select<string>({
    message: `Select inference connector (${connectors.length} available):`,
    choices: connectors.map((c) => ({
      name: `${c.name} [${c.type}]`,
      value: c.connectorId,
    })),
  });

  const connectorName = connectors.find((c) => c.connectorId === connectorId)?.name;
  log.info(`Using connector: ${connectorName} (${connectorId})`);

  return { connectorId, cancelled: false };
};

export const leadGenerationCommands: CommandModule = {
  register(program: Command) {
    program
      .command('leads')
      .description('Manage AI-generated leads for Entity Analytics (interactive)')
      .option('--space <space>', 'Kibana space ID', 'default')
      .action(
        wrapAction(async ({ space }: { space: string }) => {
          while (true) {
            const action = await select<string>({
              message: 'Lead Generation — what would you like to do?',
              choices: [
                { name: 'Enable scheduled lead generation', value: 'enable' },
                { name: 'Generate leads now (ad-hoc)', value: 'generate' },
                { name: 'Get status', value: 'status' },
                { name: 'List leads', value: 'list' },
                { name: 'Exit', value: 'exit' },
              ],
            });

            if (action === 'exit') {
              break;
            } else if (action === 'enable') {
              log.info('Enabling scheduled lead generation...');
              await enableLeadGeneration(space);
              log.info('Done. The background task will run periodically.');
            } else if (action === 'generate') {
              const { connectorId, cancelled } = await promptForConnector(space);
              if (cancelled) continue;

              log.info('Ensuring prerequisites are initialised...');
              await ensureSecurityDefaultDataView(space);
              await enableEntityStoreV2(space);
              await installEntityStoreV2(space);

              log.info('Triggering ad-hoc lead generation...');
              const { executionUuid } = await generateLeads(space, connectorId);
              log.info(`Started (executionUuid=${executionUuid})`);

              const leads = await pollForLeads(executionUuid, space);
              if (leads.length > 0) {
                printLeads(leads);
              } else {
                log.warn(`No leads appeared within ${POLL_TIMEOUT_MS / 1000}s. Check Kibana logs.`);
              }
            } else if (action === 'status') {
              const status = await getStatus(space);
              log.info(JSON.stringify(status, null, 2));
            } else if (action === 'list') {
              const { leads, total } = await kibanaFetch<FindLeadsResponse>(
                LEAD_GENERATION_LIST_URL,
                { method: 'GET' },
                { space },
              );
              if (total === 0) {
                log.info('No leads found.');
              } else {
                printLeads(leads);
                log.info(`Showing ${leads.length} of ${total} lead(s).`);
              }
            }
          }
        }),
      );
  },
};
