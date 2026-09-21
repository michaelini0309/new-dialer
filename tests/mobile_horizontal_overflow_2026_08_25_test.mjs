import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../lead_screen_mobile_prototype_2026-08-25/package.json', import.meta.url));
const { chromium } = require('playwright');
const appUrl = new URL('../aresfit-dialer-sandde-v2.html', import.meta.url).href;

const headers = [
  'FINAL PRIORITY', 'Business Name', 'Phone', 'Website', 'Status', 'Stage', 'Notes',
  'Follow-up Date', 'Equipment Brands', 'AresFit Brands', 'PSC / Decision Maker', 'Email',
  'Call Angle', 'Research Notes', 'Lead Priority', 'Segment', 'Lead_ID', 'Research Status',
  'Verified', 'Viability Score', 'Verification Notes', 'Sort'
];
const row = [
  'GOOD', '606 Strength & Conditioning', '01274 123456',
  'https://606strengthandconditioning.co.uk/', '', '', '', '', '', '', '', '', '',
  'Source: AresFit_Call_Sheet_Thursday_NEW_LEADS_MINUS_SANDDE_1405.csv | Source note: Location: Bradford | Batch: Best ready core gyms - use first | Lead tier: A_STRICT_OR_STRONG_GYM | Source: Latest_Apify_CH_ExactMatch | Line type: MOBILE',
  'GOOD', 'Independent gym', 'QA-OVERFLOW-001', 'Complete', 'GOOD', '84', 'QA only', '1'
];
const csv = `${headers.join(',')}\r\n${row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')}\r\n`;

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
});

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(appUrl, { waitUntil: 'load' });
  await page.locator('#setup-preset-button').click();
  await page.locator('.setup-dd-opt[data-name="Sandde"]').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('#csv-in').setInputFiles({
    name: 'photographed_mobile_overflow.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv)
  });
  await page.locator('#map-modal').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Import leads', exact: true }).click();
  await page.locator('#main-app').waitFor({ state: 'visible' });

  const before = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    researchScrollWidth: document.querySelector('.research-first')?.scrollWidth || 0,
    researchClientWidth: document.querySelector('.research-first')?.clientWidth || 0
  }));
  await page.evaluate(() => window.scrollTo(100, 0));
  await page.waitForTimeout(50);
  const horizontalPosition = await page.evaluate(() => window.scrollX);

  assert.equal(
    Math.max(before.bodyScrollWidth, before.documentScrollWidth),
    before.innerWidth,
    `mobile page is horizontally wider than its viewport: ${JSON.stringify(before)}`
  );
  assert.equal(horizontalPosition, 0, `mobile page can be panned sideways by ${horizontalPosition}px`);
  assert(before.researchScrollWidth <= before.researchClientWidth + 1, `research panel overflows: ${JSON.stringify(before)}`);

  await context.close();
  console.log('Mobile long-text containment passed');
} finally {
  await browser.close();
}
