module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  settings: {
    react: { version: 'detect' },
  },
  env: {
    browser: true,
    es2022: true,
  },
  ignorePatterns: ['dist', 'node_modules'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // This experimental rule (added in eslint-plugin-react-hooks 7.x) flags
    // the standard "fetch data in useEffect, setState in a finally block"
    // pattern used throughout this app (see SystemStatusPage, employee
    // list/detail pages). There's no actual bug it's catching here — deps
    // arrays are correct and there's no render loop — so it's disabled
    // rather than forcing awkward restructuring of ordinary data fetching.
    'react-hooks/set-state-in-effect': 'off',
  },
};
