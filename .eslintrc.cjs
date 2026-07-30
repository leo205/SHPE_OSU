module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh', 'jsx-a11y'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],

    // This is a plain-JS React codebase with no `prop-types` dependency and no
    // TypeScript, so the rule fired on essentially every component (62 errors)
    // and made `npm run lint` — the documented pre-push gate — unusable. Turning
    // it off is deliberate: reinstate it only alongside a real typing strategy
    // (TypeScript is the better answer if the planned rewrite happens).
    'react/prop-types': 'off',

    // Only `>` and `}` are genuinely ambiguous inside JSX text. Apostrophes and
    // quotes render correctly and reading `We&apos;ll` in source is worse than
    // the problem the default config solves.
    'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
  },
}
