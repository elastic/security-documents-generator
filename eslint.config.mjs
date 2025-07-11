import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import checkFile from 'eslint-plugin-check-file';

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
      'check-file': checkFile,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs['eslint-recommended'].rules,
      ...tseslint.configs.recommended.rules,
      ...eslintPluginPrettierRecommended.rules,
      'prettier/prettier': ['error', { singleQuote: true }],
      'check-file/filename-naming-convention': [
        'error',
        {
          '**/*.ts': 'SNAKE_CASE',
        },
      ],

      // Disable rules that don't add value to this security data generation codebase
      '@typescript-eslint/no-explicit-any': 'off', // Dynamic ES/AI data structures require flexibility
      '@typescript-eslint/no-unused-vars': ['error', {
        'argsIgnorePattern': '^_', // Allow unused params prefixed with _
        'varsIgnorePattern': '^_', // Allow unused vars prefixed with _
        'destructuredArrayIgnorePattern': '^_', // Allow unused destructured elements prefixed with _
        'caughtErrors': 'all',
        'caughtErrorsIgnorePattern': '^_' // Allow unused catch errors prefixed with _
      }],
      '@typescript-eslint/no-empty-object-type': 'off', // MCP protocol uses empty interfaces
      'no-prototype-builtins': 'off', // hasOwnProperty usage is intentional and safe
      'no-case-declarations': 'off', // Case declarations with proper scoping are acceptable
      'no-useless-catch': 'off', // Some catches are for error transformation
      'no-control-regex': 'off', // Control character detection is legitimate security validation
    },
    files: ['src/**/*.ts'],
  },
];
