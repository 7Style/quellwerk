import fs from 'node:fs';
import path from 'node:path';

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

const MODULES_DIR = 'app/modules';

function moduleNames() {
  try {
    return fs
      .readdirSync(path.join(import.meta.dirname, MODULES_DIR), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    // Before M0 raises the first module the directory may not exist yet.
    return [];
  }
}

// One zone per module: a module reaches its own subtree and nothing else under
// modules/. Generated from the directory, so a module added tomorrow is covered
// the moment it exists and nobody has to remember to edit this file.
const moduleBoundaryZones = moduleNames().map((name) => ({
  target: `./${MODULES_DIR}/${name}`,
  from: `./${MODULES_DIR}`,
  except: [`./${name}`],
  message: `Modules never import each other. ${name} gets what it needs injected in app/modules/index.ts.`,
}));

const moduleBoundaryRule = {
  'import/no-restricted-paths': ['error', { basePath: import.meta.dirname, zones: moduleBoundaryZones }],
};

// The code imports ESM style with a .js specifier that points at a .ts file on
// disk. Without the TypeScript resolver the plugin cannot resolve those paths,
// and no-restricted-paths then stays silent instead of reporting: a rule that
// cannot resolve is worse than no rule, because it looks like it passed.
const moduleBoundarySettings = {
  'import/resolver': {
    typescript: { project: path.join(import.meta.dirname, 'tsconfig.json') },
  },
};

const sharedRules = {
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-empty-function': 'warn',
  '@typescript-eslint/no-non-null-assertion': 'warn',
  '@typescript-eslint/ban-ts-comment': 'warn',
  '@typescript-eslint/no-inferrable-types': 'off',
  '@typescript-eslint/no-namespace': 'off',
  // Type-aware "unsafe" rules: the codebase still carries a lot of `any`; keep
  // them visible as warnings, fail only on real defects.
  '@typescript-eslint/no-unsafe-assignment': 'warn',
  '@typescript-eslint/no-unsafe-member-access': 'warn',
  '@typescript-eslint/no-unsafe-call': 'warn',
  '@typescript-eslint/no-unsafe-argument': 'warn',
  '@typescript-eslint/no-unsafe-return': 'warn',
  '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
  '@typescript-eslint/restrict-template-expressions': 'warn',
  '@typescript-eslint/no-redundant-type-constituents': 'warn',
  '@typescript-eslint/require-await': 'off',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false } }],
  'no-console': 'off',
  'no-debugger': 'warn',
  'prefer-const': 'error',
  'no-var': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-duplicate-imports': 'warn',
  '@typescript-eslint/no-unused-expressions': 'error',
  'require-await': 'off',
  'no-case-declarations': 'warn',
  'no-useless-escape': 'warn',
};

export default defineConfig([
  globalIgnores([
    'node_modules/',
    'dist/',
    'coverage/',
    'logs/',
    'uploads/',
    'public/',
    'app/generated/',
    'prisma/generated/',
    'prisma/migrations/',
  ]),
  {
    files: ['**/*.ts'],
    ignores: ['**/_tests_/**', '**/*.test.ts', '**/*.spec.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { import: importPlugin },
    settings: moduleBoundarySettings,
    rules: { ...sharedRules, ...moduleBoundaryRule },
  },
  {
    files: ['**/_tests_/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { project: './tsconfig.test.json', tsconfigRootDir: import.meta.dirname },
    },
    plugins: { import: importPlugin },
    settings: moduleBoundarySettings,
    rules: {
      ...sharedRules,
      ...moduleBoundaryRule,
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },
]);
