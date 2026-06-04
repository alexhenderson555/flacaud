import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src-tauri']),
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
    rules: {
      // react-hooks v7 promoted these structural advisories to errors. They flag
      // working-but-discouraged patterns across the existing codebase; surface them
      // as warnings instead of forcing a risky multi-site refactor.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  {
    // Playwright e2e specs/helpers and build config run in Node, not the browser.
    files: ['e2e/**/*.{js,jsx}', '**/*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
])
