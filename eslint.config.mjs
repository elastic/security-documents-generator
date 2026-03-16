import tseslint from 'typescript-eslint';
import checkFile from 'eslint-plugin-check-file';
import eslintConfigPrettier from 'eslint-config-prettier';

import js from '@eslint/js';
import globals from 'globals';

export default tseslint.config(
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'check-file': checkFile,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'check-file/filename-naming-convention': [
        'error',
        {
          '**/*.ts': 'SNAKE_CASE',
        },
      ],
    },
    files: ['src/**/*.ts'],
  },
  eslintConfigPrettier,
);
