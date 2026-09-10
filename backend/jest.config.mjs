/**
 * Jest 30 configuration (ESM through ts-jest).
 * Run with: node --experimental-vm-modules node_modules/jest/bin/jest.js --ci
 */
import { createDefaultEsmPreset } from 'ts-jest';

const preset = createDefaultEsmPreset({ tsconfig: '<rootDir>/tsconfig.test.json' });

/** @type {import('jest').Config} */
export default {
  ...preset,
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/_tests_/**/*.test.ts'],
  // Required env variables get test defaults before the first import
  setupFiles: ['<rootDir>/app/_tests_/jest.env.ts'],
  setupFilesAfterEnv: ['<rootDir>/app/_tests_/jest.setup.ts'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
};
