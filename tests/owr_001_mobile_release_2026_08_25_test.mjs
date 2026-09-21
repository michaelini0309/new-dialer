import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
const html = read('../aresfit-dialer-sandde-v2.html').toString('utf8');
const index = read('../index.html').toString('utf8');
const archivedHtml = read('../versions/2026-08-25-pre-owr-001-2bafb77/aresfit-dialer-sandde-v2.html');
const archivedIndex = read('../versions/2026-08-25-pre-owr-001-2bafb77/index.html');
const manifest = read('../versions/2026-08-25-pre-owr-001-2bafb77/MANIFEST.md').toString('utf8');
const overflowRollbackHtml = read('../versions/2026-08-25-pre-overflow-fix-e3d4761/aresfit-dialer-sandde-v2.html');
const overflowRollbackIndex = read('../versions/2026-08-25-pre-overflow-fix-e3d4761/index.html');
const overflowRollbackManifest = read('../versions/2026-08-25-pre-overflow-fix-e3d4761/MANIFEST.md').toString('utf8');
const stickyRollbackHtml = read('../versions/2026-08-25-pre-sticky-fix-36ddf15/aresfit-dialer-sandde-v2.html');
const stickyRollbackIndex = read('../versions/2026-08-25-pre-sticky-fix-36ddf15/index.html');
const stickyRollbackManifest = read('../versions/2026-08-25-pre-sticky-fix-36ddf15/MANIFEST.md').toString('utf8');

assert(html.includes("const APP_BUILD = '2026.08.25.2'"));
assert(html.includes("const RELEASE_ID = '20260825-owr-001-mobile-sticky-r1'"));
assert(index.includes('aresfit-dialer-sandde-v2.html?v=20260825-owr-001-mobile-sticky-r1'));
assert.equal(sha256(archivedHtml), '7BEDD3661418DEAF8148DC0F216A0C0150B361738CBB536489E96125CBB20DB1');
assert.equal(sha256(archivedIndex), '9E44C4AEDF633FA0685F076BFE638F41D09DE60654E73B4CB4976F6B076B36CF');
assert(manifest.includes('2bafb77716d0a908290ce34c1ff21f48d6ad66ee'));
assert(manifest.includes('archive/live-2026-08-25-pre-owr-001-2bafb77'));
assert.equal(sha256(overflowRollbackHtml), '6A2C4AA868472785752DC4815EF74C9DD006E1CEEEEFA9A8F9AA46840E3DEF50');
assert.equal(sha256(overflowRollbackIndex), '97EAC1ED43D5043E4750E86FDB635F076F9A0E2C5A8CAEFB1BA9F452B8656904');
assert(overflowRollbackManifest.includes('e3d4761d5e589192fdde00838f3bcf96822111d5'));
assert.equal(sha256(stickyRollbackHtml), 'D6291CF6EF69FC4EB376F2D8EEAD3D91580791629B38A2EDBD94E185CF53D0F8');
assert.equal(sha256(stickyRollbackIndex), 'CE005A8D1FFBA03A88188556A447185EBC0B19FD37CD6785B98E143652F0921B');
assert(stickyRollbackManifest.includes('36ddf155610984374308163df3bb1e5e5695ffd7'));
assert(stickyRollbackManifest.includes('archive/live-2026-08-25-pre-sticky-fix-36ddf15'));
assert(!html.includes('PREVIEW-184'));
assert(!html.includes('NAV_SYNTHETIC'));

const renderCard = html.slice(html.indexOf('function renderCard()'), html.indexOf('function renderLeadList()'));
for (const required of ['research-first', 'more-details', 'activity-history-first', 'class="outcomes"', 'new-note']) {
  assert.notEqual(renderCard.indexOf(required), -1, `missing OWR-001 lead-screen element: ${required}`);
}
assert(renderCard.indexOf('research-first') < renderCard.indexOf('class="fields"'));
assert(renderCard.indexOf('activity-history-first') < renderCard.indexOf('class="outcomes"'));
assert(renderCard.indexOf('class="outcomes"') < renderCard.indexOf('new-note'));

console.log('OWR-001 mobile release and rollback archive checks passed');
