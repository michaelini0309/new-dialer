import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
const html = read('../aresfit-dialer-sandde-v2.html').toString('utf8');
const index = read('../index.html').toString('utf8');
const archivedHtml = read('../versions/2026-07-30-pre-callback-picker-1696b3b/aresfit-dialer-sandde-v2.html');
const archivedIndex = read('../versions/2026-07-30-pre-callback-picker-1696b3b/index.html');
const manifest = read('../versions/2026-07-30-pre-callback-picker-1696b3b/MANIFEST.md').toString('utf8');

assert(html.includes("const APP_BUILD = '2026.08.25.2'"));
assert(html.includes("const RELEASE_ID = '20260825-owr-001-mobile-sticky-r1'"));
assert(html.includes("const ROLLBACK_BASE_COMMIT = '1d0df30528684ff7acb277dbc7258e4a626766f1'"));
assert(index.includes('aresfit-dialer-sandde-v2.html?v=20260825-owr-001-mobile-sticky-r1'));

assert.equal(sha256(archivedHtml), 'D0CDDD45F9CF83853DA2F3A4F0C9ED2D908DAD09CFD4258F3E981C5D3DB58C18');
assert.equal(sha256(archivedIndex), '6A8DDAE9DFD053FA4B5D0141D7E4C139C1D9E9DA30AAB5F2E9D122BE49F06DD5');
assert(manifest.includes('1696b3b6333f5de59532209b557452e8f2d4584c'));
assert(manifest.includes('archive/live-2026-07-30-pre-callback-picker-1696b3b'));

const retryStart = html.indexOf('function isRetryLead(l){');
const retryEnd = html.indexOf('// Parse Follow-up Date column', retryStart);
assert(html.slice(retryStart, retryEnd).includes("if(!['','Uncalled','No Answer'].includes(status))return false;"));

console.log('Callback picker release and rollback archive checks passed');
