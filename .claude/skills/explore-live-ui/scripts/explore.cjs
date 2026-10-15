/**
 * Logs into the wisersite admin, opens a board and dumps what a test author needs: the final
 * URL, the accessibility tree (from the board's <h1> down), every /api/widgets request with its
 * query params, and persisted localStorage. Never saves or edits anything in the app.
 *
 *   node .claude/skills/explore-live-ui/scripts/explore.cjs --path /analytics/source-to-hire \
 *     [--preset "Last 6 months"] [--range 2026-07-21:2026-07-31] \
 *     [--select "Hires Trend by Source|Time period=last-12-months"] [--hover "role=group"] \
 *     [--compare-presets "Source Performance Breakdown|Time period|sourcePerformanceBreakdown"] \
 *     [--out /tmp/<KEY>-explore] [--headed]
 *
 * --select may repeat: "<widget h3 heading>|<combobox accessible name>=<option value>".
 * --compare-presets "<h3 heading>|<combobox name>|<widget key>": applies each global preset and
 *   each of the widget's own period options, records the window the widget requests for each,
 *   and flags any widget option whose window differs from the global preset with the same label.
 *   It also prints the option labels so they can be compared with the ticket's wording.
 */
const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });
const { chromium } = require('@playwright/test');

function parseArgs(argv) {
  const args = { select: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '');
    if (key === 'headed') args.headed = true;
    else if (key === 'select') args.select.push(argv[++i]);
    else args[key] = argv[++i];
  }
  return args;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const longMonthYear = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]}, ${iso.slice(0, 4)}`;
const ordinal = (d) =>
  `${d}${d % 100 >= 11 && d % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][d % 10] || 'th'}`;

async function pickDay(dialog, iso) {
  const panel = dialog.getByRole('listbox', { name: `Month ${longMonthYear(iso)}`, exact: true });
  for (let i = 0; i < 48 && !(await panel.isVisible()); i += 1) {
    const shown = (await dialog.getByRole('listbox').first().getAttribute('aria-label')) || '';
    const [, month, year] = /Month (\w+), (\d{4})/.exec(shown) || [];
    const shownKey = `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}`;
    await dialog
      .getByRole('button', { name: shownKey > iso.slice(0, 7) ? 'Previous month' : 'Next month' })
      .click();
  }
  const label = `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${ordinal(Number(iso.slice(8, 10)))}, ${iso.slice(0, 4)}`;
  await panel.getByRole('option', { name: new RegExp(`${label}$`) }).click();
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.path) throw new Error('--path is required, e.g. --path /analytics/source-to-hire');
  const out = args.out || '/tmp/e2e-explore';
  fs.mkdirSync(out, { recursive: true });

  const browser = await chromium.launch({ headless: !args.headed });
  const page = await browser.newPage({
    baseURL: process.env.WISERSITE_BASE_URL || 'http://localhost:3000',
  });
  const requests = [];
  const widgetCalls = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.pathname.includes('/api/widgets/')) {
      requests.push(`${url.pathname.replace(/^.*\/api/, '/api')}${url.search}`);
      widgetCalls.push({
        key: url.pathname.split('/api/widgets/')[1],
        params: Object.fromEntries(url.searchParams),
      });
    }
  });
  const lastWindow = (key) => {
    const call = [...widgetCalls].reverse().find((c) => c.key === key);
    return call ? `${call.params.startDate ?? '?'}..${call.params.endDate ?? '?'}` : '(no request)';
  };

  await page.goto('/admin');
  await page.locator('#field-email').waitFor({ timeout: 60_000 });
  await page.fill('#field-email', process.env.ADMIN_EMAIL);
  await page.fill('#field-password', process.env.ADMIN_PASSWORD);
  await page.click('.form-submit button');
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30_000 });

  const response = await page.goto(args.path);
  const h1 = page.getByRole('heading', { level: 1 }).first();
  await h1.waitFor({ timeout: 60_000 }).catch(() => {});
  console.log(
    `URL ${page.url()} (HTTP ${response && response.status()}) h1=${JSON.stringify(await h1.textContent().catch(() => null))}`,
  );
  await page.waitForTimeout(4_000);

  const dialog = page.getByRole('dialog', { name: 'Select date range' });
  const trigger = page
    .locator('button', { hasText: /\d{1,2} \w{3} \d{4}\s*[–-]\s*\d{1,2} \w{3} \d{4}/ })
    .first();
  if (args.preset || args.range) {
    await trigger.click();
    if (args.preset) await dialog.getByRole('button', { name: args.preset, exact: true }).click();
    if (args.range) {
      const [start, end] = args.range.split(':');
      await pickDay(dialog, start);
      await pickDay(dialog, end);
    }
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForTimeout(4_000);
  }

  for (const spec of args.select) {
    const [heading, assignment] = spec.split('|');
    const [name, value] = assignment.split('=');
    await page
      .getByRole('heading', { level: 3, name: heading, exact: true })
      .locator('xpath=ancestor::*[.//select][1]')
      .getByRole('combobox', { name })
      .selectOption(value);
    await page.waitForTimeout(2_000);
  }

  if (args['compare-presets']) {
    const [heading, comboName, key] = args['compare-presets'].split('|');
    const combo = page
      .getByRole('heading', { level: 3, name: heading, exact: true })
      .locator('xpath=ancestor::*[.//select][1]')
      .getByRole('combobox', { name: comboName });
    const options = await combo
      .locator('option')
      .evaluateAll((els) => els.map((e) => ({ value: e.value, label: e.textContent.trim() })));
    const globalPresets = ['Last 30 days', 'Last 3 months', 'Last 6 months', 'Last 12 months'];
    const rows = [];
    for (const preset of globalPresets) {
      await trigger.click();
      await dialog.getByRole('button', { name: preset, exact: true }).click();
      await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await page.waitForTimeout(3_000);
      rows.push({ label: preset, global: lastWindow(key) });
    }
    for (const option of options) {
      const row = rows.find((r) => r.label === option.label);
      if (!row) continue;
      await combo.selectOption(option.value);
      await page.waitForTimeout(2_500);
      row.widget = lastWindow(key);
    }
    console.log(`\n## Preset comparison: ${heading} (${key})`);
    console.log(`Option labels: ${options.map((o) => `${o.label} [${o.value}]`).join(' | ')}`);
    console.log(
      '| Label | Global preset window | Widget option window | Verdict |\n|---|---|---|---|',
    );
    for (const r of rows) {
      const verdict = !r.widget
        ? 'no widget option with this label'
        : r.widget === r.global
          ? 'same'
          : 'DIFFERENT: discrepancy candidate';
      console.log(`| ${r.label} | ${r.global} | ${r.widget ?? '-'} | ${verdict} |`);
    }
  }

  if (args.hover) {
    await page
      .locator(args.hover)
      .first()
      .hover()
      .catch((e) => console.log(`hover failed: ${e.message}`));
    await page.waitForTimeout(500);
  }

  const snapshot = await page.locator('body').ariaSnapshot();
  const start = snapshot.indexOf('heading "', snapshot.indexOf('[level=1]') - 80);
  const board = start > 0 ? snapshot.slice(start) : snapshot;
  // Calendar day options are noise unless you are working on the picker itself.
  console.log(
    '\n## Accessibility tree\n' +
      board
        .split('\n')
        .filter((l) => !/- option "Choose /.test(l))
        .join('\n'),
  );
  console.log('\n## Widget requests (in order)\n' + [...new Set(requests)].join('\n'));
  console.log(
    '\n## localStorage\n' + (await page.evaluate(() => JSON.stringify(localStorage, null, 2))),
  );
  const shot = path.join(out, `${args.path.replace(/\W+/g, '_')}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`\nScreenshot: ${shot}`);
  await browser.close();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
