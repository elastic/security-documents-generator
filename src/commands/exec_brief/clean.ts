import { getEsClient } from '../utils/indices.ts';
import { log } from '../../utils/logger.ts';
import { getEntityStoreIndex } from '../../constants.ts';
import { getAlertIndex } from '../../utils/get_alert_index.ts';
import {
  HOSTS,
  SERVICES,
  USERS,
  buildLogons,
  hostByKey,
  hostEuid,
  idpUserEuid,
  localUserEuid,
  serviceEuid,
  userByKey,
} from './scenario.ts';
import { AD_CONNECTOR_NAME, deleteScenarioCases } from './extras.ts';
import { SCENARIO_TAG, getStatusCode } from './utils.ts';

type Query = Record<string, unknown>;

/** Every entity id the scenario can create (hosts, IdP users, host-scoped aliases, services). */
export const scenarioEntityIds = (): string[] => {
  const ids = new Set<string>();
  HOSTS.forEach((host) => ids.add(hostEuid(host)));
  USERS.forEach((user) => ids.add(idpUserEuid(user)));
  SERVICES.forEach((service) => ids.add(serviceEuid(service)));
  for (const logon of buildLogons()) {
    ids.add(localUserEuid(userByKey(logon.userKey), hostByKey(logon.hostKey)));
  }
  return [...ids];
};

const deleteByQuery = async (index: string, query: Query, label: string): Promise<void> => {
  const client = getEsClient();
  try {
    const response = await client.deleteByQuery({
      index,
      refresh: true,
      conflicts: 'proceed',
      ignore_unavailable: true,
      query,
    });
    log.info(`Clean: deleted ${response.deleted ?? 0} ${label} doc(s) from ${index}`);
  } catch (error) {
    if (getStatusCode(error) === 404) return;
    log.warn(`Clean: ${label} (${index}) failed: ${String(error).slice(0, 200)}`);
  }
};

export const cleanScenario = async (space: string): Promise<void> => {
  const entityIds = scenarioEntityIds();
  const hostNames = HOSTS.map((h) => h.name);

  await deleteByQuery(
    getAlertIndex(space),
    { term: { 'kibana.alert.rule.tags': SCENARIO_TAG } },
    'scenario alert',
  );
  await deleteByQuery(
    `logs-system.security-${space},logs-system.auth-${space},logs-okta.system-${space},logs-exec_brief.events-${space}`,
    { term: { tags: SCENARIO_TAG } },
    'source event',
  );
  await deleteByQuery(getEntityStoreIndex(space), { terms: { 'entity.id': entityIds } }, 'entity');
  await deleteByQuery(
    `entities-metadata-${space}`,
    { terms: { 'entity.id': entityIds } },
    'relationship metadata',
  );
  await deleteByQuery(
    `.entities.v2.history.${space}.*`,
    { terms: { 'entity.id': entityIds } },
    'entity history',
  );
  await deleteByQuery(
    `risk-score.risk-score-${space}`,
    {
      bool: {
        minimum_should_match: 1,
        should: ['host', 'user', 'service'].map((type) => ({
          terms: { [`${type}.risk.id_value`]: entityIds },
        })),
      },
    },
    'risk score',
  );
  await deleteByQuery(
    `.entity_analytics.risk_score.lookup-${space}`,
    { match_all: {} },
    'risk lookup',
  );
  await deleteByQuery(
    `.entity_analytics.entity-leads.entity-${space}`,
    { terms: { 'entity.id': entityIds } },
    'lead',
  );
  await deleteByQuery(
    `.alerts-security.attack.discovery.alerts-${space},.adhoc.alerts-security.attack.discovery.alerts-${space}`,
    { term: { 'kibana.alert.attack_discovery.api_config.name': AD_CONNECTOR_NAME } },
    'attack discovery',
  );
  await deleteByQuery(
    'logs-cloud_security_posture.vulnerabilities_latest-default',
    { terms: { 'host.name': hostNames } },
    'vulnerability',
  );
  await deleteScenarioCases(space);
};
