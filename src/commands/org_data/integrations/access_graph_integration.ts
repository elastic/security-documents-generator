/**
 * Access Graph Edges
 *
 * Writes the organization's access graph as one document per edge into a plain index,
 * `security-entity-edges`. This is the "edge document" shape a bounded graph traversal
 * (for example ES|QL `GRAPH EXPAND ... ON node_id == source.id TO target.id`) walks best,
 * and it is independent of whether the entity store has learned the IAM relationship
 * kinds yet. There is no Fleet package; install() creates the index with an explicit
 * mapping instead.
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
} from './base_integration.ts';
import { type Organization, type CorrelationMap, type AccessEdge } from '../types.ts';
import { buildAccessEdges } from '../access_graph_generator.ts';
import { getEsClient } from '../../utils/indices.ts';
import { log } from '../../../utils/logger.ts';

export const ACCESS_GRAPH_EDGES_INDEX = 'security-entity-edges';

const NODE_MAPPING = {
  properties: {
    id: { type: 'keyword' },
    type: { type: 'keyword' },
    sub_type: { type: 'keyword' },
    name: { type: 'keyword' },
    alt_ids: { type: 'keyword' },
  },
} as const;

const EDGES_MAPPING = {
  dynamic: false,
  properties: {
    '@timestamp': { type: 'date' },
    relation: { type: 'keyword' },
    source: NODE_MAPPING,
    target: NODE_MAPPING,
    evidence: {
      properties: {
        kind: { type: 'keyword' },
        source: { type: 'keyword' },
        description: { type: 'keyword', ignore_above: 1024 },
      },
    },
    scenario: {
      properties: {
        id: { type: 'keyword' },
        name: { type: 'keyword' },
        hop: { type: 'integer' },
      },
    },
    cloud: {
      properties: {
        provider: { type: 'keyword' },
        account: { properties: { id: { type: 'keyword' }, name: { type: 'keyword' } } },
      },
    },
    event: {
      properties: {
        kind: { type: 'keyword' },
        category: { type: 'keyword' },
        type: { type: 'keyword' },
        action: { type: 'keyword' },
        dataset: { type: 'keyword' },
      },
    },
    organization: { properties: { name: { type: 'keyword' } } },
    tags: { type: 'keyword' },
  },
} as const;

/**
 * Access Graph Edges Integration
 */
export class AccessGraphIntegration extends BaseIntegration {
  readonly packageName = 'access_graph';
  readonly displayName = 'Access Graph Edges';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'edges',
      index: ACCESS_GRAPH_EDGES_INDEX,
    },
  ];

  /** No ingest pipeline: the documents are written in their final shape. */
  readonly ingestPipeline = '_none';

  /**
   * There is no Fleet package. Recreate the edge index with its mapping so a rerun
   * replaces the previous graph instead of appending to it.
   */
  async install(): Promise<void> {
    const client = getEsClient();
    const exists = await client.indices.exists({ index: ACCESS_GRAPH_EDGES_INDEX });
    if (exists) {
      log.info(`  Deleting existing ${ACCESS_GRAPH_EDGES_INDEX} index`);
      await client.indices.delete({ index: ACCESS_GRAPH_EDGES_INDEX });
    }
    await client.indices.create({ index: ACCESS_GRAPH_EDGES_INDEX, mappings: EDGES_MAPPING });
    log.info(`  ✓ ${ACCESS_GRAPH_EDGES_INDEX} index created`);
  }

  /**
   * Generate one document per access-graph edge
   */
  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const timestamp = this.getTimestamp();
    const accountsById = new Map(org.cloudAccounts.map((a) => [a.id, a]));

    // Edges on a planted access path carry the scenario and their position in it.
    const scenarioByEdgeKey = new Map<string, { id: string; name: string; hop: number }>();
    for (const path of org.accessPaths) {
      path.hops.forEach((hop, index) => {
        scenarioByEdgeKey.set(edgeKey(hop), { id: path.id, name: path.name, hop: index + 1 });
      });
    }

    const documents = buildAccessEdges(org).map((edge): IntegrationDocument => {
      const account = edge.accountId ? accountsById.get(edge.accountId) : undefined;
      const scenario = scenarioByEdgeKey.get(edgeKey(edge));
      return {
        '@timestamp': timestamp,
        agent: this.buildCentralAgent(org),
        event: {
          kind: 'state',
          category: ['iam'],
          type: ['info'],
          action: edge.relation,
          dataset: 'security.entity_edges',
        },
        relation: edge.relation,
        source: toNodeDoc(edge.source),
        target: toNodeDoc(edge.target),
        evidence: edge.evidence,
        ...(account && {
          cloud: { provider: 'aws', account: { id: account.id, name: account.name } },
        }),
        ...(scenario && { scenario }),
        organization: { name: org.name },
        tags: ['access_graph', `relation:${edge.relation}`, ...(scenario ? ['scenario'] : [])],
      };
    });

    documentsMap.set(ACCESS_GRAPH_EDGES_INDEX, documents);
    return documentsMap;
  }
}

const edgeKey = (edge: AccessEdge): string =>
  `${edge.relation}|${edge.source.id}|${edge.target.id}`;

const toNodeDoc = (node: AccessEdge['source']): Record<string, unknown> => ({
  id: node.id,
  type: node.type,
  sub_type: node.subType,
  name: node.name,
  ...(node.altIds && node.altIds.length > 0 && { alt_ids: node.altIds }),
});
