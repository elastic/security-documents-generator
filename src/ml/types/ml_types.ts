/**
 * TypeScript definitions for ML data generation
 * Migrated from Python anomaly-data-generator
 */

export interface MLJobConfig {
  job_id: string;
  analysis_config: {
    bucket_span: string;
    detectors: MLDetector[];
    influencers?: string[];
  };
  data_description: {
    time_field: string;
  };
  description: string;
  groups: string[];
}

export interface MLDetector {
  function: MLFunction;
  field_name?: string;
  by_field_name?: string;
  over_field_name?: string;
  partition_field_name?: string;
  detector_description: string;
}

export type MLFunction = 
  | 'rare'
  | 'high_count'
  | 'high_non_zero_count'
  | 'high_distinct_count'
  | 'high_info_content'
  | 'time_of_day';

export interface MLGeneratorConfig {
  jobId: string;
  analysisField?: string;
  overField?: string;
  partitionField?: string;
  influencers?: string[];
  function: MLFunction;
  startTime: number;
  endTime: number;
  documentTemplate: Record<string, any>;
}

export interface MLDataDocument {
  '@timestamp': number;
  _index: string;
  [key: string]: any;
}

export interface GeneratorOptions {
  anomalyRate?: number;
  timeIncrement?: [number, number]; // [min, max] seconds
  burstSize?: number;
  stringLength?: [number, number]; // [min, max] length
  theme?: string;
  themedData?: {
    usernames?: string[];
    hostnames?: string[];
    processNames?: string[];
    domains?: string[];
  };
}

export interface MLJobModule {
  name: string;
  jobs: string[];
}

export const ML_SECURITY_MODULES: MLJobModule[] = [
  {
    name: 'security_auth',
    jobs: [
      'auth_rare_user',
      'auth_high_count_logon_fails',
      'auth_rare_hour_for_a_user',
      'suspicious_login_activity'
    ]
  },
  {
    name: 'security_cloudtrail',
    jobs: [
      'high_distinct_count_error_message',
      'rare_error_code',
      'cloudtrail_rare_method_for_a_city'
    ]
  },
  {
    name: 'security_linux',
    jobs: [
      'v3_linux_anomalous_user_name',
      'v3_linux_rare_sudo_user',
      'v3_linux_anomalous_network_activity',
      'v3_linux_rare_metadata_process'
    ]
  },
  {
    name: 'security_network',
    jobs: [
      'high_count_network_events',
      'rare_destination_country',
      'network_rare_process_for_user'
    ]
  },
  {
    name: 'security_packetbeat',
    jobs: [
      'packetbeat_rare_dns_question',
      'packetbeat_rare_server_domain',
      'packetbeat_rare_urls'
    ]
  },
  {
    name: 'security_windows',
    jobs: [
      'v3_windows_anomalous_process_creation',
      'v3_windows_rare_user_runas_event',
      'v3_windows_anomalous_script'
    ]
  }
];

export interface MLGenerationResult {
  jobId: string;
  indexName: string;
  documentsGenerated: number;
  anomaliesGenerated: number;
  timeRange: {
    start: number;
    end: number;
  };
  success: boolean;
  error?: string;
}

export interface MLBulkIndexOptions {
  chunkSize?: number;
  refreshPolicy?: 'true' | 'false' | 'wait_for';
  timeout?: string;
}