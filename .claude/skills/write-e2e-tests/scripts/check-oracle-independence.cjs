#!/usr/bin/env node
/**
 * Flags oracle code that may copy the app instead of the ticket.
 *
 *   node .claude/skills/write-e2e-tests/scripts/check-oracle-independence.cjs [--strict]
 *
 * Three checks over src/expectations, src/utils/wisersite, src/db/repositories and tests/:
 *  1. COPIES-APP: a comment says the code mirrors / matches / is the same as the app or plugin,
 *     and the surrounding comment block cites no AC ("AC 5.1"), discrepancy ("D-3") or
 *     "AC silent". Copying the app is only allowed where the ticket is silent, and must say so.
 *  2. NO-AC-DOC: an exported function in src/expectations has no JSDoc citing an AC, a
 *     discrepancy, or "AC silent".
 *  3. REQUEST-BOUNDS: a test or expectation takes minDate/maxDate from the app's own request.
 *     Those are the app's bounds, not the data; they may pick a window or decide a defect
 *     label, never produce an expected value.
 * Silence a reviewed line with a comment on it or the line above: `oracle-ok: <reason>`.
 * Read-only. Exit 1 with --strict when anything is flagged.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const DIRS = ['src/expectations', 'src/utils/wisersite', 'src/db/repositories', 'tests'];
const CITES = /\bAC\s?\d|\bFunc\s?\d|\bD-\d+\b|AC silent|\bQ&A\b/;
const COPIES =
  /\b(mirror(s|ed|ing)?|matches|matching|same as|line for line|copied|copies|reproduces)\b[^\n]{0,90}\b(app|app's|plugin|plugin's)\b/i;
const OK = /oracle-ok:/;

function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(rel);
    return entry.name.endsWith('.ts') ? [rel] : [];
  });
}

/** The comment block (JSDoc or run of // lines) containing or directly above `index`. */
function commentBlock(lines, index) {
  let start = index;
  let end = index;
  const isComment = (l) => /^\s*(\/\*\*|\*|\*\/|\/\/)/.test(l ?? '');
  while (start > 0 && isComment(lines[start - 1])) start -= 1;
  while (end < lines.length - 1 && isComment(lines[end + 1])) end += 1;
  return lines.slice(start, end + 1).join('\n');
}

const findings = [];
const add = (kind, file, line, text) =>
  findings.push({ kind, at: `${file}:${line + 1}`, text: text.trim().slice(0, 140) });

for (const file of DIRS.flatMap(walk)) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const silenced = (i) =>
    OK.test(lines[i]) ||
    OK.test(lines[i - 1] ?? '') ||
    (/^\s*(\*|\/\/)|\*\/\s*$/.test(lines[i - 1] ?? '') && OK.test(commentBlock(lines, i - 1)));

  lines.forEach((line, i) => {
    if (silenced(i)) return;
    const isComment = /^\s*(\/\*\*|\*|\/\/)/.test(line);
    if (isComment && COPIES.test(line) && !CITES.test(commentBlock(lines, i))) {
      add('COPIES-APP', file, i, line);
    }
    if (
      !file.startsWith('src/db') &&
      /\{[^}]*\b(minDate|maxDate)\b[^}]*\}\s*=\s*await\s+widgetRequests\./.test(line)
    ) {
      add('REQUEST-BOUNDS', file, i, line);
    }
  });

  if (file.startsWith('src/expectations')) {
    lines.forEach((line, i) => {
      if (!/^export (async )?function |^export const \w+\s*=\s*\(/.test(line) || silenced(i))
        return;
      const doc = /\*\/\s*$/.test(lines[i - 1] ?? '') ? commentBlock(lines, i - 1) : '';
      if (!CITES.test(doc)) add('NO-AC-DOC', file, i, line);
    });
  }
}

const strict = process.argv.includes('--strict');
if (!findings.length) {
  console.log('Oracle independence: nothing flagged.');
} else {
  console.log(`Oracle independence: ${findings.length} to review`);
  for (const f of findings) console.log(`  ${f.kind.padEnd(14)} ${f.at}  ${f.text}`);
  console.log(
    '\nCite the AC (or "AC silent: per app <file:line>", or the D-n discrepancy) in the comment,\n' +
      'fix the code to follow the ticket, or mark a reviewed line with `oracle-ok: <reason>`.',
  );
}
process.exit(strict && findings.length ? 1 : 0);
