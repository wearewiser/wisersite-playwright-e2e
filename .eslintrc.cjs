module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'playwright'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:playwright/recommended',
    'prettier',
  ],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'playwright-report/',
    'playwright-report-wisersite/',
    'test-results/',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    'playwright/no-conditional-in-test': 'off',
    'playwright/expect-expect': 'off',
    // This rule targets page.click()/page.fill() anti-patterns inside test
    // bodies; it false-positives on our page-object locator-factory methods
    // (e.g. `pageLink(n): Locator`) which are the recommended POM pattern.
    'playwright/prefer-locator': 'off',
  },
};
