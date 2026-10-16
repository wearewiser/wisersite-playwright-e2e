#!/usr/bin/env node
/**
 * Builds the senior QA review HTML report.
 *
 *   node .claude/skills/qa-review-report/scripts/build-report.cjs \
 *     --review /tmp/<SCOPE>-review/review.json \
 *     --results "Main run (test:headed:retry)=/tmp/<SCOPE>-review/run-main.json" \
 *     [--results "Repeat x3=/tmp/<SCOPE>-review/run-repeat.json"] \
 *     --out test-results/qa-review/<YYYY-MM-DD>-<SCOPE>.html
 *
 * Run numbers (pass/fail/flaky/skip, retries, durations, errors, attachments) come straight from
 * Playwright's JSON reporter, so the report can't misstate them. Judgement (ticket/AC coverage,
 * findings, checks, spot checks) comes from review.json, written by the reviewer agent.
 * Only reads its inputs and writes --out.
 */
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { results: [] };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--review') args.review = value;
    else if (flag === '--out') args.out = value;
    else if (flag === '--results') {
      const eq = value.indexOf('=');
      args.results.push(
        eq > 0
          ? { label: value.slice(0, eq), file: value.slice(eq + 1) }
          : { label: path.basename(value), file: value },
      );
    } else throw new Error(`Unknown argument ${flag}`);
    i++;
  }
  if (!args.review || !args.out || args.results.length === 0) {
    throw new Error(
      'Usage: --review <review.json> --results [label=]<results.json> ... --out <file.html>',
    );
  }
  return args;
}

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
// Strips ANSI colour codes from Playwright error messages.
const stripAnsi = (value) => String(value ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const pill = (kind, text) => `<span class="pill ${esc(kind)}">${esc(text ?? kind)}</span>`;

/** Flattens Playwright JSON suites into one row per test (per project). */
function collectTests(report, outDir) {
  const rows = [];
  const walk = (suite, trail) => {
    const nextTrail = suite.title && !suite.title.endsWith('.ts') ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        const last = results[results.length - 1] ?? {};
        const errors = results
          .flatMap((r) => (r.errors?.length ? r.errors : r.error ? [r.error] : []))
          .map((e) => stripAnsi(e.message ?? e.value ?? ''))
          .filter(Boolean);
        const attachments = results
          .flatMap((r) => r.attachments ?? [])
          .filter((a) => a.path)
          .map((a) => ({
            name: a.name,
            href: path.relative(outDir, a.path).split(path.sep).join('/'),
          }));
        rows.push({
          file: spec.file,
          line: spec.line,
          title: [...nextTrail, spec.title].join(' › '),
          project: t.projectName,
          status: t.status, // expected | unexpected | flaky | skipped
          expectedStatus: t.expectedStatus, // passed | failed (test.fail, not allowed) | skipped
          finalStatus: last.status,
          attempts: results.length,
          duration: results.reduce((sum, r) => sum + (r.duration ?? 0), 0),
          annotations: [
            ...(t.annotations ?? []),
            ...(spec.annotations ?? []),
            ...results.flatMap((r) => r.annotations ?? []),
          ].filter(
            (a, i, all) =>
              all.findIndex((b) => b.type === a.type && b.description === a.description) === i,
          ),
          errors: [...new Set(errors)],
          attachments,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, nextTrail);
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return rows;
}

const hasLabel = (row, type) => row.annotations.some((a) => a.type === type);
/** The app or a dependency was unreachable: the run says nothing about the feature. */
const ENVIRONMENT_ERROR = /ERR_CONNECTION_REFUSED|ECONNREFUSED|ECONNRESET|net::ERR_|ENVIRONMENT:/;

/**
 * `failed` = a new failure; `known-defect` / `suspected-defect` = failed on a bug labelled with
 * `markKnownDefect()` / `markSuspectedDefect()`; `environment` = failed because the app (or DB)
 * was unreachable; `limited` = passed, but labelled `limited-by-data` (only the zero / empty
 * case was exercised). `expected-fail` only appears if someone used `test.fail()`, which the
 * repo rules forbid.
 */
function outcome(row) {
  if (row.status === 'skipped') return 'skipped';
  if (row.status === 'flaky') return 'flaky';
  if (row.status === 'unexpected') {
    if (row.errors.length && row.errors.every((e) => ENVIRONMENT_ERROR.test(e)))
      return 'environment';
    if (hasLabel(row, 'known-defect')) return 'known-defect';
    if (hasLabel(row, 'suspected-defect')) return 'suspected-defect';
    return 'failed';
  }
  if (row.expectedStatus === 'failed') return 'expected-fail';
  return hasLabel(row, 'limited-by-data') ? 'limited' : 'passed';
}

const OUTCOMES = [
  'passed',
  'limited',
  'failed',
  'known-defect',
  'suspected-defect',
  'flaky',
  'environment',
  'expected-fail',
  'skipped',
];
const OPTIONAL_OUTCOMES = new Set(['environment', 'expected-fail']);

function summarise(rows) {
  const counts = Object.fromEntries(OUTCOMES.map((k) => [k, 0]));
  for (const row of rows) counts[outcome(row)]++;
  return counts;
}

function runSection(run, index) {
  const { rows, report, label } = run;
  const counts = summarise(rows);
  const stats = report.stats ?? {};
  const files = [...new Set(rows.map((r) => r.file))];
  const slowest = [...rows].sort((a, b) => b.duration - a.duration).slice(0, 5);
  const tableRows = rows
    .map((row) => {
      const o = outcome(row);
      const notes = row.annotations
        .map(
          (a) =>
            `<div class="muted">${esc(a.type)}${a.description ? `: ${esc(a.description)}` : ''}</div>`,
        )
        .join('');
      const errs = row.errors.length
        ? `<details><summary>error</summary><pre>${esc(row.errors.join('\n\n---\n\n').slice(0, 6000))}</pre></details>`
        : '';
      const links = row.attachments
        .map((a) => `<a href="${esc(a.href)}">${esc(a.name)}</a>`)
        .join(' · ');
      return `<tr class="o-${o}" data-outcome="${o}">
        <td>${pill(o)}</td>
        <td><code>${esc(row.file)}:${esc(row.line)}</code></td>
        <td>${esc(row.title)}${notes}${errs}</td>
        <td class="num">${row.attempts}</td>
        <td class="num">${(row.duration / 1000).toFixed(1)}s</td>
        <td>${links}</td>
      </tr>`;
    })
    .join('');
  return `<section>
    <h3>${esc(label)}</h3>
    <div class="tiles">
      ${OUTCOMES.filter((k) => !OPTIONAL_OUTCOMES.has(k) || counts[k])
        .map(
          (k) =>
            `<div class="tile t-${k}"><div class="big">${counts[k]}</div><div>${k}</div></div>`,
        )
        .join('')}
      <div class="tile"><div class="big">${rows.length}</div><div>tests</div></div>
      <div class="tile"><div class="big">${files.length}</div><div>spec files</div></div>
      <div class="tile"><div class="big">${((stats.duration ?? 0) / 60000).toFixed(1)}m</div><div>wall time</div></div>
    </div>
    <p class="muted">Started ${esc(stats.startTime ?? '')}. Playwright ${esc(report.config?.version ?? '')}.
      Retries configured: ${esc(report.config?.projects?.[0]?.retries ?? '?')}.
      Slowest: ${slowest.map((r) => `${esc(r.title)} (${(r.duration / 1000).toFixed(1)}s)`).join('; ')}</p>
    <div class="filters" data-table="run-${index}">
      Filter: ${[
        'all',
        'failed',
        'known-defect',
        'suspected-defect',
        'environment',
        'flaky',
        'limited',
        'skipped',
        'passed',
      ]
        .map((k) => `<button data-filter="${k}">${k}</button>`)
        .join(' ')}
    </div>
    <table id="run-${index}">
      <thead><tr><th>Outcome</th><th>Spec</th><th>Test</th><th>Attempts</th><th>Time</th><th>Artifacts</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </section>`;
}

function ticketsSection(tickets = []) {
  if (!tickets.length) return '<p class="muted">No tickets recorded.</p>';
  const summaryRows = tickets
    .map((t) => {
      const acs = t.acs ?? [];
      const asserted = acs.filter((a) => a.status === 'asserted').length;
      return `<tr>
        <td><a href="#${esc(t.key)}">${esc(t.key)}</a></td>
        <td>${esc(t.summary)}</td>
        <td>${esc(t.status)}</td>
        <td>${pill(t.verdict)}</td>
        <td class="num">${asserted} / ${acs.length}</td>
        <td>${(t.specs ?? []).map((s) => `<code>${esc(s)}</code>`).join('<br>')}</td>
      </tr>`;
    })
    .join('');
  const details = tickets
    .map(
      (t) => `<details class="ticket" id="${esc(t.key)}" ${t.verdict !== 'covered' ? 'open' : ''}>
        <summary><strong>${esc(t.key)}</strong> ${esc(t.summary)} ${pill(t.verdict)}</summary>
        ${t.notes ? `<p>${esc(t.notes)}</p>` : ''}
        <table>
          <thead><tr><th>AC</th><th>Criterion</th><th>Status</th><th>Covered by</th><th>Reviewer notes</th></tr></thead>
          <tbody>${(t.acs ?? [])
            .map(
              (a) => `<tr>
                <td><code>${esc(a.id)}</code></td>
                <td>${esc(a.text)}</td>
                <td>${pill(a.status)}</td>
                <td>${(a.tests ?? []).map((x) => `<div><code>${esc(x)}</code></div>`).join('')}</td>
                <td>${esc(a.notes)}</td>
              </tr>`,
            )
            .join('')}</tbody>
        </table>
      </details>`,
    )
    .join('');
  return `<table>
      <thead><tr><th>Ticket</th><th>Summary</th><th>Jira status</th><th>Coverage</th><th>ACs asserted</th><th>Specs</th></tr></thead>
      <tbody>${summaryRows}</tbody>
    </table>${details}`;
}

const SEVERITY_ORDER = { blocker: 0, major: 1, minor: 2, nit: 3 };

function findingsSection(findings = []) {
  if (!findings.length) return '<p class="muted">No findings.</p>';
  return [...findings]
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    .map(
      (f) => `<div class="finding sev-${esc(f.severity)}">
        <div>${pill(f.severity)} ${f.status ? pill(f.status) : ''} <strong>${esc(f.id)}</strong> ${esc(f.title)}
          ${f.category ? `<span class="muted">· ${esc(f.category)}</span>` : ''}
          ${f.ticket ? `<span class="muted">· ${esc(f.ticket)}</span>` : ''}</div>
        ${f.file ? `<div><code>${esc(f.file)}${f.line ? `:${esc(f.line)}` : ''}</code></div>` : ''}
        ${f.detail ? `<p>${esc(f.detail)}</p>` : ''}
        ${f.evidence ? `<pre>${esc(f.evidence)}</pre>` : ''}
        ${f.recommendation ? `<p><strong>Recommendation:</strong> ${esc(f.recommendation)}</p>` : ''}
        ${f.statusNote ? `<p><strong>Since the previous review:</strong> ${esc(f.statusNote)}</p>` : ''}
      </div>`,
    )
    .join('');
}

/** Re-review mode: `review.previousReview` set and findings carry `status`. */
function reReviewSection(review) {
  if (!review.previousReview) return '';
  const findings = review.findings ?? [];
  const by = (s) => findings.filter((f) => f.status === s).length;
  return `<h3>Changes since the previous review</h3>
    <p class="muted">Previous review: ${esc(review.previousReview)}</p>
    <div class="tiles">
      <div class="tile t-passed"><div class="big">${by('fixed')}</div><div>fixed</div></div>
      <div class="tile t-flaky"><div class="big">${by('partially-fixed')}</div><div>partly fixed</div></div>
      <div class="tile t-failed"><div class="big">${by('open')}</div><div>still open</div></div>
      <div class="tile t-failed"><div class="big">${by('new')}</div><div>new</div></div>
    </div>`;
}

function checksSection(checks = []) {
  if (!checks.length) return '<p class="muted">No checks recorded.</p>';
  const areas = [...new Set(checks.map((c) => c.area))];
  return areas
    .map(
      (area) => `<h3>${esc(area)}</h3>
      <table>
        <thead><tr><th>Check</th><th>Result</th><th>Evidence</th></tr></thead>
        <tbody>${checks
          .filter((c) => c.area === area)
          .map(
            (c) =>
              `<tr><td>${esc(c.check)}</td><td>${pill(c.result)}</td><td>${esc(c.evidence)}</td></tr>`,
          )
          .join('')}</tbody>
      </table>`,
    )
    .join('');
}

function spotChecksSection(spotChecks = []) {
  if (!spotChecks.length) return '<p class="muted">No independent spot checks recorded.</p>';
  return `<table>
    <thead><tr><th>Ticket</th><th>Window / state</th><th>Metric</th><th>UI</th><th>Reviewer SQL</th><th>Suite oracle</th><th>Match</th></tr></thead>
    <tbody>${spotChecks
      .map(
        (s) => `<tr>
          <td>${esc(s.ticket)}</td><td>${esc(s.window)}</td><td>${esc(s.metric)}</td>
          <td>${esc(s.ui)}</td><td>${esc(s.sql)}</td><td>${esc(s.oracle)}</td>
          <td>${pill(s.match ? 'pass' : 'fail', s.match ? 'match' : 'mismatch')}</td>
        </tr>`,
      )
      .join('')}</tbody>
  </table>`;
}

const list = (items = []) =>
  items.length
    ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
    : '<p class="muted">None.</p>';

const kv = (obj = {}) =>
  `<table><tbody>${Object.entries(obj)
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join('')}</tbody></table>`;

function main() {
  const args = parseArgs(process.argv);
  const outFile = path.resolve(args.out);
  const outDir = path.dirname(outFile);
  const review = JSON.parse(fs.readFileSync(args.review, 'utf8'));
  const runs = args.results.map(({ label, file }) => {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { label, report, rows: collectTests(report, outDir) };
  });
  const main = summarise(runs[0].rows);
  const findings = review.findings ?? [];
  const sevCount = (s) => findings.filter((f) => f.severity === s).length;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(review.title ?? 'QA review')}</title>
<style>
  :root { --bg:#fff; --fg:#1d2330; --muted:#677085; --line:#e3e6ec; --card:#f7f8fa;
    --ok:#1f7a4d; --bad:#b42318; --warn:#b54708; --info:#175cd3; --na:#667085; }
  @media (prefers-color-scheme: dark) { :root { --bg:#14171d; --fg:#e6e8ec; --muted:#98a1b3;
    --line:#2b303a; --card:#1b1f27; --ok:#4ac285; --bad:#f2706a; --warn:#f0a35e; --info:#6ea8fe; --na:#98a1b3; } }
  body { font: 14px/1.5 system-ui, -apple-system, sans-serif; background:var(--bg); color:var(--fg);
    max-width: 1280px; margin: 0 auto; padding: 24px; }
  h1 { margin-bottom: 4px; } h2 { margin-top: 40px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 16px; }
  th, td { border-bottom: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; }
  th { color: var(--muted); font-weight: 600; } td.num { text-align: right; white-space: nowrap; }
  code { font-size: 12px; } pre { white-space: pre-wrap; font-size: 12px; background: var(--card); padding: 8px; overflow:auto; }
  .muted { color: var(--muted); }
  .pill { display:inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight:600;
    border: 1px solid currentColor; white-space: nowrap; }
  .pill.passed,.pill.pass,.pill.covered,.pill.asserted,.pill.approve { color: var(--ok); }
  .pill.failed,.pill.fail,.pill.blocker,.pill.not-covered,.pill.missing,.pill.changes-requested { color: var(--bad); }
  .pill.flaky,.pill.warn,.pill.major,.pill.partial,.pill.approve-with-comments { color: var(--warn); }
  .pill.known-defect,.pill.minor,.pill.empty-state-only,.pill.limited { color: var(--info); }
  .pill.suspected-defect,.pill.open,.pill.partially-fixed { color: var(--warn); }
  .pill.expected-fail,.pill.environment { color: var(--bad); }
  .pill.fixed { color: var(--ok); } .pill.new { color: var(--bad); }
  .pill.skipped,.pill.nit,.pill.n\\/a,.pill.not-tested-closed { color: var(--na); }
  .tiles { display:flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 8px 14px; min-width: 90px; }
  .tile .big { font-size: 22px; font-weight: 700; }
  .t-passed .big { color: var(--ok); } .t-failed .big { color: var(--bad); } .t-flaky .big { color: var(--warn); }
  .t-known-defect .big, .t-limited .big { color: var(--info); } .t-suspected-defect .big { color: var(--warn); }
  .t-expected-fail .big, .t-environment .big { color: var(--bad); }
  .t-skipped .big { color: var(--na); }
  .finding { border-left: 4px solid var(--line); background: var(--card); padding: 8px 12px; margin: 10px 0; }
  .sev-blocker { border-color: var(--bad); } .sev-major { border-color: var(--warn); }
  .sev-minor { border-color: var(--info); } .sev-nit { border-color: var(--na); }
  .verdict { font-size: 18px; margin: 12px 0; }
  details.ticket { border: 1px solid var(--line); border-radius: 8px; padding: 6px 12px; margin: 8px 0; }
  .filters button { font: inherit; padding: 2px 10px; border-radius: 6px; border: 1px solid var(--line);
    background: var(--card); color: var(--fg); cursor: pointer; }
  nav a { margin-right: 12px; }
  .env-alert { border: 2px solid var(--bad); border-radius: 8px; padding: 10px 14px; }
</style></head><body>
<h1>${esc(review.title ?? 'QA review')}</h1>
<div class="muted">Scope ${esc(review.scope)} · reviewed ${esc(review.reviewedAt ?? new Date().toISOString())}</div>
<div class="verdict">Verdict: ${pill(review.verdict ?? 'n/a')}</div>
<div class="tiles">
  <div class="tile t-passed"><div class="big">${main.passed}</div><div>passed</div></div>
  <div class="tile t-limited"><div class="big">${main.limited}</div><div>passed: limited by data</div></div>
  <div class="tile t-failed"><div class="big">${main.failed}</div><div>failed: new</div></div>
  <div class="tile t-known-defect"><div class="big">${main['known-defect']}</div><div>failed: known defect</div></div>
  <div class="tile t-suspected-defect"><div class="big">${main['suspected-defect']}</div><div>failed: suspected defect</div></div>
  <div class="tile t-flaky"><div class="big">${main.flaky}</div><div>flaky</div></div>
  ${main.environment ? `<div class="tile t-environment"><div class="big">${main.environment}</div><div>environment (app/DB down)</div></div>` : ''}
  ${main['expected-fail'] ? `<div class="tile t-expected-fail"><div class="big">${main['expected-fail']}</div><div>test.fail() (not allowed)</div></div>` : ''}
  <div class="tile t-skipped"><div class="big">${main.skipped}</div><div>skipped</div></div>
  <div class="tile"><div class="big">${sevCount('blocker')}/${sevCount('major')}/${sevCount('minor')}/${sevCount('nit')}</div><div>blocker/major/minor/nit</div></div>
</div>
<nav><a href="#summary">Summary</a><a href="#tickets">Tickets &amp; ACs</a><a href="#findings">Findings</a>
  <a href="#checks">Checks</a><a href="#spot">Spot checks</a><a href="#runs">Runs</a><a href="#gaps">Gaps</a><a href="#env">Environment</a></nav>

${main.environment ? `<p class="env-alert"><strong>Environment failure:</strong> ${main.environment} test(s) failed because the app or database was unreachable. Those results say nothing about the feature; restart the app and rerun.</p>` : ''}
<h2 id="summary">Summary</h2>
<p>${esc(review.summary).replace(/\n/g, '<br>')}</p>
${reReviewSection(review)}
<h3>Top recommendations</h3>${list(review.recommendations)}

<h2 id="tickets">Tickets and acceptance criteria</h2>${ticketsSection(review.tickets)}
<h2 id="findings">Findings</h2>${findingsSection(findings)}
<h2 id="checks">Review checklist</h2>${checksSection(review.checks)}
<h2 id="spot">Independent spot checks</h2>
<p class="muted">Values the reviewer re-derived with their own SQL, compared with the UI and the suite's oracle.</p>
${spotChecksSection(review.spotChecks)}
<h2 id="runs">Test runs</h2>
<p class="muted">From Playwright's JSON reporter. Artifact links point into test-results/ and are deleted by the next Playwright run.</p>
${runs.map(runSection).join('')}
<h2 id="gaps">Data gaps and not tested</h2>
<h3>Data gaps</h3>${list(review.dataGaps)}
<h3>Not tested by this review</h3>${list(review.notTested)}
<h2 id="env">Environment</h2>${kv(review.environment)}
<h3>Commands</h3><pre>${esc((review.commands ?? []).join('\n'))}</pre>
<script>
  document.querySelectorAll('.filters').forEach((bar) => {
    const table = document.getElementById(bar.dataset.table);
    bar.addEventListener('click', (e) => {
      const f = e.target.dataset && e.target.dataset.filter; if (!f) return;
      table.querySelectorAll('tbody tr').forEach((tr) => {
        tr.style.display = f === 'all' || tr.dataset.outcome === f ? '' : 'none';
      });
    });
  });
</script>
</body></html>`;

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, html);
  console.log(`Wrote ${outFile}`);
  console.log(`Main run: ${JSON.stringify(main)}; findings: ${findings.length}`);
}

main();
