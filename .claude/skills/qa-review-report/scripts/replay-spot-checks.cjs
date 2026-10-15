#!/usr/bin/env node
/**
 * Saves and replays the reviewer's independent spot-check queries, so findings can be
 * re-verified after fixes without rewriting SQL.
 *
 *   # save: run a query, keep it and its result
 *   node .claude/skills/qa-review-report/scripts/replay-spot-checks.cjs save \
 *     /tmp/<SCOPE>-review/spot-checks <name> "SELECT ..."
 *   # replay: rerun every saved query and compare with the saved result
 *   node .claude/skills/qa-review-report/scripts/replay-spot-checks.cjs replay \
 *     /tmp/<SCOPE>-review/spot-checks
 *
 * Each check is `<name>.sql` + `<name>.result.json` (+ optional `<name>.md` saying what it
 * proves: window, metric, UI value, suite oracle value). Queries run through
 * profile-tenant-data's read-only runner, one SELECT each. `replay` prints same / CHANGED per
 * query; CHANGED means the data moved (or the query depends on today) — re-judge the finding.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROFILE = path.resolve(__dirname, '../../profile-tenant-data/scripts/profile.cjs');
const run = (sql) => JSON.parse(execFileSync('node', [PROFILE, sql], { encoding: 'utf8' }));

const [mode, dir, name, sql] = process.argv.slice(2);
if (!mode || !dir) {
  console.error('Usage: replay-spot-checks.cjs save <dir> <name> "<SELECT>" | replay <dir>');
  process.exit(2);
}

if (mode === 'save') {
  if (!name || !sql) throw new Error('save needs <name> and "<SELECT ...>"');
  fs.mkdirSync(dir, { recursive: true });
  const rows = run(sql);
  fs.writeFileSync(path.join(dir, `${name}.sql`), `${sql.trim()}\n`);
  fs.writeFileSync(path.join(dir, `${name}.result.json`), `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`Saved ${name}: ${JSON.stringify(rows)}`);
} else if (mode === 'replay') {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (!files.length) console.log(`No .sql files in ${dir}`);
  let changed = 0;
  for (const file of files) {
    const base = file.replace(/\.sql$/, '');
    const now = run(fs.readFileSync(path.join(dir, file), 'utf8'));
    const savedPath = path.join(dir, `${base}.result.json`);
    const saved = fs.existsSync(savedPath) ? JSON.parse(fs.readFileSync(savedPath, 'utf8')) : null;
    const same = JSON.stringify(now) === JSON.stringify(saved);
    if (!same) changed += 1;
    console.log(
      `${same ? 'same   ' : 'CHANGED'} ${base}: ${JSON.stringify(now)}${same ? '' : `  (was ${JSON.stringify(saved)})`}`,
    );
  }
  console.log(`\n${files.length} replayed, ${changed} changed.`);
} else {
  throw new Error(`Unknown mode ${mode}`);
}
