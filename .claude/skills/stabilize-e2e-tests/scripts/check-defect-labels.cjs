#!/usr/bin/env node
/**
 * Checks every defect label the suite uses against the two registers.
 *
 *   node .claude/skills/stabilize-e2e-tests/scripts/check-defect-labels.cjs [--strict]
 *
 * Reads `src/constants/wisersite/known-defects.constants.ts` (KNOWN_DEFECTS, SUSPECTED_DEFECTS;
 * each description starts with "<ID>:"), `../wisersite-and-payload-plugin/testing-docs/
 * KNOWN-DEFECTS.md` and `docs/suspected-defects.md`, and the specs that use them. Reports:
 *  - known label whose ID is missing from KNOWN-DEFECTS.md, or marked fixed / superseded there;
 *  - suspected label that is now logged in KNOWN-DEFECTS.md (move it to KNOWN_DEFECTS), or
 *    missing from docs/suspected-defects.md, or closed there (skipped when that file is absent:
 *    `docs/` is gitignored and local to the author);
 *  - a constant no spec uses.
 * Read-only. Exit 1 with --strict when there is anything to fix.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const CONSTANTS = path.join(ROOT, 'src/constants/wisersite/known-defects.constants.ts');
const KNOWN_MD = path.join(ROOT, '../wisersite-and-payload-plugin/testing-docs/KNOWN-DEFECTS.md');
const SUSPECTED_MD = path.join(ROOT, 'docs/suspected-defects.md');

/** `{ key: id }` for one exported object literal in the constants file. */
function readConstants(source, name) {
  const start = source.indexOf(`export const ${name}`);
  if (start < 0) return {};
  const body = source.slice(start, source.indexOf('} as const', start));
  const out = {};
  const re = /(\w+):\s*\n?\s*(['"`])([^:'"`]+):/g;
  for (let m = re.exec(body); m; m = re.exec(body)) out[m[1]] = m[3].trim();
  return out;
}

/** `{ id: status }` from a Markdown table whose first column is the ID. */
function readRegister(file, statusColumn) {
  if (!fs.existsSync(file)) return null;
  const rows = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.startsWith('|') || /^\|\s*-/.test(line)) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.replace(/\*\*/g, '').trim());
    if (!cells[0] || cells[0] === 'ID') continue;
    rows[cells[0]] = cells[statusColumn] ?? '';
  }
  return rows;
}

const closed = (status) => /^(fixed|superseded|accepted|logged as)/i.test(status);

function usedKeys() {
  const used = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.ts')) {
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/(KNOWN_DEFECTS|SUSPECTED_DEFECTS)\.(\w+)/g))
          used.add(`${m[1]}.${m[2]}`);
      }
    }
  };
  walk(path.join(ROOT, 'tests'));
  return used;
}

const source = fs.readFileSync(CONSTANTS, 'utf8');
const known = readConstants(source, 'KNOWN_DEFECTS');
const suspected = readConstants(source, 'SUSPECTED_DEFECTS');
const knownRegister = readRegister(KNOWN_MD, 4);
// `docs/` is gitignored, so the suspected register only exists on the author's machine.
const suspectedRegister = readRegister(SUSPECTED_MD, 5);
const used = usedKeys();
const problems = [];
const rows = [];

if (!knownRegister) problems.push(`Can't read ${KNOWN_MD}`);

for (const [key, id] of Object.entries(known)) {
  const status = knownRegister?.[id];
  let verdict = 'ok: open';
  if (status === undefined) verdict = 'PROBLEM: not in KNOWN-DEFECTS.md';
  else if (closed(status))
    verdict = `PROBLEM: ${status.split(/[;(]/)[0].trim()}, remove the label and re-check the test`;
  if (!used.has(`KNOWN_DEFECTS.${key}`)) verdict += ' (unused constant)';
  rows.push(['known', key, id, verdict]);
}
for (const [key, id] of Object.entries(suspected)) {
  let verdict = 'ok: awaiting log / PO';
  if (knownRegister?.[id] !== undefined)
    verdict = 'PROBLEM: now in KNOWN-DEFECTS.md, move to KNOWN_DEFECTS';
  else if (!suspectedRegister) verdict = 'ok: register not available (docs/ is local only)';
  else if (suspectedRegister[id] === undefined)
    verdict = 'PROBLEM: not in docs/suspected-defects.md';
  else if (closed(suspectedRegister[id]))
    verdict = `PROBLEM: ${suspectedRegister[id]} in the register, update the tests`;
  if (!used.has(`SUSPECTED_DEFECTS.${key}`)) verdict += ' (unused constant)';
  rows.push(['suspected', key, id, verdict]);
}
for (const r of rows)
  if (/PROBLEM|unused/.test(r[3])) problems.push(`${r[0]} ${r[1]} (${r[2]}): ${r[3]}`);

console.log('Defect labels');
for (const [kind, key, id, verdict] of rows) {
  console.log(`  ${kind.padEnd(10)} ${key.padEnd(22)} ${id.padEnd(16)} ${verdict}`);
}
if (problems.length) console.log(`\n${problems.length} to fix.`);
process.exit(process.argv.includes('--strict') && problems.length ? 1 : 0);
