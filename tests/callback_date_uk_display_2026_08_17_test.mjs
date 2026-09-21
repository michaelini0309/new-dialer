import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

process.env.TZ = 'Europe/London';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../aresfit-dialer-sandde-v2.html');
const index = read('../index.html');
const baseline = read('../versions/2026-08-17-pre-uk-callback-display-1d0df30/aresfit-dialer-sandde-v2.html');

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `Missing start marker: ${start}`);
  assert.notEqual(to, -1, `Missing end marker: ${end}`);
  return source.slice(from, to);
}

const inlineScript = sliceBetween(html, '<script>\n', '\n</script>').slice('<script>\n'.length);
assert.doesNotThrow(() => new vm.Script(inlineScript, { filename: 'aresfit-dialer-sandde-v2.html' }));

const formatterSource = sliceBetween(html, 'function callbackPartsValid', '// Parse Follow-up Date column');
const parserSource = sliceBetween(html, 'function callbackPartsValid', '// Normalise Status values on import');
const context = {
  Date,
  pad2: value => String(value).padStart(2, '0'),
  esc: value => String(value),
};
vm.createContext(context);
vm.runInContext(
  `${parserSource}\nthis.formatCallbackDisplay=formatCallbackDisplay;this.callbackPreviewMarkup=callbackPreviewMarkup;this.parseFollowUp=parseFollowUp;`,
  context,
);

const cases = [
  ['2026-08-26', '', '26/08/2026'],
  ['2026-08-26T09:05', '', '26/08/2026 09:05'],
  ['2026-08-26 09:05:00', '', '26/08/2026 09:05'],
  ['26/08/2026', '', '26/08/2026'],
  ['26/08/2026 09:05', '', '26/08/2026 09:05'],
  ['26/08/2026 09:05-10:30', '', '26/08/2026 09:05-10:30'],
  ['2026-08-26 09:05-10:30', '', '26/08/2026 09:05-10:30'],
  ['2026-08-26T00:00', '', '26/08/2026 00:00'],
  ['2026-08-26T09:05', '10:30', '26/08/2026 09:05-10:30'],
  ['08/26/2026', '', 'Invalid callback date'],
  ['31/02/2026', '', 'Invalid callback date'],
  ['2026-02-31', '', 'Invalid callback date'],
  ['2026-08-26T24:00', '', 'Invalid callback date'],
  ['2026-08-26T09:05:00Z', '', 'Unsupported timezone date'],
  ['2026-08-26T09:05', '25:00', 'Invalid callback end time'],
  ['2026-03-29T01:30', '', 'Invalid callback date'],
  ['2026-10-25T01:30', '', '25/10/2026 01:30'],
];

for (const [input, end, expected] of cases) {
  assert.equal(context.formatCallbackDisplay(input, end), expected, `${input} / ${end}`);
}

assert.match(context.callbackPreviewMarkup('2026-08-26T09:05', '', 'preview-id'), /id="preview-id"/);
assert.match(context.callbackPreviewMarkup('2026-02-31'), /callback-date-preview invalid/);
assert.equal(context.parseFollowUp('26/08/2026 09:05-10:30').rangeEnd, '10:30');
assert.equal(context.parseFollowUp('2026-08-26T09:05:00Z'), null);
assert.equal(context.parseFollowUp('31/02/2026'), null);

const unchangedBlocks = [
  ['function buildCallEventRow', 'function logCallEvent'],
  ['function updateCb(v)', 'function openCbEdit'],
  ['function saveCbEdit', 'function clearCbEdit'],
  ['function getDuePool', 'function poolStatus'],
  ['function saveNoteEdit', 'function deleteNoteEdit'],
  ['function buildCsvLines', 'function createZipBlob'],
];

for (const [start, end] of unchangedBlocks) {
  assert.equal(
    sliceBetween(html, start, end),
    sliceBetween(baseline, start, end),
    `Behavioural block changed unexpectedly: ${start}`,
  );
}

assert(html.includes("const APP_BUILD = '2026.08.25.2'"));
assert(html.includes("const RELEASE_ID = '20260825-owr-001-mobile-sticky-r1'"));
assert(html.includes("const ROLLBACK_BASE_COMMIT = '1d0df30528684ff7acb277dbc7258e4a626766f1'"));
assert(index.includes('aresfit-dialer-sandde-v2.html?v=20260825-owr-001-mobile-sticky-r1'));
assert.equal((html.match(/id="cbe-date-preview"/g) || []).length, 1);
assert.equal((html.match(/id="ne-cb-date-preview"/g) || []).length, 1);
assert.equal((html.match(/callbackPreviewMarkup\(l\.cbDate,l\.cbEndTime,'cb-in-preview'\)/g) || []).length, 1);
assert.equal((html.match(/\.replace\('T',' '\)/g) || []).length, 2, 'storage/export paths only');
assert.match(html, /const dueWhen=esc\(formatCallbackDisplay\(/);
assert.match(html, /const whenLabel=esc\(formatCallbackDisplay\(/);
assert.match(html, /Scheduled callback: \$\{esc\(formatCallbackDisplay\(/);
assert(html.includes("detail:'Park until 01/10/2026'"));
assert(html.includes("detail:'Park until 25/08/2026'"));
assert(html.includes("detail:'Park until 01/08/2026'"));
assert(!/detail:'[^']*\b2026-\d{2}-\d{2}\b/.test(html), 'callback detail labels must not expose ISO dates');

console.log(`UK callback display checks passed: ${cases.length} formats and ${unchangedBlocks.length} unchanged behavioural blocks`);
