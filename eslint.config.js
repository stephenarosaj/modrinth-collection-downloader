import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      boundaries,
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'core', pattern: 'src/core' },
        { type: 'ports', pattern: 'src/ports' },
        { type: 'adapters', pattern: 'src/adapters' },
        { type: 'ui', pattern: 'src/ui' },
        { type: 'app', pattern: 'src/app' },
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'core', allow: ['core', 'ports'] },
            { from: 'ports', allow: ['ports', 'core'] },
            { from: 'adapters', allow: ['adapters', 'ports', 'core'] },
            { from: 'ui', allow: ['ui', 'core', 'ports'] },
            { from: 'app', allow: ['app', 'ui', 'core', 'ports', 'adapters'] },
          ],
        },
      ],
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'src/core must remain pure TypeScript and may not import React.',
            },
            {
              name: 'react-dom',
              message: 'src/core must remain pure TypeScript and may not import React DOM.',
            },
          ],
          patterns: [
            {
              group: ['react/*', 'react-dom/*', 'jszip', 'jszip/*'],
              message: 'src/core must remain pure TypeScript with no UI or adapter libraries.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'src/core must remain pure; use a port instead of global fetch.',
        },
        {
          name: 'window',
          message: 'src/core must remain pure; do not access window in core.',
        },
        {
          name: 'document',
          message: 'src/core must remain pure; do not access document in core.',
        },
      ],
    },
  },
  prettierConfig,
);
