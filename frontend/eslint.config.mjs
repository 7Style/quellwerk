import fs from 'node:fs';
import path from 'node:path';

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const MODULES_DIR = 'src/modules';

function moduleNames() {
  try {
    return fs
      .readdirSync(path.join(import.meta.dirname, MODULES_DIR), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

const names = moduleNames();

// Two boundaries, both generated from the directory so a new module is covered
// without editing this file:
//   1. a module reaches its own subtree and nothing else under modules/
//   2. everything outside modules/ reaches a module only through its index.ts
const moduleBoundaryZones = [
  ...names.map((name) => ({
    target: `./${MODULES_DIR}/${name}`,
    from: `./${MODULES_DIR}`,
    except: [`./${name}`],
    message: `Modules never import each other. Lift what both need into the page that composes them.`,
  })),
  {
    target: ['./src/app', './src/components', './src/lib', './src/store'],
    from: `./${MODULES_DIR}`,
    except: names.map((name) => `./${name}/index.ts`),
    message: 'A module is reachable through its index.ts only, not through its internals.',
  },
];

// ESLint is held at 9.39.5 in this package (the backend runs ESLint 10): eslint-config-next 16.3.4
// depends on eslint-plugin-react 7.37.5, which crashes on ESLint 10 (`contextOrFilename.getFilename
// is not a function`). Move to ESLint 10 once https://github.com/vercel/next.js/pull/91710 ships.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Must come after the Next configs so it can switch off formatting rules.
  prettier,
  {
    files: ['src/**/*.{ts,tsx}'],
    // The TypeScript resolver is required: without it the plugin cannot resolve
    // the @/ alias, and no-restricted-paths stays silent instead of reporting.
    settings: {
      'import/resolver': {
        typescript: { project: path.join(import.meta.dirname, 'tsconfig.json') },
      },
    },
    rules: {
      'import/no-restricted-paths': [
        'error',
        { basePath: import.meta.dirname, zones: moduleBoundaryZones },
      ],
    },
  },
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
