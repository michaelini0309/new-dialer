import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadFixture(page, htmlPath, fixturePath) {
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.locator('#setup-modal').waitFor({ state: 'visible' });
  await page.locator('.setup-dd-btn').click();
  await page.locator('.setup-dd-opt[data-name="Sandde"]').click();
  await page.locator('#setup-modal button[onclick="saveSetup()"]').click();
  await page.locator('#upload-screen').waitFor({ state: 'visible' });
  await page.locator('#csv-in').setInputFiles(fixturePath);
  await page.locator('#map-modal').waitFor({ state: 'visible' });
  await page.locator('#map-modal button[onclick="confirmImport()"]').click();
  await page.locator('#main-app').waitFor({ state: 'visible' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
}

async function captureVersion(browser, { htmlPath, fixturePath, outputDir, prefix }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await loadFixture(page, htmlPath, fixturePath);
    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      visibleBusiness: document.querySelector('.biz-head')?.textContent?.trim() || '',
    }));
    check(layout.documentWidth <= layout.viewportWidth, `${prefix} has horizontal overflow`);
    check(layout.visibleBusiness.includes('QA FRESH FITNESS'), `${prefix} did not load the expected lead`);

    const mainPath = join(outputDir, `${prefix}-main-390x844.png`);
    await page.screenshot({ path: mainPath });

    await page.locator('button[onclick="openSettings()"]').first().click();
    await page.locator('#settings-modal').waitFor({ state: 'visible' });
    const settingsPath = join(outputDir, `${prefix}-settings-390x844.png`);
    await page.screenshot({ path: settingsPath });

    check(statSync(mainPath).size > 12000, `${prefix} main screenshot is blank or too small`);
    check(statSync(settingsPath).size > 12000, `${prefix} settings screenshot is blank or too small`);
    check(errors.length === 0, `${prefix} page errors: ${errors.join(' | ')}`);
    return { mainPath, settingsPath, layout, errors };
  } finally {
    await context.close();
  }
}

function comparisonHtml(baseline, replacement) {
  const file = value => pathToFileURL(value).href;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Dialler visual comparison</title>
<style>
html,body{margin:0;background:#e8e8e8;color:#111;font:600 15px Arial,sans-serif}
main{width:820px;margin:0 auto;padding:16px 10px 24px;box-sizing:border-box}
h1{font-size:18px;margin:0 0 14px}.grid{display:grid;grid-template-columns:390px 390px;gap:16px 20px}
figure{margin:0}figcaption{height:30px;display:flex;align-items:center}img{display:block;width:390px;height:844px;object-fit:cover;object-position:top;border:1px solid #777;box-sizing:border-box}
</style></head><body><main><h1>AresFit Dialler - same fixture, state and 390 x 844 viewport</h1><div class="grid">
<figure><figcaption>Preserved live baseline - main</figcaption><img src="${file(baseline.mainPath)}"></figure>
<figure><figcaption>Replacement build - main</figcaption><img src="${file(replacement.mainPath)}"></figure>
<figure><figcaption>Preserved live baseline - settings</figcaption><img src="${file(baseline.settingsPath)}"></figure>
<figure><figcaption>Replacement build - settings</figcaption><img src="${file(replacement.settingsPath)}"></figure>
</div></main></body></html>`;
}

export async function runVisualComparisonQa({ baselinePath, replacementPath, fixturePath, outputDir, executablePath, playwright }) {
  mkdirSync(outputDir, { recursive: true });
  const { chromium } = playwright || await import('playwright');
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const baseline = await captureVersion(browser, { htmlPath: baselinePath, fixturePath, outputDir, prefix: 'baseline' });
    const replacement = await captureVersion(browser, { htmlPath: replacementPath, fixturePath, outputDir, prefix: 'replacement' });
    const htmlPath = join(outputDir, 'visual-comparison.html');
    writeFileSync(htmlPath, comparisonHtml(baseline, replacement));

    const page = await browser.newPage({ viewport: { width: 850, height: 1800 } });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    const comparisonPath = join(outputDir, 'visual-comparison.png');
    await page.screenshot({ path: comparisonPath, fullPage: true });
    await page.close();
    check(statSync(comparisonPath).size > 40000, 'comparison screenshot is blank or too small');

    const report = {
      status: 'passed',
      browser: await browser.version(),
      viewport: '390x844',
      fixture: basename(fixturePath),
      baseline: { file: basename(baselinePath), screenshot: basename(baseline.mainPath), settingsScreenshot: basename(baseline.settingsPath), layout: baseline.layout },
      replacement: { file: basename(replacementPath), screenshot: basename(replacement.mainPath), settingsScreenshot: basename(replacement.settingsPath), layout: replacement.layout },
      comparison: basename(comparisonPath),
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(join(outputDir, 'visual-comparison-results.json'), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    await browser.close();
  }
}
