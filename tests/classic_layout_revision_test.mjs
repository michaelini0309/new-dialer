import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('aresfit-dialer-sandde-v2.html', root), 'utf8');
const index = readFileSync(new URL('index.html', root), 'utf8');
const archiveDir = new URL('versions/2026-07-14-full-qa-c4b70a1/', root);
const archivedHtml = readFileSync(new URL('aresfit-dialer-sandde-v2.html', archiveDir));
const archivedIndex = readFileSync(new URL('index.html', archiveDir));
const manifest = readFileSync(new URL('MANIFEST.md', archiveDir), 'utf8');
const archivePolicy = readFileSync(new URL('versions/README.md', root), 'utf8');
const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();

assert.equal(
  sha256(archivedHtml),
  '7753B90AD751202E619ABE03E9B0FC04E8EEDCFA18CC295B0770F0C871E67451',
  'the preserved 2026.07.14 app changed',
);
assert.equal(
  sha256(archivedIndex),
  'F4F5D9BB94773014DD29AC39A5E3795A0C872BACD6303D80B07EAD5EB4907D05',
  'the preserved 2026.07.14 entry file changed',
);
assert(manifest.includes('archive/live-2026-07-14-full-qa-c4b70a1'), 'the preserved release branch is not documented');
assert(archivePolicy.includes('Archived releases are append-only'), 'the future release archive policy is missing');
assert(index.includes('20260825-owr-001-mobile-sticky-r1'), 'the current entry file does not target the OWR-001 mobile sticky-fix release');
assert(html.includes("const APP_BUILD = '2026.08.25.2'"), 'the current build identifier is missing');

const renderCard = html.slice(html.indexOf('function renderCard()'), html.indexOf('function renderLeadList()'));
const researchPosition = renderCard.indexOf('<div class="research-first">');
const fieldsPosition = renderCard.indexOf('<div class="fields primary-fields">');
const actionsPosition = renderCard.indexOf('<div class="call-actions">');
assert(researchPosition >= 0 && fieldsPosition > researchPosition && actionsPosition > fieldsPosition, 'research and primary lead context must appear before call controls');
const activeCss = html.slice(html.indexOf('<style>'), html.indexOf('@media not all {'));
assert(activeCss.includes("--font:'DM Sans',sans-serif"), 'the original typography was not restored');
assert(activeCss.includes('.stat{background:var(--card);padding:8px 6px;border-radius:9px'), 'the original stat cards were not restored');
assert(activeCss.includes('.card{background:var(--panel);border:1px solid var(--border);border-radius:14px'), 'the original lead-card treatment was not restored');
assert(activeCss.includes('.toolbar{display:grid;grid-template-columns:repeat(4,1fr)'), 'the original toolbar layout was not restored');

console.log('classic layout and preserved-release checks passed');
