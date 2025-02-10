import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

import js from '@eslint/js';
import globals from 'globals';
export default [
  {
    languageOptions: {
      parser: tsparser,
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      ...eslintPluginPrettierRecommended.plugins,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs['eslint-recommended'].rules,
      ...tseslint.configs.recommended.rules,
      ...eslintPluginPrettierRecommended.rules,
      'prettier/prettier': ['error', { singleQuote: true }]
    },
    files: ['src/**/*.ts'],
  },
];
