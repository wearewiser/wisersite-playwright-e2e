#!/usr/bin/env node
/**
 * Business-facing test coverage report: every check in plain language and what it found.
 *
 *   node .claude/skills/qa-business-report/scripts/build-business-report.cjs \
 *     --results /tmp/<SCOPE>-review/run-main.json \
 *     --context docs/test-plans/<KEY>.business.json \
 *     --out reports/business/<YYYY-MM-DD>-<scope>-test-coverage.html
 *
 * Everything per test comes from the run and the tests' own annotations
 * (src/utils/playwright/test-annotations.ts): `title` / `what` / `variant` for the wording, the
 * first `ac` for the area, and the runtime labels for the result. The context file only adds
 * area names and intros, the "needs attention" cards and optional extra notes per check:
 *
 *   { "title", "eyebrow", "lead", "environment",
 *     "sections": [{ "ticket": "WP23-87", "name": "Summary statistics", "intro": "…" }],
 *     "issues": [{ "kind": "known|suspected|data|new", "title", "body", "next" }],
 *     "notes": { "<check title>": "extra note" } }
 *
 * Status per test: passed → Verified; passed + limited-by-data → Partly verified; failed +
 * known-defect → Known issue; failed + suspected-defect → Needs a decision; failed with no label →
 * New failure; app/DB unreachable → Not run (environment); skipped → Not run yet; flaky → Flaky.
 * Read-only apart from --out.
 */
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  for (const k of ['results', 'context', 'out'])
    if (!args[k]) throw new Error(`--${k} is required`);
  return args;
}

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const STATUS = {
  ok: ['Verified', '✓', 'Checked and correct'],
  limited: [
    'Partly verified',
    '◐',
    'Passed, but today’s data could only exercise the zero / empty case',
  ],
  known: ['Known issue', '!', 'Fails on a problem that is already logged'],
  fail: ['Needs a decision', '✕', 'Fails on a suspected new issue, awaiting a product decision'],
  new: [
    'New failure',
    '✕',
    'Fails, and the failure is not a known or suspected issue: investigate',
  ],
  flaky: ['Flaky', '~', 'Passed only on a retry'],
  env: ['Not run (environment)', '⚠', 'The app or database was unreachable'],
  notrun: ['Not run yet', '○', 'Skipped: needs data that doesn’t exist yet'],
};
const ORDER = ['ok', 'limited', 'known', 'fail', 'new', 'flaky', 'env', 'notrun'];
const WORST = ['new', 'fail', 'known', 'env', 'flaky', 'notrun', 'limited', 'ok'];
const ENVIRONMENT_ERROR = /ERR_CONNECTION_REFUSED|ECONNREFUSED|ECONNRESET|net::ERR_|ENVIRONMENT:/;

function collect(run) {
  const tests = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        const ann = [...(t.annotations ?? []), ...results.flatMap((r) => r.annotations ?? [])];
        const get = (type) => ann.filter((a) => a.type === type).map((a) => a.description ?? '');
        const errors = results.flatMap((r) => (r.errors ?? []).map((e) => e.message ?? ''));
        let status = 'ok';
        if (t.status === 'skipped') status = 'notrun';
        else if (t.status === 'flaky') status = 'flaky';
        else if (t.status === 'unexpected') {
          if (errors.length && errors.every((e) => ENVIRONMENT_ERROR.test(e))) status = 'env';
          else if (get('known-defect').length) status = 'known';
          else if (get('suspected-defect').length) status = 'fail';
          else status = 'new';
        } else if (get('limited-by-data').length) status = 'limited';
        const notes = [
          ...get('limited-by-data'),
          ...get('known-defect').map((d) => `Logged as ${d}`),
          ...get('suspected-defect').map((d) => `Suspected issue ${d}`),
          ...get('skip').filter(Boolean),
        ];
        tests.push({
          project: t.projectName,
          ac: get('ac'),
          title: get('title')[0] ?? spec.title,
          what: get('what')[0] ?? '',
          variant: get('variant')[0] ?? null,
          status,
          notes,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const s of run.suites ?? []) walk(s);
  return tests;
}

const countOf = (tests) => {
  const c = Object.fromEntries(ORDER.map((k) => [k, 0]));
  for (const t of tests) c[t.status] += 1;
  return c;
};
const worst = (tests) => WORST.find((k) => tests.some((t) => t.status === k)) ?? 'ok';

function badge(status, text) {
  const [label, icon] = STATUS[status];
  return `<span class="badge s-${status}"><span class="ico" aria-hidden="true">${icon}</span>${esc(text ?? label)}</span>`;
}

function bar(c, total, big = false) {
  const segs = ORDER.filter((k) => c[k])
    .map(
      (k) =>
        `<div class="seg s-${k}" style="flex:${c[k]}" title="${STATUS[k][0]}: ${c[k]} of ${total}">${big || c[k] / total > 0.08 ? c[k] : ''}</div>`,
    )
    .join('');
  const label = ORDER.filter((k) => c[k])
    .map((k) => `${STATUS[k][0]} ${c[k]}`)
    .join(', ');
  return `<div class="bar${big ? ' big' : ''}" role="img" aria-label="${esc(label)}">${segs}</div>`;
}

function main() {
  const args = parseArgs(process.argv);
  const ctx = JSON.parse(fs.readFileSync(args.context, 'utf8'));
  const tests = collect(JSON.parse(fs.readFileSync(args.results, 'utf8')));
  const total = tests.length;
  const c = countOf(tests);

  // Areas: context order first, then any ticket the context didn't name.
  const areaOf = (t) => (t.ac[0] ?? '').split(' ')[0] || 'other';
  const named = (ctx.sections ?? []).map((s) => s.ticket);
  const keys = [...new Set([...named, ...tests.map(areaOf)])].filter((k) =>
    tests.some((t) => areaOf(t) === k),
  );
  const areaInfo = (k) =>
    (ctx.sections ?? []).find((s) => s.ticket === k) ?? { name: k, intro: '' };

  const tiles = ORDER.filter(
    (k) => c[k] || ['ok', 'limited', 'known', 'fail', 'notrun'].includes(k),
  )
    .map(
      (k) =>
        `<div class="tile"><div class="tile-top">${badge(k)}</div><div class="num">${c[k]}</div><div class="tile-desc">${esc(STATUS[k][2])}</div></div>`,
    )
    .join('');
  const legend = ORDER.filter((k) => c[k])
    .map((k) => `<span class="leg"><span class="sw s-${k}"></span>${STATUS[k][0]}</span>`)
    .join('');

  const overview = keys
    .map((k) => {
      const ts = tests.filter((t) => areaOf(t) === k);
      const info = areaInfo(k);
      return `<a class="ov-row" href="#area-${esc(k)}"><div class="ov-name"><strong>${esc(info.name)}</strong><span class="muted">${esc(k)} · ${ts.length} checks</span></div>${bar(countOf(ts), ts.length)}</a>`;
    })
    .join('');

  const KIND = { known: 'known', suspected: 'fail', data: 'limited', new: 'new' };
  const KIND_LABEL = {
    known: 'Known issue',
    suspected: 'Needs a decision',
    data: 'Data gap',
    new: 'New failure',
  };
  const issues = (ctx.issues ?? [])
    .map(
      (i) =>
        `<div class="issue i-${KIND[i.kind] ?? 'limited'}"><div class="issue-head">${badge(KIND[i.kind] ?? 'limited', KIND_LABEL[i.kind] ?? i.kind)}<h3>${esc(i.title)}</h3></div><p>${esc(i.body)}</p>${i.next ? `<p class="next"><strong>Next step:</strong> ${esc(i.next)}</p>` : ''}</div>`,
    )
    .join('');
  const newFailures = tests.filter((t) => t.status === 'new');
  const envFailures = tests.filter((t) => t.status === 'env');
  const alerts = [
    envFailures.length
      ? `<div class="issue i-env"><div class="issue-head">${badge('env')}<h3>${envFailures.length} checks couldn’t run</h3></div><p>The app or database was unreachable during the run, so these results say nothing about the dashboard.</p><p class="next"><strong>Next step:</strong> restart the app and run the checks again.</p></div>`
      : '',
    newFailures.length
      ? `<div class="issue i-new"><div class="issue-head">${badge('new')}<h3>${newFailures.length} new failure(s)</h3></div><p>${esc([...new Set(newFailures.map((t) => t.title))].join('; '))}</p><p class="next"><strong>Next step:</strong> the QA team investigates before release.</p></div>`
      : '',
  ].join('');

  const sections = keys
    .map((k) => {
      const ts = tests.filter((t) => areaOf(t) === k);
      const info = areaInfo(k);
      const groups = [...new Set(ts.map((t) => t.title))].map((title) =>
        ts.filter((t) => t.title === title),
      );
      const rows = groups
        .map((g) => {
          const multi = g.length > 1 || g[0].variant;
          const result = multi
            ? `<ul class="chips">${g.map((t) => `<li>${badge(t.status, t.variant ?? STATUS[t.status][0])}</li>`).join('')}</ul>`
            : badge(g[0].status);
          const notes = [
            ...new Set([
              ...(ctx.notes?.[g[0].title] ? [ctx.notes[g[0].title]] : []),
              ...g.flatMap((t) => t.notes),
            ]),
          ];
          return `<tr class="w-${worst(g)}"><td class="t-title"><strong>${esc(g[0].title)}</strong>${g[0].what ? `<div class="muted">${esc(g[0].what)}</div>` : ''}${notes.map((n) => `<div class="note">${esc(n)}</div>`).join('')}</td><td class="t-res">${result}</td><td class="t-cnt">${g.length}</td></tr>`;
        })
        .join('');
      return `<section class="card" id="area-${esc(k)}"><div class="sec-head"><div><span class="ticket">${esc(k)}</span><h2>${esc(info.name)}</h2><p class="muted">${esc(info.intro)}</p></div><div class="sec-bar">${bar(countOf(ts), ts.length)}<div class="muted small">${ts.length} checks</div></div></div><table><thead><tr><th>What is tested</th><th>Result today</th><th class="t-cnt">Checks</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    })
    .join('');

  const passed = c.ok + c.limited;
  const failed = c.known + c.fail + c.new;
  const date = new Date().toISOString().slice(0, 10);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ctx.title ?? 'What we test')}</title><style>${CSS}</style></head><body><div class="wrap">
<header class="hero"><div class="eyebrow">${esc(ctx.eyebrow ?? 'Test coverage report')}</div><h1>${esc(ctx.title ?? 'What we test')}</h1>
<p class="lead">${esc(ctx.lead ?? 'Every automated check in plain language: what it checks, and what it found today.')}</p>
<div class="meta"><span>Run on ${date}</span><span>${total} automated checks</span><span>${esc(ctx.environment ?? '')}</span></div></header>
<section class="card"><div class="headline"><span class="big">${c.ok} of ${total}</span><span class="muted">checks fully verified.${c.limited ? ` ${c.limited} more passed but could only check the zero / empty case.` : ''}</span></div>
${bar(c, total, true)}<div class="legend">${legend}</div><div class="tiles">${tiles}</div></section>
<section class="card"><h2>By area</h2><p class="muted" style="margin-top:0">Click an area to see its checks.</p>${overview}</section>
${alerts || issues ? `<h2 style="margin-top:34px">What needs attention</h2><div class="issues">${alerts}${issues}</div>` : ''}
<h2 style="margin-top:34px">Every check, by area</h2>${sections}
<section class="card"><h2>How the checks work</h2><div class="how">
<div><span class="step">1</span><strong>Use the page like a person</strong>An automated browser logs in, opens the dashboard, picks dates, sorts tables and hovers over charts.</div>
<div><span class="step">2</span><strong>Work out the right answer separately</strong>Expected figures come straight from the database and the rules in each Jira ticket, never from the dashboard itself.</div>
<div><span class="step">3</span><strong>Compare and report</strong>Any difference is a failure. Known issues stay red but are labelled with their bug ID, so they’re easy to tell apart from new problems. Each check is retried to rule out flukes.</div>
</div></section>
<footer>Run results: ${passed} passed${c.limited ? ` (${c.limited} limited by data)` : ''}, ${failed} failed (${c.known} known issue, ${c.fail} awaiting a decision, ${c.new} new), ${c.notrun} skipped, ${c.flaky} flaky${c.env ? `, ${c.env} not run (environment)` : ''}.</footer>
</div></body></html>`;

  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, html);
  console.log(`Wrote ${args.out}: ${JSON.stringify(c)}`);
}

const CSS = `
:root{color-scheme:light;--bg:#f4f3ef;--surface:#fcfcfb;--line:#e4e2dc;--text:#0b0b0b;--text-2:#52514e;--muted:#6e6d68;--accent:#2a78d6;
--good:#0ca30c;--warning:#fab219;--serious:#ec835a;--critical:#d03b3b;--none:#9a9890;
--good-bg:#e7f5e7;--warning-bg:#fdf3dc;--serious-bg:#fcebe3;--critical-bg:#f9e3e3;--none-bg:#eeede9;
--good-ink:#006300;--warning-ink:#7a5200;--serious-ink:#9a3d17;--critical-ink:#a52222;--none-ink:#52514e}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#121211;--surface:#1a1a19;--line:#2e2e2b;--text:#f0efec;--text-2:#c3c2b7;--muted:#9d9c93;--accent:#3987e5;
--good-bg:#16301a;--warning-bg:#3a2e12;--serious-bg:#3b2219;--critical-bg:#3a1c1c;--none-bg:#262624;
--good-ink:#7fd67f;--warning-ink:#f6cf72;--serious-ink:#f3a98a;--critical-ink:#f08f8f;--none-ink:#c3c2b7}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:40px 24px 64px}header.hero{margin-bottom:28px}
.eyebrow{color:var(--accent);font-weight:600;letter-spacing:.06em;text-transform:uppercase;font-size:12px}
h1{font-size:34px;line-height:1.15;margin:6px 0 10px;letter-spacing:-.01em}h2{font-size:22px;margin:4px 0 6px}h3{font-size:16px;margin:0}
.lead{font-size:17px;color:var(--text-2);max-width:780px;margin:0}.meta{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:16px;color:var(--muted);font-size:13px}
.muted{color:var(--muted)}.small{font-size:12px}.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:24px;margin:18px 0}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:18px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.tile .num{font-size:34px;font-weight:700;line-height:1.1;margin:8px 0 4px}.tile-desc{color:var(--muted);font-size:12.5px;line-height:1.4}
.headline{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.headline .big{font-size:44px;font-weight:750;letter-spacing:-.02em}
.bar{display:flex;gap:2px;height:12px;border-radius:6px;overflow:hidden;background:var(--surface);min-width:180px}
.bar.big{height:30px;border-radius:8px;margin:14px 0 10px}.seg{display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#0b0b0b}
.bar:not(.big) .seg{font-size:0}
.seg.s-ok{background:var(--good);color:#fff}.seg.s-limited{background:var(--warning)}.seg.s-known{background:var(--serious)}
.seg.s-fail,.seg.s-new{background:var(--critical);color:#fff}.seg.s-flaky{background:var(--warning)}.seg.s-env,.seg.s-notrun{background:var(--none);color:#fff}
.legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:var(--text-2)}.leg{display:inline-flex;align-items:center;gap:6px}
.sw{width:12px;height:12px;border-radius:3px;display:inline-block}
.sw.s-ok{background:var(--good)}.sw.s-limited,.sw.s-flaky{background:var(--warning)}.sw.s-known{background:var(--serious)}.sw.s-fail,.sw.s-new{background:var(--critical)}.sw.s-env,.sw.s-notrun{background:var(--none)}
.badge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px 3px 6px;border-radius:999px;font-size:12.5px;font-weight:600;white-space:nowrap}
.badge .ico{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;font-size:11px;color:#fff}
.badge.s-ok{background:var(--good-bg);color:var(--good-ink)}.badge.s-ok .ico{background:var(--good)}
.badge.s-limited,.badge.s-flaky{background:var(--warning-bg);color:var(--warning-ink)}.badge.s-limited .ico,.badge.s-flaky .ico{background:var(--warning);color:#0b0b0b}
.badge.s-known{background:var(--serious-bg);color:var(--serious-ink)}.badge.s-known .ico{background:var(--serious);color:#0b0b0b}
.badge.s-fail,.badge.s-new{background:var(--critical-bg);color:var(--critical-ink)}.badge.s-fail .ico,.badge.s-new .ico{background:var(--critical)}
.badge.s-notrun,.badge.s-env{background:var(--none-bg);color:var(--none-ink)}.badge.s-notrun .ico,.badge.s-env .ico{background:var(--none)}
.ov-row{display:grid;grid-template-columns:300px 1fr;gap:16px;align-items:center;padding:10px 0;border-top:1px solid var(--line);color:inherit;text-decoration:none}
.ov-row:first-of-type{border-top:0}.ov-row:hover strong{color:var(--accent)}.ov-name{display:flex;flex-direction:column}.ov-name .muted{font-size:12.5px}
.issues{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.issue{background:var(--surface);border:1px solid var(--line);border-top:4px solid var(--warning);border-radius:12px;padding:16px 18px}
.issue.i-known{border-top-color:var(--serious)}.issue.i-fail,.issue.i-new{border-top-color:var(--critical)}.issue.i-env{border-top-color:var(--none)}
.issue-head{display:flex;flex-direction:column;gap:8px;align-items:flex-start;margin-bottom:6px}.issue p{margin:8px 0 0;color:var(--text-2);font-size:14px}.issue .next{color:var(--text)}
.sec-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:12px}.sec-head p{margin:0;max-width:640px}
.sec-bar{width:220px;flex:none;text-align:right;padding-top:28px}.sec-bar .small{margin-top:6px}
.ticket{font-size:12px;font-weight:700;color:var(--accent);letter-spacing:.04em}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600;padding:10px 12px;border-bottom:1px solid var(--line)}
td{padding:14px 12px;border-bottom:1px solid var(--line);vertical-align:top}tbody tr:last-child td{border-bottom:0}
td.t-title{width:58%}td.t-title .muted{font-size:13.5px;margin-top:3px}
.note{margin-top:8px;font-size:13px;color:var(--text-2);padding-left:10px;border-left:3px solid var(--line)}
tr.w-fail .note,tr.w-new .note{border-left-color:var(--critical)}tr.w-known .note{border-left-color:var(--serious)}tr.w-limited .note,tr.w-flaky .note{border-left-color:var(--warning)}tr.w-notrun .note,tr.w-env .note{border-left-color:var(--none)}
.t-cnt{text-align:right;width:70px;color:var(--muted)}.chips{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.how{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.how div{font-size:14px;color:var(--text-2)}.how strong{display:block;color:var(--text);margin-bottom:4px;font-size:15px}
.step{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;font-weight:700;font-size:13px;margin-bottom:8px}
footer{color:var(--muted);font-size:12.5px;margin-top:28px}
@media (max-width:860px){.how{grid-template-columns:1fr}.ov-row{grid-template-columns:1fr}.sec-head{flex-direction:column}.sec-bar{width:100%;text-align:left;padding-top:0}}
@media print{body{background:#fff}.card,.tile,.issue{break-inside:avoid}}`;

main();
