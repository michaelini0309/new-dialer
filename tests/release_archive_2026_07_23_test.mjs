import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const root = new URL('../', import.meta.url);
const archive = new URL('versions/2026-07-23-pre-upload-centering-f711a45/', root);
const app = readFileSync(new URL('aresfit-dialer-sandde-v2.html', archive));
const index = readFileSync(new URL('index.html', archive));
const manifest = readFileSync(new URL('MANIFEST.md', archive), 'utf8');
const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();

assert.equal(sha256(app), 'F55CE2C50A1B949FF5B0F2073086B4EC9C5F59B1188A3AA31E5DEF03CA67F01D');
assert.equal(sha256(index), 'FA4B533ECEA84CB0275DE30282B9539AC21AABD10EE61E3F1A77CEBFE88B3B48');
assert(manifest.includes('Status: archived'));
assert(manifest.includes('f711a4569f6d636cd838be08fd03d95b1c1403d5'));
assert(manifest.includes('archive/live-2026-07-23-pre-upload-centering-f711a45'));

console.log('2026-07-23 pre-upload-layout live release archive is intact');
