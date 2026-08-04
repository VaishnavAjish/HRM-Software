import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist', 'dev-dist', 'master', 'main', 'android',
    // vite.config.js sets outDir to the current git branch name, so every
    // branch mints a new build folder at the repo root. Listing them by name
    // means the list is always one branch out of date — a fresh branch got
    // 1,900 lint errors from its own minified bundles. These patterns match
    // the build output's signature instead: Vite emits hashed chunks as
    // name-HASH.js, which source never produces, plus the PWA service worker.
    '**/assets/*-*.js',
    '**/sw.js',
    '**/workbox-*.js',
    '**/registerSW.js',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
