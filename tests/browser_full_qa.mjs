import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function visibleText(page, selector) {
  return ((await page.locator(selector).textContent()) || '').trim();
}

export async function runBrowserQa({ htmlPath, fixturePath, outputDir, executablePath, playwright }) {
  mkdirSync(outputDir, { recursive: true });
  const { chromium } = playwright || await import('playwright');
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('dialog', dialog => dialog.accept());

  const checks = [];
  const record = (name, detail = 'passed') => checks.push({ name, detail });
  const appUrl = pathToFileURL(join(dirname(htmlPath), 'index.html')).href;

  try {
    await page.goto(appUrl, { waitUntil: 'load' });
    check(page.url().includes('aresfit-dialer-sandde-v2.html?v=20260817-uk-callback-display-r1'), 'repository entry link did not open the verified cache-busted v2 build');
    await page.locator('#setup-modal').waitFor({ state: 'visible' });
    await page.locator('#setup-preset-button').click();
    await page.locator('.setup-dd-opt[data-name="Sandde"]').click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('#upload-screen').waitFor({ state: 'visible' });
    record('repository entry redirect and first-use sender setup');

    await page.locator('#csv-in').setInputFiles(fixturePath);
    await page.locator('#map-modal').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Import leads', exact: true }).click();
    await page.locator('#main-app').waitFor({ state: 'visible' });
    check((await visibleText(page, '#source-summary')).includes(`${basename(fixturePath)} · 4 rows`), 'source summary is incorrect');
    check((await visibleText(page, '.biz-head')).includes('QA FRESH FITNESS'), 'first imported lead is incorrect');
    const importState = await page.evaluate(() => ({
      rows: raw.length,
      leads: leads.length,
      retryAttempts: leads.find(lead => getLeadId(lead) === 'LQA003')?.attempts,
      callbackRole: leads.find(lead => getLeadId(lead) === 'LQA002')?.notes[0]?.speakerRole,
    }));
    check(importState.rows === 4 && importState.leads === 4, 'import row/lead counts are incorrect');
    check(importState.retryAttempts === 1, 'structured imported attempt was not restored');
    check(importState.callbackRole === 'DM', 'structured imported DM marker was not restored');
    record('22-column import and structured note restoration');

    await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
    await page.getByText('Dial permissions', { exact: true }).click();
    await page.locator('#q-warm-reviewed').check();
    await page.locator('#q-blockers-reviewed').check();
    await page.locator('#settings-modal .x-btn').click();
    check(await page.locator('.call-btn').first().isEnabled(), 'fresh call remained blocked after both reviews');
    record('fresh-call permission gate');

    await page.locator('.outcomes button[data-out="Contacted"]').click();
    await page.getByRole('button', { name: 'Decision maker', exact: true }).click();
    await page.locator('#new-note').fill('Browser QA contacted the decision maker');
    await page.locator('.next-btn').click();
    check((await visibleText(page, '#notes-hist')).includes('Browser QA contacted the decision maker'), 'logged note did not render');
    const logged = await page.evaluate(() => ({
      note: leads.find(lead => getLeadId(lead) === 'LQA001').notes.at(-1),
      event: eventLog.at(-1),
      business: filtered[idx].business,
    }));
    check(logged.note.speakerRole === 'DM', 'DM marker was not stored on the call note');
    check(logged.event.outcome === 'reached', 'contacted call did not create a reached event');
    check(logged.business === 'QA FRESH FITNESS', 'first log tap advanced unexpectedly');
    await page.locator('.next-btn').click();
    check((await visibleText(page, '.biz-head')).includes('QA CALLBACK CLUB'), 'second Next tap did not advance');
    record('two-step call logging with DM marker');

    await page.getByRole('button', { name: 'Leads', exact: true }).first().click();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    check(await page.locator('#lead-list .lead-item').count() === 1, 'Retry filter did not return exactly one lead');
    await page.getByRole('button', { name: /QA RETRY GYM/ }).click();
    check(await page.evaluate(() => queueLabel === 'Retry' && queueLeadIds.length === 1), 'filtered queue label/count is incorrect');
    check((await visibleText(page, '.biz-head')).includes('QA RETRY GYM'), 'filtered queue selected the wrong lead');
    await page.evaluate(() => clearLeadQueue());
    check(await page.evaluate(() => queueLeadIds.length === 0), 'queue did not clear');
    record('Retry filter and persistent card queue');

    await page.getByRole('button', { name: 'Leads', exact: true }).first().click();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByRole('button', { name: /QA FRESH FITNESS/ }).click();
    await page.evaluate(() => { _launchGmail = () => {}; });
    await page.getByRole('button', { name: /Compose email/ }).click();
    await page.locator('#c-subject').fill('Browser QA email');
    await page.getByRole('button', { name: 'Open Gmail', exact: true }).click();
    await page.locator('#email-confirmation').waitFor({ state: 'visible' });
    let emailState = await page.evaluate(() => ({ event: eventLog.at(-1).outcome, note: leads.find(lead => getLeadId(lead) === 'LQA001').notes.at(-1).outcome }));
    check(emailState.event === 'HOLD' && emailState.note === 'EMAIL OPENED', 'opening Gmail falsely recorded a send');
    await page.getByRole('button', { name: 'Not sent', exact: true }).click();
    check((await page.evaluate(() => leads.find(lead => getLeadId(lead) === 'LQA001').status)) !== 'Emailed', 'not-sent confirmation changed Status to Emailed');

    await page.getByRole('button', { name: /Compose email/ }).click();
    await page.locator('#c-subject').fill('Browser QA confirmed email');
    await page.getByRole('button', { name: 'Open Gmail', exact: true }).click();
    await page.getByRole('button', { name: 'Mark sent', exact: true }).click();
    emailState = await page.evaluate(() => ({
      event: eventLog.at(-1).outcome,
      note: leads.find(lead => getLeadId(lead) === 'LQA001').notes.at(-1).outcome,
      status: leads.find(lead => getLeadId(lead) === 'LQA001').status,
    }));
    check(emailState.event === 'email sent' && emailState.note === 'EMAIL SENT' && emailState.status === 'Emailed', 'sent confirmation did not update all records');
    record('honest Gmail opened/not-sent/sent states');

    await page.locator('#csv-in').setInputFiles(fixturePath);
    await page.getByRole('button', { name: 'Import leads', exact: true }).click();
    const mergedState = await page.evaluate(() => {
      const lead = leads.find(item => getLeadId(item) === 'LQA001');
      return { notes: lead.notes.map(note => note.text), status: lead.status, eventRows: eventLog.length };
    });
    check(mergedState.notes.some(text => text.includes('Browser QA contacted')), 're-import discarded an app note');
    check(mergedState.notes.some(text => text.includes('Browser QA confirmed email')), 're-import discarded email history');
    check(mergedState.status === '', 'source CSV fields were not treated as current truth on re-import');
    check(mergedState.eventRows >= 5, 'append-only event history was lost on re-import');
    record('re-import field refresh plus history merge');

    await page.getByRole('button', { name: 'Leads', exact: true }).first().click();
    await page.getByRole('button', { name: 'New lead', exact: true }).click();
    await page.locator('#nl-biz').fill('QA NEW LEAD');
    await page.locator('#nl-phone').click();
    await page.waitForTimeout(150);
    check(await page.evaluate(() => document.activeElement?.id === 'nl-phone'), 'new-lead autofocus stole focus from the phone field');
    await page.locator('#nl-phone').fill('01555 555555');
    const newLeadDraft = await page.evaluate(() => ({ business: document.getElementById('nl-biz').value, phone: document.getElementById('nl-phone').value }));
    check(newLeadDraft.business === 'QA NEW LEAD' && newLeadDraft.phone === '01555 555555', `new-lead fields were corrupted: ${JSON.stringify(newLeadDraft)}`);
    await page.getByRole('button', { name: 'Add lead', exact: true }).click();
    await page.locator('#new-lead-modal').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => leads.some(item => item.business === 'QA NEW LEAD'), null, { timeout: 2000 });
    const newLeadState = await page.evaluate(() => {
      const lead = leads.find(item => item.business === 'QA NEW LEAD');
      return { id: getLeadId(lead), rows: raw.length, validation: validateExportSnapshot() };
    });
    check(/^TMP-\d{8}-\d{3}$/.test(newLeadState.id), `new lead did not receive a temporary Lead_ID: ${JSON.stringify(newLeadState)}`);
    check(newLeadState.rows === 5 && newLeadState.validation.errors.length === 0, 'new lead broke export validation');
    check(newLeadState.validation.headers.length === 22, 'export no longer has exactly 22 columns');
    record('new lead focus integrity, identity and export validation');

    const filenameContract = await page.evaluate(() => {
      const previousUser = { ...user };
      user = { name: 'Michael Davies', email: 'michael@aresfit.co.uk' };
      const fixedDate = new Date(2026, 6, 8, 9, 18);
      const directCsv = getExportFileName(fixedDate);
      const packageNames = sessionPackageNames(fixedDate, user.name);
      user = previousUser;
      return { directCsv, packageNames };
    });
    check(filenameContract.directCsv === 'AresFit_Call_Sheet_08-07-2026_0918.csv', 'direct CSV filename contract is wrong');
    check(filenameContract.packageNames.zip === 'AresFit_Session_Package_08-07-2026_0918.zip', 'package filename contract is wrong');
    check(filenameContract.packageNames.handover === 'handover-08-07-2026_0918.md', 'handover filename contract is wrong');
    check(filenameContract.packageNames.csv === 'AresFit_Call_Sheet_08-07-2026_0918.csv', 'inner CSV filename contract is wrong');
    record('restored readable export filename contract');

    await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
    const packageDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export handover + CSV package', exact: true }).click();
    const packageDownload = await packageDownloadPromise;
    const packageName = packageDownload.suggestedFilename();
    check(/^AresFit_Session_Package_\d{2}-\d{2}-\d{4}_\d{4}\.zip$/.test(packageName), `package filename is incorrect: ${packageName}`);
    const packagePath = join(outputDir, packageName);
    await packageDownload.saveAs(packagePath);
    const packageBytes = readFileSync(packagePath);
    check(packageBytes.includes(Buffer.from('AresFit_Call_Sheet_')) && packageBytes.includes(Buffer.from('handover-')), 'inner package filenames are incorrect');
    await page.locator('#settings-modal .x-btn').click();

    const csvDownloadPromise = page.waitForEvent('download');
    await page.evaluate(() => exportCSV());
    const csvDownload = await csvDownloadPromise;
    const csvName = csvDownload.suggestedFilename();
    check(/^AresFit_Call_Sheet_\d{2}-\d{2}-\d{4}_\d{4}\.csv$/.test(csvName), `CSV filename is incorrect: ${csvName}`);
    const csvPath = join(outputDir, csvName);
    await csvDownload.saveAs(csvPath);
    const csvText = readFileSync(csvPath, 'utf8').replace(/^\ufeff/, '');
    check(csvText.split(/\r?\n/)[0].split(',').length === 22, 'downloaded CSV header is not 22 columns');
    check(csvText.includes('QA NEW LEAD') && csvText.includes(newLeadState.id), 'downloaded CSV omitted the new lead or its ID');
    record('readable dated package and CSV downloads');

    await page.getByRole('button', { name: 'Handover', exact: true }).click();
    const handover = await visibleText(page, '#handover-body');
    check(handover.includes(`**Source CSV:** ${basename(fixturePath)} - 5 rows`), 'handover source evidence is missing');
    check(handover.includes('External activity warning'), 'handover external-activity boundary is missing');
    check(handover.includes('**Emails confirmed sent today:** 1'), 'handover confirmed email count is wrong');
    await page.locator('#handover-modal .x-btn').click();
    record('handover provenance and confirmed-email count');

    await page.getByRole('button', { name: 'Leads', exact: true }).first().click();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('button', { name: /QA RETRY GYM/ }).click();
    await page.waitForTimeout(250);
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('button', { name: 'Resume previous session', exact: true }).click();
    await page.locator('#main-app').waitFor({ state: 'visible' });
    check(await page.evaluate(() => queueLabel === 'Retry' && queueLeadIds.length === 1), 'filtered queue did not survive reload/resume');
    check((await visibleText(page, '#source-summary')).includes('5 rows'), 'source metadata did not survive reload/resume');
    record('localStorage/IndexedDB resume state');

    const settingsButton = page.getByRole('button', { name: 'Settings', exact: true }).first();
    await settingsButton.click();
    await page.locator('#settings-modal').waitFor({ state: 'visible' });
    check((await page.locator('#settings-modal').getAttribute('aria-modal')) === 'true', 'settings modal is missing aria-modal');
    await page.keyboard.press('Escape');
    await page.locator('#settings-modal').waitFor({ state: 'hidden' });
    record('modal Escape and focus-management path');

    await page.evaluate(() => clearLeadQueue());
    const accessibility = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      const unnamedButtons = [...document.querySelectorAll('button')].filter(button => {
        const visible = button.offsetParent !== null;
        const name = (button.textContent || button.getAttribute('aria-label') || '').trim();
        return visible && !name;
      }).length;
      const unlabelledControls = [...document.querySelectorAll('input,select,textarea')].filter(control => {
        if (control.type === 'hidden' || control.offsetParent === null) return false;
        return !control.closest('label') && !control.getAttribute('aria-label') && !control.getAttribute('aria-labelledby') && !(control.id && document.querySelector(`label[for="${control.id}"]`));
      }).length;
      return { duplicates: [...new Set(duplicates)], unnamedButtons, unlabelledControls };
    });
    check(accessibility.duplicates.length === 0, `duplicate IDs found: ${accessibility.duplicates.join(', ')}`);
    check(accessibility.unnamedButtons === 0, `${accessibility.unnamedButtons} visible buttons have no accessible name`);
    check(accessibility.unlabelledControls === 0, `${accessibility.unlabelledControls} visible controls have no accessible label`);
    record('accessible names, labels and unique IDs');

    const viewports = [
      { name: 'mobile-320x568', width: 320, height: 568 },
      { name: 'mobile-390x844', width: 390, height: 844 },
      { name: 'mobile-430x932', width: 430, height: 932 },
      { name: 'desktop-1440x1000', width: 1440, height: 1000 },
    ];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(80);
      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        cardWidth: document.querySelector('.card')?.scrollWidth || 0,
        cardClientWidth: document.querySelector('.card')?.clientWidth || 0,
        clippedButtons: [...document.querySelectorAll('button')].filter(button => button.offsetParent !== null && button.scrollWidth > button.clientWidth + 2).map(button => button.textContent.trim()).slice(0, 5),
      }));
      check(layout.documentWidth <= layout.viewport, `${viewport.name} has horizontal page overflow`);
      check(layout.cardWidth <= layout.cardClientWidth + 1, `${viewport.name} call card overflows horizontally`);
      check(layout.clippedButtons.length === 0, `${viewport.name} has clipped buttons: ${layout.clippedButtons.join(', ')}`);
      const screenshotPath = join(outputDir, `${viewport.name}.png`);
      const image = await page.screenshot({ path: screenshotPath, fullPage: true });
      check(image.length > 15000, `${viewport.name} screenshot is unexpectedly blank/small`);
    }
    record('320/390/430 mobile and 1440 desktop layout screenshots');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
    const settingsImage = await page.screenshot({ path: join(outputDir, 'mobile-settings-390x844.png'), fullPage: true });
    check(settingsImage.length > 12000, 'settings screenshot is unexpectedly blank/small');
    record('mobile settings screenshot');

    check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
    check(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`);
    record('zero page and console errors');

    const report = {
      status: 'passed',
      app: basename(htmlPath),
      fixture: basename(fixturePath),
      browser: await browser.version(),
      checks,
      consoleErrors,
      pageErrors,
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(join(outputDir, 'browser-qa-results.json'), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } catch (error) {
    const report = {
      status: 'failed',
      error: String(error && error.stack ? error.stack : error),
      checks,
      consoleErrors,
      pageErrors,
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(join(outputDir, 'browser-qa-results.json'), `${JSON.stringify(report, null, 2)}\n`);
    await page.screenshot({ path: join(outputDir, 'browser-qa-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}
