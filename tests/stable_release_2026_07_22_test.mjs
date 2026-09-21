import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('aresfit-dialer-sandde-v2.html', root), 'utf8');
const index = readFileSync(new URL('index.html', root), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('// ===== Init ====='));
const alerts = [];
const clipboardWrites = [];

const element = () => ({
  style: {},
  dataset: {},
  classList: { add() {}, remove() {}, toggle() {} },
  setAttribute() {},
  focus() {},
  select() {},
  setSelectionRange() {},
  click() {},
  remove() { this.parentNode = null; },
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
});
const body = element();
body.appendChild = node => { node.parentNode = body; };
body.removeChild = node => { node.parentNode = null; };

const context = vm.createContext({
  assert,
  console,
  Blob,
  TextEncoder,
  Uint8Array,
  Set,
  Map,
  Date,
  Math,
  JSON,
  Promise,
  URL,
  alerts,
  setTimeout,
  clearTimeout,
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: {
    hidden: false,
    body,
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() { return element(); },
    execCommand() { return true; },
  },
  window: {
    isSecureContext: true,
    addEventListener() {},
    open() {},
    matchMedia() { return { matches: false }; },
    location: {},
  },
  location: { href: 'https://example.test/app', replace() {}, reload() {} },
  navigator: {
    userAgent: 'test',
    clipboard: { async writeText(value) { clipboardWrites.push(value); } },
    standalone: false,
  },
  alert(message) { alerts.push(String(message)); },
  confirm() { return true; },
});

vm.runInContext(script, context);

vm.runInContext(`
  assert.equal(APP_BUILD, '2026.08.25.2');
  assert.equal(RELEASE_ID, '20260825-owr-001-mobile-sticky-r1');
  assert.equal(SHEET_COLS.length, 22);
  assert(STATUS_OPTS.includes('Uncalled'));
  assert(STATUS_OPTS.includes('Voicemail'));
  assert(STATUS_OPTS.includes('Contacted'));
  assert(NOTE_OUTCOMES.includes('EMAIL OPENED'));
  assert(NOTE_OUTCOMES.includes('EMAIL SENT'));
  assert(NOTE_OUTCOMES.includes('EMAIL NOT SENT'));
  assert(NOTE_OUTCOMES.includes('Event'));
  assert.equal(normaliseDialNumber('+44 (0) 7712 345 678'), '+447712345678');
  assert.equal(normaliseLeadPhone('+44 7712 345678'), '07712345678');
  assert.equal(FILTER_PREDICATES.Recent({notes:[]}), false);
  assert.equal(FILTER_PREDICATES.Recent({notes:[{legacy:false,ts:10}]}), true);

  navigator.userAgent='Mozilla/5.0 (Linux; Android 15)';
  const android=dialRouteForNumber('03301243155');
  assert.equal(android.kind,'android-circleloop-intent');
  assert(android.href.includes('package=com.circleloop'));
  assert(android.href.includes('S.browser_fallback_url=tel%3A03301243155'));

  navigator.userAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)';
  prefs.clScheme='circleloop://keypad/';
  const ios=dialRouteForNumber('03301243155');
  assert.equal(ios.kind,'ios-circleloop-scheme');
  assert.equal(ios.href,'circleloop://keypad/03301243155');

  navigator.userAgent='desktop';
  const desktop=dialRouteForNumber('03301243155');
  assert.equal(desktop.kind,'tel');
  assert.equal(desktop.href,'tel:03301243155');
`, context);

const clipboardResult = await vm.runInContext(`copyTextVerified('03301243155')`, context);
assert.equal(clipboardResult.ok, true);
assert.equal(clipboardResult.method, 'clipboard-api');
assert.deepEqual(clipboardWrites, ['03301243155']);

context.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
const fallbackResult = await vm.runInContext(`copyTextVerified('fallback')`, context);
assert.equal(fallbackResult.ok, true);
assert.equal(fallbackResult.method, 'execCommand');

assert.throws(() => vm.runInContext(`parseCSV('A,B\\n"broken,1')`, context), /unclosed quoted field/i);
assert.deepEqual(
  JSON.parse(vm.runInContext(`JSON.stringify(parseCSV('A,B\\n"line 1\\nline 2",ok'))`, context)),
  [['A', 'B'], ['line 1\nline 2', 'ok']],
);

vm.runInContext(`
  alerts.length=0;
  filtered=[{id:1,row:1,business:'Callback test',phone:'03301243155',email:'',status:'',stage:'',notes:[],attempts:0,cbDate:'',pending:{outcome:'Callback',text:'Call back',reason:'',speakerRole:'',callStartTs:0}}];
  idx=0;
  assert.equal(commitPending(),false);
  assert(alerts.some(message=>message.includes('Callback date and time required')));

  alerts.length=0;
  filtered=[{id:2,row:2,business:'Lost test',phone:'03301243155',email:'',status:'',stage:'',notes:[],attempts:0,cbDate:'',pending:{outcome:'Not Int.',text:'Not interested',reason:'',speakerRole:'',callStartTs:0}}];
  idx=0;
  assert.equal(commitPending(),false);
  assert(alerts.some(message=>message.includes('Lost reason required')));
`, context);

assert(index.includes('20260825-owr-001-mobile-sticky-r1'), 'entry file cache bust does not match the release');
assert(html.includes('class="queue-chip"'), 'compact queue context is missing');
assert(html.includes('id="ne-speaker"'), 'editable DM/GK note attribution is missing');
assert(html.includes('id="ne-cb-date"'), 'separate callback scheduling field is missing from note editing');
assert(html.includes('function selectOnlyFilter'), 'single-filter callback shortcut is missing');
assert(html.includes('save();render();window.scrollTo'), 'navigation position is not persisted');
assert(html.includes('setTimeout(()=>URL.revokeObjectURL(url),60000)'), 'download URL is revoked too early');
assert(!html.includes('function copyToClipboard'), 'unverified clipboard helper remains');
assert(!html.includes("proof_source:p.callStartTs?'CircleLoop dial tap'"), 'dial proof still overstates CircleLoop opening');
assert(html.includes("if(typeof prefs.queueBannerCollapsed!=='boolean')prefs.queueBannerCollapsed=true"), 'callback banner does not migrate to compact mode');
assert(html.includes("throw new Error('CSV contains an unclosed quoted field.')"), 'malformed CSV quote protection is missing');
assert(html.includes('row(s) have the wrong column count'), 'CSV row-width protection is missing');
assert(html.includes('lastDownload'), 'download diagnostics are missing');

console.log('2026-07-22 stable release regression checks passed');
