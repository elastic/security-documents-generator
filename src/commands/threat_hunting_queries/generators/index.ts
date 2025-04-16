import { oktaGenerators } from './okta';
import { windowsGenerators } from './windows';
import { GeneratorEntry } from '../types';

export const generators: GeneratorEntry[] = [
  ...oktaGenerators,
  ...windowsGenerators,
] as const;
