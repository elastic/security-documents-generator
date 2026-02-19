import { initializeSpace } from './initialize_space';

export const DEFAULT_SPACE = 'default';

export const ensureSpace = async (space?: string): Promise<string> => {
  const resolvedSpace = space ?? DEFAULT_SPACE;
  if (resolvedSpace !== DEFAULT_SPACE) {
    await initializeSpace(resolvedSpace);
  }
  return resolvedSpace;
};
