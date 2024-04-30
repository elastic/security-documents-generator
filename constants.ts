export const ENTITY_STORE_OPTIONS = {
  seed: "seed",
  criticality: "criticality",
  riskEngine: "riskEngine",
  rule: "rule",
  agent: "agent",
};

export const generateNewSeed = () => {
  return Math.round(Math.random() * 100000);
}