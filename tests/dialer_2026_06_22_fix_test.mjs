import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('../aresfit-dialer-sandde-v2.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert(html.startsWith('<!DOCTYPE html>'), 'the deployable v2 must be a standalone HTML document');
assert(index.includes('aresfit-dialer-sandde-v2.html?v=20260825-owr-001-mobile-sticky-r1'), 'the repository entry link must cache-bust to the verified build');
assert(html.includes('<link rel="icon" href="data:,">') && index.includes('<link rel="icon" href="data:,">'), 'the public entry and app must not trigger a favicon 404');
assert(!html.includes('ARES_V2_BASE_URL'), 'the deployable v2 must not fetch a second app at runtime');
assert(!html.includes('applyUnifiedPatch'), 'the deployable v2 must not patch remote source in the browser');
assert(html.includes("const APP_BUILD = '2026.08.25.2'"), 'the visible build identifier is missing');
assert(!/setTimeout\([^\n]*(?:nl-biz|lead-search|time-in)[^\n]*focus/.test(html), 'delayed modal autofocus can steal user input');
assert(
  html.includes("const ROLLBACK_BASE_COMMIT = '1d0df30528684ff7acb277dbc7258e4a626766f1'"),
  'the exact rollback baseline must be recorded in the app source'
);

for (const snippet of [
  'function exportSessionPackage',
  'function createZipBlob',
  'function validateExportSnapshot',
  'function parseImportedNotes',
  'function mergeImportedLeadHistory',
  'function activateLeadQueue',
  'function clearLeadQueue',
  'function markEmailSent',
  'function markEmailNotSent',
  'function callbackOverrideForLead',
  'function circleLoopNovelPhones',
  'function localDateKey',
]) {
  assert(html.includes(snippet), `missing hardened v2 behaviour: ${snippet}`);
}

for (const leadId of [
  'L01311',
  'L02465',
  'L03467',
  'L04449',
  'L03003',
  'L03637',
  'L03684',
  'L03400',
  'L04717',
  'L00687',
]) {
  assert(html.includes(`${leadId}:`), `missing stable callback override for ${leadId}`);
}

assert(!html.includes('const CALLBACK_ROW_OVERRIDES'), 'callback exceptions must not depend on mutable row numbers');
assert(html.includes('zip:`AresFit_Session_Package_${stamp}.zip`'), 'package filename must use the restored readable date contract');
assert(html.includes('csv:`AresFit_Call_Sheet_${stamp}.csv`'), 'packaged CSV filename must use the restored readable date contract');
assert(html.includes('handover:`handover-${stamp}.md`'), 'handover filename must use the restored readable date contract');
assert(html.includes("'Emailed':'HOLD'"), 'asked-to-email call outcomes must not claim an email was sent');
assert(html.includes("outcome:'EMAIL OPENED'"), 'opening Gmail must be recorded honestly');
assert(html.includes("draft.confirmed?'email sent':'HOLD'"), 'confirmed email sends must remain parser-compatible');

console.log('standalone rollback and safety contract checks passed');
