import { checkbox, input } from '@inquirer/prompts';
import { parseIntBase10 } from './cli_utils';

export interface NumericPrompt {
  key: string;
  message: string;
  defaultValue: string;
}

export const promptForSelection = <T extends string>(params: {
  message: string;
  choices: Array<{ name: string; value: T; checked?: boolean }>;
}): Promise<T[]> => checkbox<T>(params);

export const promptForNumericInputs = async (
  prompts: NumericPrompt[]
): Promise<Record<string, number>> => {
  const values = await Promise.all(
    prompts.map(async (prompt) => {
      const raw = await input({
        message: prompt.message,
        default: prompt.defaultValue,
      });
      return [prompt.key, parseIntBase10(raw)] as const;
    })
  );

  return Object.fromEntries(values);
};

export const promptForTextInput = (message: string, defaultValue: string): Promise<string> =>
  input({
    message,
    default: defaultValue,
  });
