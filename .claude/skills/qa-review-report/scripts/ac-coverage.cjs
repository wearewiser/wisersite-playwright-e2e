#!/usr/bin/env node
/**
 * AC coverage map: every acceptance criterion in tickets.json → the tests tagged with it → how
 * they fared.
 *
 *   node .claude/skills/qa-review-report/scripts/ac-coverage.cjs \
 *     --tickets /tmp/<KEY>-explore/tickets.json \
 *     [--results /tmp/<SCOPE>-review/run-main.json]   # a Playwright JSON run; omit to list only
 *     [--json /tmp/<SCOPE>-review/coverage.json]      # machine-readable copy
 *
 * Tests declare ACs with `details({ ac: ['WP23-87 AC 5.1'], ... })` (src/utils/playwright/
 * test-annotations.ts). A tag covers an AC when it equals it or is a sub-item of it (a test on
 * "AC 5.1" counts for "AC 5"); a broad tag never covers sub-items ("AC 1" doesn't cover
 * "AC 1.3"), so coverage isn't inflated. Without --results it runs `playwright test --list`.
 *
 * AC status, best first: asserted (a test passed, not limited by data) · failing-known ·
 * failing-suspected · failing-new · empty-state-only (passed, limited-by-data) · skipped ·
 * missing (no test tagged). Closed / Won't Do tickets are listed but not counted.
 * Read-only.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../../..');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  if (!args.tickets) throw new Error('--tickets <tickets.json> is required');
  return args;
}

function loadRun(file) {
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = execFileSync(
    'npx',
    ['playwright', 'test', '-c', 'playwright.wisersite.config.ts', '--list', '--reporter=json'],
    { cwd: ROOT, env: { ...process.env, SKIP_APP_CHECK: '1' }, maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(out.toString());
}

/** One entry per test: its AC tags and outcome. */
function collectTests(run, hasResults) {
  const tests = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const annotations = [
          ...(t.annotations ?? []),
          ...(t.results ?? []).flatMap((r) => r.annotations ?? []),
        ];
        const has = (type) => annotations.some((a) => a.type === type);
        let outcome = 'listed';
        if (hasResults) {
          if (t.status === 'skipped') outcome = 'skipped';
          else if (t.status === 'unexpected' || t.status === 'flaky') {
            outcome = has('known-defect')
              ? 'failing-known'
              : has('suspected-defect')
                ? 'failing-suspected'
                : t.status === 'flaky'
                  ? 'flaky'
                  : 'failing-new';
          } else outcome = has('limited-by-data') ? 'empty-state-only' : 'asserted';
        }
        tests.push({
          name: `${path.basename(spec.file)}:${spec.line} ${spec.title}`,
          acs: [...new Set(annotations.filter((a) => a.type === 'ac').map((a) => a.description))],
          outcome,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of run.suites ?? []) walk(suite);
  return tests;
}

const RANK = [
  'asserted',
  'failing-known',
  'failing-suspected',
  'failing-new',
  'flaky',
  'empty-state-only',
  'listed',
  'skipped',
];
const covers = (tag, ac) => tag === ac || tag.startsWith(`${ac}.`);
const outOfScope = (status) => /closed|won.?t do|cancel/i.test(status ?? '');

function main() {
  const args = parseArgs(process.argv);
  const { tickets } = JSON.parse(fs.readFileSync(args.tickets, 'utf8'));
  const tests = collectTests(loadRun(args.results), Boolean(args.results));

  const known = new Set();
  const rows = [];
  for (const ticket of tickets) {
    for (const ac of ticket.acs ?? []) {
      const id = `${ticket.key} ${ac.id}`;
      known.add(id);
      const matched = tests.filter((t) => t.acs.some((tag) => covers(tag, id)));
      const best = matched
        .map((t) => t.outcome)
        .sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0];
      rows.push({
        ticket: ticket.key,
        ticketStatus: ticket.status,
        inScope: !outOfScope(ticket.status),
        ac: ac.id,
        text: ac.text,
        status: outOfScope(ticket.status) ? 'out-of-scope' : (best ?? 'missing'),
        tests: matched.map((t) => `${t.name} [${t.outcome}]`),
      });
    }
  }
  const unknownTags = [
    ...new Set(
      tests.flatMap((t) => t.acs).filter((tag) => ![...known].some((id) => covers(tag, id))),
    ),
  ];
  const untagged = tests.filter((t) => t.acs.length === 0).map((t) => t.name);

  const counts = {};
  for (const r of rows.filter((r) => r.inScope)) counts[r.status] = (counts[r.status] ?? 0) + 1;

  console.log(`AC coverage (${args.results ? 'from run results' : 'tags only, not run'})\n`);
  console.log('| Ticket | AC | Status | Tests |\n|---|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.ticket} | ${r.ac} | ${r.status} | ${r.tests.length} |`);
  }
  console.log(`\nIn-scope ACs by status: ${JSON.stringify(counts)}`);
  if (unknownTags.length)
    console.log(`Tags matching no AC in tickets.json: ${unknownTags.join('; ')}`);
  if (untagged.length)
    console.log(`Tests with no AC tag (${untagged.length}): ${untagged.join('; ')}`);

  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify({ rows, counts, unknownTags, untagged }, null, 2));
    console.log(`Wrote ${args.json}`);
  }
}

main();
