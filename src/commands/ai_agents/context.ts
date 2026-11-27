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
 * Applies the storyline's Kibana-side context: host criticality on the build server, the privileged
 * person on Privileged Users, and the departing person on Departing Employees. Both assignments are
 * manual, as an analyst would make them. The entity
 * rows must exist, so load the storyline and run extraction first (`--extract`).
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
};
