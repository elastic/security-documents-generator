import { readFileSync } from 'fs';
import path from 'path';
import { getConfig } from '../get_config';
import { MitreAttackData, AttackChain } from './ai_service_types';

// Performance and caching improvements
let mitreDataCache: MitreAttackData | null = null;
const CACHE_EXPIRY_MS = 1000 * 60 * 60; // 1 hour
let cacheTimestamp = 0;

// Load MITRE ATT&CK data with caching
export const loadMitreData = (): MitreAttackData | null => {
  const now = Date.now();

  // Return cached data if still valid
  if (mitreDataCache && now - cacheTimestamp < CACHE_EXPIRY_MS) {
    return mitreDataCache;
  }

  try {
    const filePath = path.resolve(
      process.cwd(),
      'src/mappings',
      'mitre_attack.json',
    );
    const content = readFileSync(filePath, 'utf8');
    mitreDataCache = JSON.parse(content) as MitreAttackData;
    cacheTimestamp = now;
    return mitreDataCache;
  } catch (error) {
    console.error('Failed to load MITRE ATT&CK data:', error);
    return null;
  }
};

// Generate an attack chain based on technique relationships
export const generateAttackChain = (
  mitreData: MitreAttackData,
  maxLength = 3,
): AttackChain | null => {
  const config = getConfig();
  const enabledTactics = config.mitre?.tactics || ['TA0001', 'TA0002'];

  // Start with an initial access technique
  const initialTactics = enabledTactics.filter((id) => id === 'TA0001');
  if (initialTactics.length === 0) {
    return null;
  }

  const chain: Array<{
    tactic: string;
    technique: string;
    subTechnique?: string;
  }> = [];
  const usedTechniques = new Set<string>();

  // Select initial technique
  const initialTactic = initialTactics[0];
  const availableInitialTechniques =
    mitreData.tactics[initialTactic]?.techniques || [];

  if (availableInitialTechniques.length === 0) {
    return null;
  }

  let currentTechnique =
    availableInitialTechniques[
      Math.floor(Math.random() * availableInitialTechniques.length)
    ];

  // Build the chain
  for (let i = 0; i < maxLength; i++) {
    if (usedTechniques.has(currentTechnique)) {
      break; // Avoid cycles
    }

    const techniqueData = mitreData.techniques[currentTechnique];
    if (!techniqueData) {
      break;
    }

    // Select sub-technique if enabled and available
    let subTechnique: string | undefined;
    if (
      config.mitre?.includeSubTechniques &&
      techniqueData.subTechniques &&
      techniqueData.subTechniques.length > 0
    ) {
      subTechnique =
        techniqueData.subTechniques[
          Math.floor(Math.random() * techniqueData.subTechniques.length)
        ];
    }

    // Find the tactic for this technique
    const tacticForTechnique = techniqueData.tactics[0];

    chain.push({
      tactic: tacticForTechnique,
      technique: currentTechnique,
      subTechnique,
    });

    usedTechniques.add(currentTechnique);

    // Select next technique from chainNext if available
    if (techniqueData.chainNext && techniqueData.chainNext.length > 0) {
      const nextOptions = techniqueData.chainNext.filter(
        (next) => !usedTechniques.has(next) && mitreData.techniques[next],
      );

      if (nextOptions.length > 0) {
        currentTechnique =
          nextOptions[Math.floor(Math.random() * nextOptions.length)];
      } else {
        break; // No more valid next techniques
      }
    } else {
      break; // No chain continuation
    }
  }

  // Determine severity based on chain length and techniques
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (chain.length >= 3) severity = 'high';
  else if (chain.length >= 2) severity = 'medium';

  // Check for critical techniques
  const criticalTechniques = ['T1055', 'T1078', 'T1027'];
  const hasCritical = chain.some((item) =>
    criticalTechniques.includes(item.technique),
  );
  if (hasCritical && chain.length >= 2) {
    severity = 'critical';
  }

  return {
    techniques: chain,
    chainId: `chain-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    severity,
  };
};

// Select random MITRE techniques with sub-technique support
export const selectMitreTechniques = (
  mitreData: MitreAttackData,
  maxTechniques = 2,
): Array<{ tactic: string; technique: string; subTechnique?: string }> => {
  const config = getConfig();
  const enabledTactics = config.mitre?.tactics || ['TA0001', 'TA0002'];

  const selectedTechniques: Array<{
    tactic: string;
    technique: string;
    subTechnique?: string;
  }> = [];
  const availableTactics = enabledTactics.filter(
    (tacticId) => mitreData.tactics[tacticId],
  );

  if (availableTactics.length === 0) {
    return selectedTechniques;
  }

  const numTechniques = Math.min(maxTechniques, availableTactics.length);
  const shuffledTactics = [...availableTactics].sort(() => Math.random() - 0.5);

  for (let i = 0; i < numTechniques; i++) {
    const tacticId = shuffledTactics[i];
    const tactic = mitreData.tactics[tacticId];

    if (tactic.techniques.length > 0) {
      const randomTechniqueId =
        tactic.techniques[Math.floor(Math.random() * tactic.techniques.length)];

      // Select sub-technique if enabled
      let subTechnique: string | undefined;
      if (config.mitre?.includeSubTechniques) {
        const techniqueData = mitreData.techniques[randomTechniqueId];
        if (
          techniqueData?.subTechniques &&
          techniqueData.subTechniques.length > 0
        ) {
          subTechnique =
            techniqueData.subTechniques[
              Math.floor(Math.random() * techniqueData.subTechniques.length)
            ];
        }
      }

      selectedTechniques.push({
        tactic: tacticId,
        technique: randomTechniqueId,
        subTechnique,
      });
    }
  }

  return selectedTechniques;
};

// Generate MITRE-specific alert context for AI prompts with attack chain support
export const createMitreContext = (
  selectedTechniques: Array<{
    tactic: string;
    technique: string;
    subTechnique?: string;
  }>,
  mitreData: MitreAttackData,
  attackChain?: AttackChain,
): string => {
  if (selectedTechniques.length === 0 && !attackChain) {
    return '';
  }

  let context = '\nMITRE ATT&CK Context:\n';

  if (attackChain) {
    context += `Attack Chain (${attackChain.severity} severity):\n`;
    attackChain.techniques.forEach((item, index) => {
      const tacticData = mitreData.tactics[item.tactic];
      const techniqueData = mitreData.techniques[item.technique];
      const subTechniqueData = item.subTechnique
        ? mitreData.subTechniques?.[item.subTechnique]
        : null;

      context += `${index + 1}. ${item.tactic} (${tacticData.name}) -> ${item.technique} (${techniqueData.name})`;
      if (subTechniqueData) {
        context += ` -> ${item.subTechnique} (${subTechniqueData.name})`;
      }
      context += ` - ${techniqueData.description}\n`;
    });
  } else {
    context += selectedTechniques
      .map(({ tactic, technique, subTechnique }) => {
        const tacticData = mitreData.tactics[tactic];
        const techniqueData = mitreData.techniques[technique];
        const subTechniqueData = subTechnique
          ? mitreData.subTechniques?.[subTechnique]
          : null;

        let desc = `- ${tactic} (${tacticData.name}): ${technique} (${techniqueData.name})`;
        if (subTechniqueData) {
          desc += ` -> ${subTechnique} (${subTechniqueData.name})`;
        }
        desc += ` - ${techniqueData.description}`;
        return desc;
      })
      .join('\n');
  }

  return context;
};

// Calculate risk assessment for MITRE techniques
export const calculateMitreRiskScore = (
  techniques: Array<{ technique: string }>,
  attackChain?: AttackChain,
): { severity: string; riskScore: number } => {
  if (attackChain) {
    switch (attackChain.severity) {
      case 'critical':
        return { severity: 'critical', riskScore: 90 };
      case 'high':
        return { severity: 'high', riskScore: 75 };
      case 'medium':
        return { severity: 'medium', riskScore: 55 };
      default:
        return { severity: 'low', riskScore: 35 };
    }
  }

  // Individual technique risk assessment
  const dangerousTechniques = ['T1055', 'T1078', 'T1027', 'T1134', 'T1548'];
  const techniqueIds = techniques.map((t) => t.technique);
  const hasDangerousTechnique = techniqueIds.some((id) =>
    dangerousTechniques.includes(id),
  );

  if (hasDangerousTechnique) {
    return { severity: 'high', riskScore: 75 };
  } else if (techniques.length >= 2) {
    return { severity: 'medium', riskScore: 55 };
  }

  return { severity: 'low', riskScore: 35 };
};

// Generate MITRE-specific fields for alerts
export const generateMitreFields = (
  selectedTechniques: Array<{
    tactic: string;
    technique: string;
    subTechnique?: string;
  }>,
  mitreData: MitreAttackData,
  attackChain?: AttackChain,
): Record<string, unknown> => {
  const mitreFields: Record<string, unknown> = {};

  if (selectedTechniques.length === 0) {
    return mitreFields;
  }

  const techniqueIds = selectedTechniques.map((t) => t.technique);
  const tacticIds = selectedTechniques.map((t) => t.tactic);

  // Enhanced technique fields with sub-techniques
  if (selectedTechniques.some((t) => t.subTechnique)) {
    const allTechniqueIds = selectedTechniques.map((t) =>
      t.subTechnique ? t.subTechnique : t.technique,
    );
    const allTechniqueNames = selectedTechniques.map((t) => {
      if (t.subTechnique && mitreData.subTechniques?.[t.subTechnique]) {
        return mitreData.subTechniques[t.subTechnique].name;
      }
      return mitreData.techniques[t.technique]?.name || t.technique;
    });

    mitreFields['threat.technique.id'] = allTechniqueIds;
    mitreFields['threat.technique.name'] = allTechniqueNames;
  } else {
    mitreFields['threat.technique.id'] = techniqueIds;
    mitreFields['threat.technique.name'] = techniqueIds.map(
      (id) => mitreData.techniques[id]?.name || id,
    );
  }

  mitreFields['threat.tactic.id'] = tacticIds;
  mitreFields['threat.tactic.name'] = tacticIds.map(
    (id) => mitreData.tactics[id]?.name || id,
  );

  // Attack chain specific fields
  if (attackChain) {
    mitreFields['threat.attack_chain.id'] = attackChain.chainId;
    mitreFields['threat.attack_chain.severity'] = attackChain.severity;
    mitreFields['threat.attack_chain.length'] = attackChain.techniques.length;
  }

  // Dynamic severity and risk score
  const { severity, riskScore } = calculateMitreRiskScore(
    selectedTechniques,
    attackChain,
  );
  mitreFields['kibana.alert.severity'] = severity;
  mitreFields['kibana.alert.risk_score'] = riskScore;

  return mitreFields;
};
