import { applyEnvFileToProcess } from '../utils/env_file.ts';
import { getEntityMaintainers, runEntityMaintainer } from '../utils/kibana_api.ts';

interface MaintainerStatusRecord {
  id?: string;
  runs?: number;
  taskStatus?: string;
  nextRunAt?: string;
  lastSuccessTimestamp?: string | null;
  lastErrorTimestamp?: string | null;
}

interface MaintainerStatusResponse {
  maintainers?: MaintainerStatusRecord[];
}

type TriggerDisposition = 'trigger_posted' | 'already_running' | 'trigger_failed';

export interface RiskScoringMaintainerSnapshot {
  runs: number | null;
  taskStatus: string;
  nextRunAt?: string;
  lastSuccessTimestamp?: string;
  lastErrorTimestamp?: string;
}

export interface TriggerRiskScoringOptions {
  envPath?: string;
  space?: string;
  maintainerId?: string;
}

export interface TriggerRiskScoringResult {
  ok: boolean;
  space: string;
  maintainerId: string;
  triggerDisposition: TriggerDisposition;
  preTrigger: RiskScoringMaintainerSnapshot;
  responseBody?: unknown;
  httpStatusCode?: number;
  message: string;
}

type KibanaResponseError = Error & {
  statusCode?: number;
  responseData?: unknown;
};

const DEFAULT_MAINTAINER_ID = 'risk-score';

const toSnapshot = (
  maintainer: MaintainerStatusRecord | undefined,
): RiskScoringMaintainerSnapshot => ({
  runs: typeof maintainer?.runs === 'number' ? maintainer.runs : null,
  taskStatus: maintainer?.taskStatus ?? 'unknown',
  nextRunAt: maintainer?.nextRunAt ?? undefined,
  lastSuccessTimestamp: maintainer?.lastSuccessTimestamp ?? undefined,
  lastErrorTimestamp: maintainer?.lastErrorTimestamp ?? undefined,
});

const toErrorText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const isAlreadyRunningError = (error: KibanaResponseError): boolean => {
  const combinedText =
    `${toErrorText(error.message)} ${toErrorText(error.responseData)}`.toLowerCase();
  return (
    combinedText.includes('currently running') ||
    combinedText.includes('already running') ||
    combinedText.includes('cannot be forced')
  );
};

const fetchMaintainerStatus = async (
  maintainerId: string,
  space: string,
): Promise<RiskScoringMaintainerSnapshot> => {
  const response = (await getEntityMaintainers(space, [maintainerId])) as MaintainerStatusResponse;
  const maintainer = response.maintainers?.find((candidate) => candidate.id === maintainerId);
  return toSnapshot(maintainer);
};

export const triggerRiskScoringMaintainer = async (
  options: TriggerRiskScoringOptions,
): Promise<TriggerRiskScoringResult> => {
  if (options.envPath) {
    applyEnvFileToProcess(options.envPath);
  }

  const space = options.space ?? 'default';
  const maintainerId = options.maintainerId ?? DEFAULT_MAINTAINER_ID;

  let preTrigger: RiskScoringMaintainerSnapshot;
  try {
    preTrigger = await fetchMaintainerStatus(maintainerId, space);
  } catch (error) {
    const responseError = error as KibanaResponseError;
    return {
      ok: false,
      space,
      maintainerId,
      triggerDisposition: 'trigger_failed',
      preTrigger: { runs: null, taskStatus: 'unknown' },
      responseBody: responseError.responseData,
      httpStatusCode: responseError.statusCode,
      message: `Failed to fetch pre-trigger maintainer status: ${toErrorText(error)}`,
    };
  }

  try {
    const responseBody = (await runEntityMaintainer(maintainerId, space)) as Record<
      string,
      unknown
    >;

    return {
      ok: true,
      space,
      maintainerId,
      triggerDisposition: 'trigger_posted',
      preTrigger,
      responseBody,
      message: `Posted non-sync trigger for maintainer "${maintainerId}".`,
    };
  } catch (error) {
    const responseError = error as KibanaResponseError;
    if (isAlreadyRunningError(responseError)) {
      return {
        ok: true,
        space,
        maintainerId,
        triggerDisposition: 'already_running',
        preTrigger,
        responseBody: responseError.responseData,
        httpStatusCode: responseError.statusCode,
        message:
          `Maintainer "${maintainerId}" was already running when the non-sync trigger was posted; ` +
          `observe the in-flight execution instead of retrying immediately.`,
      };
    }

    // Some Kibana builds collapse "task is currently running" into a generic 500 body.
    // If the maintainer was active before the trigger attempt, treat that opaque 500 as
    // an already-running response so callers can observe the in-flight execution once.
    if (responseError.statusCode === 500 && preTrigger.taskStatus === 'started') {
      return {
        ok: true,
        space,
        maintainerId,
        triggerDisposition: 'already_running',
        preTrigger,
        responseBody: responseError.responseData,
        httpStatusCode: responseError.statusCode,
        message:
          `Maintainer "${maintainerId}" returned a generic 500 while its pre-trigger status was "started"; ` +
          `treating this as an already-running execution and recommending a single observe-only wait.`,
      };
    }

    return {
      ok: false,
      space,
      maintainerId,
      triggerDisposition: 'trigger_failed',
      preTrigger,
      responseBody: responseError.responseData,
      httpStatusCode: responseError.statusCode,
      message: `Failed to post non-sync trigger for maintainer "${maintainerId}": ${toErrorText(error)}`,
    };
  }
};
