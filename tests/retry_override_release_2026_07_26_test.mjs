import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
const html = read('../aresfit-dialer-sandde-v2.html').toString('utf8');
const index = read('../index.html').toString('utf8');
const archivedHtml = read('../versions/2026-07-26-pre-retry-7b9ed09/aresfit-dialer-sandde-v2.html');
const archivedIndex = read('../versions/2026-07-26-pre-retry-7b9ed09/index.html');
const manifest = read('../versions/2026-07-26-pre-retry-7b9ed09/MANIFEST.md').toString('utf8');

const retryStart = html.indexOf('function isRetryLead(l){');
const retryEnd = html.indexOf('// Parse Follow-up Date column', retryStart);
const retrySource = html.slice(retryStart, retryEnd);

assert(retrySource.includes("if(!['','Uncalled','No Answer'].includes(status))return false;"));
assert(!retrySource.includes("['DO NOT CALL','Not Interested','Provider Reject'"));
assert(html.includes("const APP_BUILD = '2026.08.25.2'"));
assert(html.includes("const RELEASE_ID = '20260825-owr-001-mobile-sticky-r1'"));
assert(html.includes("const ROLLBACK_BASE_COMMIT = '1d0df30528684ff7acb277dbc7258e4a626766f1'"));
assert(index.includes('aresfit-dialer-sandde-v2.html?v=20260825-owr-001-mobile-sticky-r1'));
assert.equal(sha256(archivedHtml), 'E11B84C2170A23ED5AC51BB403597B911AF3FE56AB38116489826E6F3C28EEE8');
assert.equal(sha256(archivedIndex), 'CC49C3E0B8F294C38716A14A5BDC37BC820211CAE73066ECC9682482A5101029');
assert(manifest.includes('archive/live-2026-07-26-pre-retry-7b9ed09'));

console.log('Retry override release and rollback archive checks passed');
