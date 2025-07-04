// System prompt templates for AI generation

export interface PromptContext {
  hostName: string;
  userName: string;
  space: string;
  alertType?: string;
  mitreContext?: string;
  schemaExcerpt?: string;
  attackChain?: boolean;
  chainSeverity?: string;
  themeContext?: string;
}

// Base system prompt for alert generation
export const generateAlertSystemPrompt = (context: PromptContext): string => {
  const {
    hostName,
    userName,
    space,
    alertType = 'general',
    schemaExcerpt = '',
    themeContext = '',
  } = context;

  return `Security alert generator. Create JSON alert with realistic security data:
- host.name: "${hostName}"
- user.name: "${userName}"
- kibana.space_ids: ["${space}"]
- kibana.alert.uuid: UUID
- kibana.alert.rule.name: Descriptive security rule name (e.g., "Suspicious PowerShell Activity", "Malware Detection")
- kibana.alert.rule.description: Brief description of what triggered the alert
- kibana.version: "8.7.0"
- event.kind: "signal"
- event.category: ["malware", "network", "process", "authentication", "file"] (choose appropriate)
- event.action: specific action that occurred
- kibana.alert.status: "active"
- kibana.alert.workflow_status: "open"
- kibana.alert.depth: 1
- kibana.alert.severity: "low", "medium", "high", or "critical"
- kibana.alert.risk_score: 1-100 (matching severity)
- rule.name: Same as kibana.alert.rule.name for compatibility
IMPORTANT: Do NOT include @timestamp, kibana.alert.start, kibana.alert.last_detected, or any timestamp fields. These will be handled separately.
${alertType !== 'general' ? `This is a ${alertType} type alert.` : ''}
${themeContext}
${schemaExcerpt ? `Schema excerpt: ${schemaExcerpt}` : ''}`;
};

// MITRE-specific system prompt
export const generateMitreAlertSystemPrompt = (
  context: PromptContext,
): string => {
  const {
    hostName,
    userName,
    space,
    mitreContext = '',
    schemaExcerpt = '',
    attackChain = false,
    chainSeverity = 'medium',
    themeContext = '',
  } = context;

  return `Security alert generator with advanced MITRE ATT&CK framework integration. Create JSON alert with realistic security data:
- host.name: "${hostName}"
- user.name: "${userName}"
- kibana.space_ids: ["${space}"]
- kibana.alert.uuid: UUID
- kibana.alert.rule.name: MITRE-based security rule name (e.g., "MITRE T1566.001 Spearphishing Detection")
- kibana.alert.rule.description: Description including MITRE technique details
- kibana.version: "8.7.0"
- event.kind: "signal"
- event.category: ["malware", "network", "process", "authentication", "file"] (choose based on MITRE technique)
- event.action: specific action related to MITRE technique
- kibana.alert.status: "active"
- kibana.alert.workflow_status: "open"
- kibana.alert.depth: 1
- kibana.alert.severity: "low", "medium", "high", or "critical"
- kibana.alert.risk_score: 1-100 (higher for advanced techniques)
- rule.name: Same as kibana.alert.rule.name for compatibility
CRITICAL: Use only dates from the past 30 days. NO future dates. NO 2023 or older dates.

MITRE ATT&CK fields:
- threat.technique.id: technique ID(s)
- threat.technique.name: technique name(s)
- threat.tactic.id: tactic ID(s)
- threat.tactic.name: tactic name(s)
${attackChain ? `- threat.attack_chain.id: unique chain identifier` : ''}
${attackChain ? `- threat.attack_chain.severity: "${chainSeverity}"` : ''}

${mitreContext}

${
  attackChain
    ? `Generate a realistic multi-stage attack alert following the attack chain progression. Show evidence of each stage in the chain. Adjust severity to "${chainSeverity}".`
    : 'Generate a realistic security alert based on the specified MITRE techniques.'
}

Include relevant technical fields: process, file, network, registry, user activity based on techniques.
${themeContext}
${schemaExcerpt ? `Schema excerpt: ${schemaExcerpt}` : ''}`
};

// Event generation system prompt
export const generateEventSystemPrompt = (context: {
  idField?: string;
  idValue?: string;
  schemaExcerpt?: string;
}): string => {
  const { idField, idValue, schemaExcerpt = '' } = context;

  return `Security event generator. Create JSON with realistic security event data:
- criticality: one of ["low_impact", "medium_impact", "high_impact", "extreme_impact"]
${idField ? `- ${idField}: "${idValue}"` : ''}
IMPORTANT: Do NOT include @timestamp or any timestamp fields. These will be handled separately.
${schemaExcerpt ? `Schema: ${schemaExcerpt}` : ''}`;
};

// Batch alert generation system prompt
export const generateBatchAlertSystemPrompt = (context: {
  batchSize: number;
  space: string;
  schemaExcerpt?: string;
}): string => {
  const { batchSize, space, schemaExcerpt = '' } = context;

  return `Security alert generator. Create ${batchSize} separate JSON alerts, each with these required fields:
- host.name: (provided per entity)
- user.name: (provided per entity)
- kibana.space_ids: ["${space}"]
- kibana.alert.uuid: unique UUID for each
- kibana.version: "8.7.0"
- event.kind: "signal"
- kibana.alert.status: "active"
- kibana.alert.workflow_status: "open"
- kibana.alert.depth: 1
- kibana.alert.severity: "low"
- kibana.alert.risk_score: 21
Return array of ${batchSize} complete alert objects.
${schemaExcerpt ? `Schema excerpt: ${schemaExcerpt}` : ''}`;
};

// User prompts for different scenarios
export const generateAlertUserPrompt = (context: {
  hostName: string;
  userName: string;
  examples?: string;
}): string => {
  const { hostName, userName, examples = '' } = context;

  return `Generate a realistic security alert for host "${hostName}" and user "${userName}".${
    examples ? ` Reference examples: ${examples}` : ''
  }`;
};

export const generateMitreAlertUserPrompt = (context: {
  hostName: string;
  userName: string;
  attackChain?: boolean;
}): string => {
  const { hostName, userName, attackChain = false } = context;

  return `Generate a realistic security alert for host "${hostName}" and user "${userName}" based on the MITRE ATT&CK ${
    attackChain ? 'attack chain' : 'techniques'
  } provided.`;
};

export const generateEventUserPrompt = (): string => {
  return 'Generate a realistic security event document.';
};

export const generateBatchAlertUserPrompt = (context: {
  batchSize: number;
  entities: Array<{ userName: string; hostName: string }>;
  examples?: string;
}): string => {
  const { batchSize, entities, examples = '' } = context;

  return `Generate exactly ${batchSize} realistic security alerts for these entities: ${JSON.stringify(
    entities,
  )}.

IMPORTANT: Return a JSON array with exactly ${batchSize} alert objects. Each alert should be a complete JSON object with Kibana/ECS fields.

Format: [{"host.name": "...", "user.name": "...", "kibana.alert.rule.name": "...", ...}, {...}, ...]

${examples ? `Reference examples: ${examples}` : ''}`;
};

// Response format instructions
export const JSON_RESPONSE_INSTRUCTION = 'Respond with valid JSON only.';

// Common validation rules
export const TIMESTAMP_VALIDATION_RULE =
  'CRITICAL: Use only dates from the past 30 days. NO future dates. NO 2023 or older dates.';

// Schema field priorities for different alert types
export const ESSENTIAL_ALERT_FIELDS = [
  'host',
  'user',
  'event',
  'kibana',
  'agent',
  'source',
  'destination',
  'network',
  'process',
  'file',
  'alert',
  '@timestamp',
];

// Generate context-aware field priorities
export const getFieldPrioritiesForAlertType = (alertType: string): string[] => {
  const baseFields = [...ESSENTIAL_ALERT_FIELDS];

  switch (alertType) {
    case 'network':
      return ['network', 'source', 'destination', ...baseFields];
    case 'process':
      return ['process', 'file', ...baseFields];
    case 'authentication':
      return ['user', 'event', ...baseFields];
    case 'malware':
      return ['file', 'process', 'event', ...baseFields];
    default:
      return baseFields;
  }
};
