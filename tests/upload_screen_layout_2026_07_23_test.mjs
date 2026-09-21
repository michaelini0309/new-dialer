import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('aresfit-dialer-sandde-v2.html', root), 'utf8');
const activeCss = html.slice(0, html.indexOf('@media not all'));
const uploadRule = activeCss.match(/\.upload-zone\{([^}]+)\}/)?.[1] || '';

assert(uploadRule.includes('display:block'), 'upload button must keep the original block layout');
assert(uploadRule.includes('width:100%'), 'upload button must fill the card content width');
assert(uploadRule.includes('max-width:100%'), 'upload button must never overflow the card');
assert(uploadRule.includes('padding:44px 20px'), 'upload button must retain the original usable height');
assert(uploadRule.includes('margin:14px auto 0'), 'upload button must remain horizontally centred');
assert(activeCss.includes('.upload-screen{display:flex;align-items:center;justify-content:center;min-height:100vh'), 'upload card must remain centred in the viewport');
assert(html.includes('<button type="button" class="upload-zone" id="upload-zone"'), 'upload control must remain an accessible button');
assert(html.includes("const APP_BUILD = '2026.08.25.2'"), 'upload layout release build is missing');
assert(html.includes("const RELEASE_ID = '20260825-owr-001-mobile-sticky-r1'"), 'upload layout release ID is missing');

console.log('upload screen full-width centring regression checks passed');
