#!/usr/bin/env node
/**
 * Runs Playwright in a timezone whose calendar date differs from UTC's right now.
 *
 *   npm run test:tz:offday -- <spec> [playwright args]
 *
 * Fixed zones like Pacific/Auckland only disagree with UTC on the date for part of the day,
 * so a run at the wrong hour proves nothing. At any moment one of these two does:
 *  - Pacific/Kiritimati (UTC+14) is a day ahead from 10:00 UTC to midnight UTC;
 *  - Pacific/Pago_Pago (UTC-11) is a day behind from midnight UTC to 11:00 UTC.
 * Picks the one with the most off-day time left, refuses to start with less than
 * MIN_MINUTES left, sets TZ (Node: the oracle's date maths) and TEST_TZ (the browser), and
 * says at the end whether the dates still differed, since only then did the run test anything.
 * Exits non-zero when they no longer did (OFF_DAY_LOST_EXIT), even if every test passed: such
 * a run hasn't proved the off-day case.
 */
const { spawnSync } = require('child_process');

const MIN_MINUTES = 30;
const OFF_DAY_LOST_EXIT = 3;
const ZONES = [
  { zone: 'Pacific/Kiritimati', offDayUntilUtcMinute: 24 * 60, fromUtcMinute: 10 * 60 },
  { zone: 'Pacific/Pago_Pago', offDayUntilUtcMinute: 11 * 60, fromUtcMinute: 0 },
];

const dateIn = (zone, at = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zone, dateStyle: 'short' }).format(at);
const utcMinute = (at) => at.getUTCHours() * 60 + at.getUTCMinutes();

const now = new Date();
const minute = utcMinute(now);
const candidates = ZONES.filter((z) => minute >= z.fromUtcMinute && minute < z.offDayUntilUtcMinute)
  .map((z) => ({ ...z, minutesLeft: z.offDayUntilUtcMinute - minute }))
  .sort((a, b) => b.minutesLeft - a.minutesLeft);
const pick = candidates[0];

const serverZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const describe = (at) =>
  `local ${dateIn(pick.zone, at)} (${pick.zone}), UTC ${dateIn('UTC', at)}, ` +
  `this machine / app server ${dateIn(serverZone, at)} (${serverZone})`;

if (!pick || pick.minutesLeft < MIN_MINUTES) {
  console.error(
    `ENVIRONMENT: no off-day zone has ${MIN_MINUTES}+ minutes left at ${now.toISOString()}. ` +
      'This only happens from 23:30 to 00:00 UTC: run again after midnight UTC.',
  );
  process.exit(2);
}

console.log(`Off-day run: ${describe(now)}; ${pick.minutesLeft} min of off-day time left.`);
const result = spawnSync(
  'npx',
  [
    'playwright',
    'test',
    '-c',
    'playwright.wisersite.config.ts',
    '--project=chromium',
    ...process.argv.slice(2),
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, TZ: pick.zone, TEST_TZ: pick.zone },
    shell: process.platform === 'win32',
  },
);

const end = new Date();
const testsStatus = result.status ?? 1;
if (dateIn(pick.zone, end) === dateIn('UTC', end)) {
  console.error(
    `\nOFF-DAY LOST: by the end of the run the dates matched (${describe(end)}). ` +
      'Tests that ran after the switch did not test the off-day case; rerun later.',
  );
  process.exit(testsStatus === 0 ? OFF_DAY_LOST_EXIT : testsStatus);
}
console.log(`\nOff-day held for the whole run: ${describe(end)}.`);
process.exit(testsStatus);
