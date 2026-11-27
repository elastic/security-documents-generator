import { API_VERSIONS, WATCHLISTS_URL } from '../../constants.ts';
import { forceBulkUpdateEntitiesViaCrud, kibanaFetch } from '../../utils/kibana_api.ts';
import { log } from '../../utils/logger.ts';
import { getEsClient } from '../utils/indices.ts';
import { STORYLINE_HOSTS } from './storyline.ts';
import { STORYLINE_PEOPLE } from './synthetic_identities.ts';

export interface StorylineContextOptions {
  readonly space: string;
  readonly namespace: string;
  readonly domain: string;
  readonly criticality: string;
  readonly installStore: boolean;
  /** Force extraction over this many hours before applying the context. */
  readonly extractHours?: number;
}

const ENTITY_TYPES = ['user', 'host', 'service', 'generic', 'ai_agent'] as const;
const DEPARTING_WATCHLIST = 'Departing Employees';
const PRIVILEGED_WATCHLIST = 'Privileged Users';
const UNSANCTIONED_WATCHLIST = 'Unsanctioned AI agents';
const AGENTS_WATCHLIST = 'Agents acting for departing employees';
const ACCOUNT_EMAIL_FIELD = 'entity.relationships.acts_on_behalf_of.raw_identifiers.user.email';

const unsanctionedWatchlistId = (space: string): string =>
  `unsanctioned-ai-agents-watchlist-id-${space}`;

const spacePath = (space: string): string => (space === 'default' ? '' : `/s/${space}`);

const emailOf = (
  { firstName, lastName }: { firstName: string; lastName: string },
  domain: string,
) => `${firstName}.${lastName}@${domain}`.toLowerCase();

interface Watchlist {
  readonly id: string;
  readonly name: string;
}

const listWatchlists = (space: string) =>
  kibanaFetch<Watchlist[] | { watchlists?: Watchlist[] }>(
    `${WATCHLISTS_URL}/list`,
    { method: 'GET' },
    { apiVersion: API_VERSIONS.public.v1, space },
  ).then((body) => (Array.isArray(body) ? body : (body.watchlists ?? [])));

const findWatchlist = async (space: string, name: string): Promise<Watchlist | undefined> =>
  (await listWatchlists(space)).find((watchlist) => watchlist.name === name);

interface EntitySource {
  readonly id: string;
  readonly type: string;
  readonly name: string;
}

/**
 * Gives the prebuilt Unsanctioned AI agents watchlist a store query for agents signed in with an
 * account outside `domain`, unless it already has a store query.
 */
const addUnsanctionedSource = async (space: string, domain: string): Promise<void> => {
  const id = unsanctionedWatchlistId(space);
  if (!(await listWatchlists(space)).some((watchlist) => watchlist.id === id)) {
    throw new Error(
      `The prebuilt ${UNSANCTIONED_WATCHLIST} watchlist (${id}) isn't installed in ${space}. This Kibana build doesn't ship it.`,
    );
  }
  const { sources } = await kibanaFetch<{ sources: EntitySource[] }>(
    `${WATCHLISTS_URL}/${id}/entity_source/list`,
    { method: 'GET' },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
  const existing = sources.find((source) => source.type === 'store');
  if (existing) {
    log.info(`${UNSANCTIONED_WATCHLIST} already has the store query "${existing.name}"`);
    return;
  }
  const name = `Accounts outside ${domain}`;
  await kibanaFetch(
    `${WATCHLISTS_URL}/${id}/entity_source`,
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'store',
        name,
        enabled: true,
        queryRule: `entity.EngineMetadata.Type: "ai_agent" and ${ACCOUNT_EMAIL_FIELD}: * and not ${ACCOUNT_EMAIL_FIELD}: *@${domain}`,
      }),
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
  log.info(`Added the store query "${name}" to ${UNSANCTIONED_WATCHLIST} (${id})`);
};

/**
 * A store-query watchlist over agent rows: agents whose person is on Departing Employees, read from
 * the `ai_agent_context` maintainer's `person_watchlists`. Its modifier raises the agents' own risk.
 */
const ensureAgentsWatchlist = async (space: string, departingId: string): Promise<void> => {
  const body = JSON.stringify({
    name: AGENTS_WATCHLIST,
    description: `AI agents that act for a person on the ${DEPARTING_WATCHLIST} watchlist.`,
    riskModifier: 1.5,
  });
  const existing = await findWatchlist(space, AGENTS_WATCHLIST);
  if (existing) {
    await kibanaFetch(
      `${WATCHLISTS_URL}/${existing.id}`,
      { method: 'PUT', body },
      { apiVersion: API_VERSIONS.public.v1, space },
    );
  }
  const agents =
    existing ??
    (await kibanaFetch<Watchlist>(
      WATCHLISTS_URL,
      { method: 'POST', body },
      { apiVersion: API_VERSIONS.public.v1, space },
    ));
  const { sources } = await kibanaFetch<{ sources: EntitySource[] }>(
    `${WATCHLISTS_URL}/${agents.id}/entity_source/list`,
    { method: 'GET' },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
  if (sources.some((source) => source.type === 'store')) {
    log.info(`${AGENTS_WATCHLIST} already has a store query`);
    return;
  }
  await kibanaFetch(
    `${WATCHLISTS_URL}/${agents.id}/entity_source`,
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'store',
        name: `Agents for ${DEPARTING_WATCHLIST} (store query)`,
        enabled: true,
        queryRule: `entity.EngineMetadata.Type: "ai_agent" and entity.attributes.ai_agent_context.person_watchlists: "${departingId}"`,
      }),
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
  log.info(`Created ${AGENTS_WATCHLIST} (${agents.id}) with its store query`);
};

const buildServerHostId = async (namespace: string): Promise<string> => {
  const result = await getEsClient().esql.query({
    query: `FROM logs-endpoint.events.process-${namespace} | WHERE host.name == "${STORYLINE_HOSTS.buildServer}" | STATS seen = MAX(@timestamp) BY host.id | SORT seen DESC | LIMIT 1`,
  });
  const row = result.values[0];
  if (!row) {
    throw new Error(
      `No ${STORYLINE_HOSTS.buildServer} events in logs-endpoint.events.process-${namespace}. Load the storyline first.`,
    );
  }
  return String(row[1]);
};

const installStore = async (space: string): Promise<void> => {
  await kibanaFetch(
    `${spacePath(space)}/api/security/entity_store/install`,
    { method: 'POST', body: JSON.stringify({ entityTypes: ENTITY_TYPES }) },
    { apiVersion: API_VERSIONS.public.v1, ignoreStatuses: [409] },
  );
  log.info(`Entity Store installed in ${space} with ${ENTITY_TYPES.join(', ')}`);
};

const extract = async (space: string, hours: number): Promise<void> => {
  const toDateISO = new Date().toISOString();
  const fromDateISO = new Date(Date.now() - hours * 3_600_000).toISOString();
  for (const entityType of ['host', 'user', 'ai_agent'] as const) {
    await kibanaFetch(
      `${spacePath(space)}/internal/security/entity_store/${entityType}/force_log_extraction`,
      {
        method: 'POST',
        body: JSON.stringify({
          fromDateISO,
          toDateISO,
          ...(entityType === 'user' && { process: 'all' }),
        }),
      },
      { apiVersion: '2' },
    );
    log.info(`Extracted ${entityType} entities in ${space} over the last ${hours} h`);
  }
};

/**
 * Applies the storyline's Kibana-side context: host criticality on the build server, a store query
 * on Unsanctioned AI agents, the privileged person on Privileged Users, the departing person on
 * Departing Employees, and a store-query watchlist for the agents acting for them. Both
 * assignments are manual, as an analyst would make them. The entity rows must exist, so load the
 * storyline and run extraction first (`--extract`).
 */
export const applyStorylineContext = async (options: StorylineContextOptions): Promise<void> => {
  const { space, namespace, domain, criticality } = options;
  if (options.installStore) {
    await installStore(space);
  }
  if (options.extractHours !== undefined) {
    await extract(space, options.extractHours);
  }

  const hostId = await buildServerHostId(namespace);
  const hostEuid = `host:${hostId}`;
  const result = await forceBulkUpdateEntitiesViaCrud({
    entities: [{ type: 'host', doc: { entity: { id: hostEuid }, asset: { criticality } } }],
    space,
  });
  if (result.errors && result.errors.length > 0) {
    throw new Error(
      `Setting criticality on ${hostEuid} failed: ${JSON.stringify(result.errors)}. Run extraction first.`,
    );
  }
  log.info(`Set asset.criticality ${criticality} on ${hostEuid} (${STORYLINE_HOSTS.buildServer})`);

  await kibanaFetch(
    `${WATCHLISTS_URL}/install`,
    { method: 'POST', body: JSON.stringify({}) },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
  await addUnsanctionedSource(space, domain);
  const privileged = await findWatchlist(space, PRIVILEGED_WATCHLIST);
  if (!privileged) {
    throw new Error(`The prebuilt ${PRIVILEGED_WATCHLIST} watchlist isn't installed in ${space}`);
  }
  const privilegedEuid = `user:${emailOf(STORYLINE_PEOPLE.privileged, domain)}@okta`;
  const assigned = await kibanaFetch<unknown>(
    `${WATCHLISTS_URL}/${privileged.id}/entities/assign`,
    { method: 'POST', body: JSON.stringify({ euids: [privilegedEuid] }) },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
  log.info(`Assigned ${privilegedEuid} to ${PRIVILEGED_WATCHLIST}: ${JSON.stringify(assigned)}`);

  const departingBody = JSON.stringify({
    name: DEPARTING_WATCHLIST,
    description: 'People who are leaving or have left the organisation.',
    riskModifier: 1.5,
  });
  const existingDeparting = await findWatchlist(space, DEPARTING_WATCHLIST);
  if (existingDeparting) {
    await kibanaFetch(
      `${WATCHLISTS_URL}/${existingDeparting.id}`,
      { method: 'PUT', body: departingBody },
      { apiVersion: API_VERSIONS.public.v1, space },
    );
  }
  const departing =
    existingDeparting ??
    (await kibanaFetch<Watchlist>(
      WATCHLISTS_URL,
      { method: 'POST', body: departingBody },
      { apiVersion: API_VERSIONS.public.v1, space },
    ));
  const departingEmail = emailOf(STORYLINE_PEOPLE.departing, domain);
  const departingEuids = [`user:${departingEmail}@okta`, `user:${departingEmail}@entra_id`];
  const assignedDeparting = await kibanaFetch<unknown>(
    `${WATCHLISTS_URL}/${departing.id}/entities/assign`,
    { method: 'POST', body: JSON.stringify({ euids: departingEuids }) },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
  log.info(
    `Assigned ${departingEuids.join(', ')} to ${DEPARTING_WATCHLIST} (${departing.id}): ${JSON.stringify(assignedDeparting)}`,
  );
  await ensureAgentsWatchlist(space, departing.id);
};
