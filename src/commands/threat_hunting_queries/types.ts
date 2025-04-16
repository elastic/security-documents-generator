export interface GeneratorDoc {
  index: string;
  source: object;
}

export interface TimeWindow {
  minTimestamp: string;
  maxTimestamp: string;
}

interface GeneratorOptions {
  timeWindow: TimeWindow;
}

export type GeneratorFn = (
  options: GeneratorOptions,
) => Promise<GeneratorDoc[]>;

export interface GeneratorEntry {
  id: string;
  generate: GeneratorFn;
}
