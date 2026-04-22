import { INFERENCE_CONNECTORS_URL, LEAD_GENERATION_GENERATE_URL } from '../constants.ts';
import { kibanaFetch } from '../utils/kibana_api.ts';
import { applyEnvFileToProcess } from '../utils/env_file.ts';

export interface InferenceConnector {
  connectorId: string;
  name: string;
  type?: string;
}

interface InferenceConnectorsResponse {
  connectors?: InferenceConnector[];
}

interface GenerateLeadsResponse {
  executionUuid: string;
}

export interface TriggerLeadGenerationOptions {
  envPath?: string;
  space?: string;
  connectorId: string;
}

export interface TriggerLeadGenerationResult {
  executionUuid: string;
  requestedConnectorId: string;
  matchedConnectorId: string;
  matchedConnectorName: string;
}

export const normalizeConnectorToken = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[_.]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s([0-9]+)\s([0-9]+)/g, ' $1.$2')
    .trim();

export const listInferenceConnectors = async (space?: string): Promise<InferenceConnector[]> => {
  const response = await kibanaFetch<InferenceConnectorsResponse>(
    INFERENCE_CONNECTORS_URL,
    { method: 'GET' },
    { space },
  );
  return response.connectors ?? [];
};

export const resolveLeadGenerationConnector = async (
  requestedConnectorId: string,
  space?: string,
): Promise<InferenceConnector> => {
  const connectors = await listInferenceConnectors(space);
  const requested = normalizeConnectorToken(requestedConnectorId);
  const match = connectors.find((connector) => {
    const idMatches = connector.connectorId === requestedConnectorId;
    const normalizedIdMatches = normalizeConnectorToken(connector.connectorId) === requested;
    const normalizedNameMatches = normalizeConnectorToken(connector.name) === requested;
    return idMatches || normalizedIdMatches || normalizedNameMatches;
  });

  if (!match) {
    throw new Error(`Configured connector ${requestedConnectorId} is not discoverable`);
  }

  return match;
};

export const triggerLeadGeneration = async (
  options: TriggerLeadGenerationOptions,
): Promise<TriggerLeadGenerationResult> => {
  if (options.envPath) {
    applyEnvFileToProcess(options.envPath);
  }

  const space = options.space ?? 'default';
  const connector = await resolveLeadGenerationConnector(options.connectorId, space);
  const response = await kibanaFetch<GenerateLeadsResponse>(
    LEAD_GENERATION_GENERATE_URL,
    {
      method: 'POST',
      // Intentionally send the requested token so validation semantics stay explicit.
      body: JSON.stringify({ connectorId: options.connectorId }),
    },
    { space },
  );

  return {
    executionUuid: response.executionUuid,
    requestedConnectorId: options.connectorId,
    matchedConnectorId: connector.connectorId,
    matchedConnectorName: connector.name,
  };
};
