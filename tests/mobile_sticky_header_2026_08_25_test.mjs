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
  'GOOD', 'Sticky Header QA', '01274 123456', 'https://example.com/', '', '', '', '', '', '', '', '', '',
  'Long research note keeps the lead card tall enough for a genuine mobile scroll test.',
  'GOOD', 'Independent gym', 'QA-STICKY-001', 'Complete', 'GOOD', '84', 'QA only', '1'
];
const csv = `${headers.join(',')}\r\n${row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')}\r\n`;

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
});

try {
  const context = await browser.newContext({ viewport: { width: 430, height: 844 } });
  const page = await context.newPage();
  await page.goto(appUrl, { waitUntil: 'load' });
  await page.locator('#setup-preset-button').click();
  await page.locator('.setup-dd-opt[data-name="Sandde"]').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('#csv-in').setInputFiles({
    name: 'sticky_header_qa.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv)
  });
  await page.locator('#map-modal').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Import leads', exact: true }).click();
  await page.locator('#main-app').waitFor({ state: 'visible' });

  const before = await page.locator('.sticky-top').evaluate(element => ({
    position: getComputedStyle(element).position,
    top: element.getBoundingClientRect().top
  }));
  await page.evaluate(() => window.scrollTo(0, Math.min(700, document.documentElement.scrollHeight - window.innerHeight)));
  await page.waitForTimeout(100);
  const after = await page.locator('.sticky-top').evaluate(element => ({
    top: element.getBoundingClientRect().top,
    scrollY: window.scrollY
  }));

  assert.equal(before.position, 'sticky', `mobile header is not configured as sticky: ${JSON.stringify(before)}`);
  assert(after.scrollY > 150, `page did not scroll far enough to test sticky behaviour: ${JSON.stringify(after)}`);
  assert(Math.abs(after.top) <= 1, `mobile header moved off-screen after scrolling: ${JSON.stringify({ before, after })}`);

  await context.close();
  console.log('Mobile sticky-header behaviour passed');
} finally {
  await browser.close();
}
