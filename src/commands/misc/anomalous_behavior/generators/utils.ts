export const generateCommonFields = () => {
  return {
    timestamp: new Date().toISOString(),
    result_type: 'record',
    probability: Math.random(),
    record_score: Math.random() * 100,
    initial_record_score: Math.random() * 100,
    bucket_span: 3600,
    detector_index: 0,
    is_interim: false,
  };
};

export const getRandomValues = (array: readonly string[], n: number): string[] => {
  if (array.length === 0 || n <= 0) return [];
  const copy = [...array];
  if (n >= copy.length) {
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
};
