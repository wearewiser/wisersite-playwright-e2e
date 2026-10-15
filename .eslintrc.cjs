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
    // Data-driven tests are this suite's documented pattern (CLAUDE.md, write-e2e-tests): a test
    // decides from Postgres at runtime whether to assert the data path, the empty-state path, or
    // to skip with a reason in data terms. A conditional `test.skip(cond, reason)` is allowed; an
    // unconditional `test.skip()` / `test.only` still warns. Conditional expects are allowed
    // because each branch asserts something; vacuous passes are caught instead by
    // `markLimitedByData()` labels and the QA review checklist (B.9).
    'playwright/no-skipped-test': ['warn', { allowConditional: true }],
    'playwright/no-conditional-expect': 'off',
  },
};
