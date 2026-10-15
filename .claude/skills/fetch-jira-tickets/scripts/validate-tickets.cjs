#!/usr/bin/env node
/**
 * Validates the output of fetch-jira-tickets before anything is designed from it.
 *
 *   node .claude/skills/fetch-jira-tickets/scripts/validate-tickets.cjs /tmp/<KEY>-explore
 *
 * Expects `tickets.json` (and `tickets.md`) in that folder. tickets.json shape:
 *   { "epic": "WP23-62", "fetchedAt": "<ISO>", "via": "mcp | headless",
 *     "tickets": [{ "key", "summary", "status", "type", "description" (verbatim),
 *                   "acs": [{ "id": "AC 1.1", "text": "<verbatim>" }],
 *                   "numberingNotes": "e.g. 'no AC 4 in the ticket'",
 *                   "comments": [{ "author", "created", "body" (verbatim) }],
 *                   "links": ["WP23-235"] }] }
 * Fails when a ticket lacks a description, an in-scope ticket has no ACs, AC ids repeat or
 * don't look like "AC n[.n…]" / "Func n[.n…]", AC text is empty or obviously summarised (much
 * shorter than the description it came from), keys repeat, or tickets.md is far shorter than
 * the JSON (a summary instead of the verbatim dump). Read-only; exit 1 on failure.
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: validate-tickets.cjs /tmp/<KEY>-explore');
  process.exit(2);
}
const jsonPath = path.join(dir, 'tickets.json');
const mdPath = path.join(dir, 'tickets.md');
const errors = [];
const warnings = [];

if (!fs.existsSync(jsonPath)) {
  console.error(`Missing ${jsonPath}`);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const tickets = data.tickets ?? [];
if (!tickets.length) errors.push('No tickets.');

const keys = new Set();
const AC_ID = /^(AC|Func)\s\d+(\.\d+)*$/;
for (const t of tickets) {
  const where = t.key ?? '(no key)';
  if (!t.key) errors.push('A ticket has no key.');
  if (keys.has(t.key)) errors.push(`${where}: duplicate key.`);
  keys.add(t.key);
  for (const field of ['summary', 'status', 'type'])
    if (!t[field]) errors.push(`${where}: no ${field}.`);
  const closed = /closed|won.?t do|cancel/i.test(t.status ?? '');
  if (!t.description || t.description.trim().length < 40) {
    (closed ? warnings : errors).push(`${where}: description missing or under 40 chars.`);
  }
  const acs = t.acs ?? [];
  if (!closed && t.type !== 'Epic' && !acs.length) errors.push(`${where}: in scope but no ACs.`);
  const ids = new Set();
  for (const ac of acs) {
    if (!AC_ID.test(ac.id ?? ''))
      errors.push(`${where}: AC id "${ac.id}" isn't "AC n[.n]" / "Func n[.n]".`);
    if (ids.has(ac.id)) errors.push(`${where}: AC id "${ac.id}" repeats.`);
    ids.add(ac.id);
    if (!ac.text || ac.text.trim().length < 3) errors.push(`${where} ${ac.id}: empty text.`);
  }
  const acChars = acs.reduce((n, ac) => n + (ac.text ?? '').length, 0);
  if (acs.length && t.description && acChars < t.description.length * 0.15) {
    warnings.push(
      `${where}: AC text is ${acChars} chars against a ${t.description.length}-char description. Summarised?`,
    );
  }
  if (!Array.isArray(t.comments))
    warnings.push(`${where}: no comments array (fetch with fields: comment).`);
}

if (fs.existsSync(mdPath)) {
  const mdChars = fs.readFileSync(mdPath, 'utf8').length;
  const jsonChars = tickets.reduce((n, t) => n + (t.description ?? '').length, 0);
  if (mdChars < jsonChars * 0.5)
    errors.push(
      `tickets.md (${mdChars} chars) is far shorter than the descriptions (${jsonChars}). Summarised?`,
    );
} else {
  errors.push(`Missing ${mdPath}`);
}

const acTotal = tickets.reduce((n, t) => n + (t.acs ?? []).length, 0);
console.log(`${tickets.length} tickets, ${acTotal} ACs.`);
for (const t of tickets) {
  console.log(
    `  ${t.key.padEnd(10)} ${String(t.status).padEnd(10)} ${(t.acs ?? []).length} ACs, ${(t.comments ?? []).length} comments  ${t.summary}`,
  );
}
for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(errors.length ? `\nInvalid: ${errors.length} error(s).` : '\nValid.');
process.exit(errors.length ? 1 : 0);
