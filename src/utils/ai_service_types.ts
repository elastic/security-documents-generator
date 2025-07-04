import { BaseCreateAlertsReturnType } from '../create_alerts';
import { TimestampConfig } from './timestamp_utils';

export interface CacheValue {
  data: BaseCreateAlertsReturnType | Record<string, unknown>;
  timestamp: number;
}

export interface SchemaProperty {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  [key: string]: unknown;
}

export interface ParsedSchema {
  properties?: Record<string, SchemaProperty>;
  [key: string]: unknown;
}

export interface MitreTactic {
  name: string;
  description: string;
  techniques: string[];
}

export interface MitreTechnique {
  name: string;
  description: string;
  tactics: string[];
  subTechniques?: string[];
  chainNext?: string[];
}

export interface MitreSubTechnique {
  name: string;
  parent: string;
}

export interface MitreAttackData {
  tactics: Record<string, MitreTactic>;
  techniques: Record<string, MitreTechnique>;
  subTechniques?: Record<string, MitreSubTechnique>;
}

export interface AttackChain {
  techniques: Array<{
    tactic: string;
    technique: string;
    subTechnique?: string;
  }>;
  chainId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface AttackChainContext {
  campaignId: string;
  stageId: string;
  stageName: string;
  stageIndex: number;
  totalStages: number;
  threatActor: string;
  parentEvents: string[];
}

export interface GenerateAIAlertParams {
  userName?: string;
  hostName?: string;
  space?: string;
  examples?: BaseCreateAlertsReturnType[];
  alertType?: string;
  timestampConfig?: TimestampConfig;
  mitreEnabled?: boolean;
  attackChain?: AttackChainContext;
  theme?: string;
}

export interface GenerateAIAlertBatchParams {
  entities: Array<{ userName: string; hostName: string }>;
  space?: string;
  examples?: BaseCreateAlertsReturnType[];
  batchSize?: number;
  timestampConfig?: TimestampConfig;
  theme?: string;
}

export interface GenerateMITREAlertParams {
  userName?: string;
  hostName?: string;
  space?: string;
  examples?: BaseCreateAlertsReturnType[];
  timestampConfig?: TimestampConfig;
  theme?: string;
}

export interface GenerateAIEventParams {
  id_field?: string;
  id_value?: string;
}

export interface AIServiceError extends Error {
  code: string;
  details?: Record<string, unknown>;
}
