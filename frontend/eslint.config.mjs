import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

// ESLint is held at 9.39.5 in this package (the backend runs ESLint 10): eslint-config-next 16.3.4
// depends on eslint-plugin-react 7.37.5, which crashes on ESLint 10 (`contextOrFilename.getFilename
// is not a function`). Move to ESLint 10 once https://github.com/vercel/next.js/pull/91710 ships.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Must come after the Next configs so it can switch off formatting rules.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
