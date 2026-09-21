import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import vm from 'node:vm';

const html = readFileSync(new URL('../aresfit-dialer-sandde-v2.html', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('// ===== Init ====='));
const headers = ['FINAL PRIORITY','Business Name','Phone','Website','Status','Stage','Notes','Follow-up Date','Equipment Brands','AresFit Brands','PSC / Decision Maker','Email','Call Angle','Research Notes','Lead Priority','Segment','Lead_ID','Research Status','Verified','Viability Score','Verification Notes','Sort'];
const csvEscape = value => /[",\n\r]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
const rows = [];

for (let index = 1; index <= 1500; index++) {
  const status = index % 29 === 0 ? 'Callback' : index % 11 === 0 ? 'No Answer' : 'Uncalled';
  const stage = index % 29 === 0 ? 'Contacted' : 'Intro';
  const notes = index % 11 === 0 ? `22/07 09:30 - NA [GK] - no answer, retry ${index}` : '';
  const followUp = index % 29 === 0 ? '2026-08-01 10:30' : '';
  const business = index % 50 === 0 ? `QA "Quoted", Venue ${index}` : `QA Venue ${index}`;
  rows.push([
    index % 17 === 0 ? 'TOP' : 'GOOD',
    business,
    `01${String(index).padStart(9, '0').slice(-9)}`,
    `https://venue-${index}.example.test`,
    status,
    stage,
    notes,
    followUp,
    index % 3 === 0 ? 'Technogym' : 'Life Fitness',
    '',
    `Manager ${index}`,
    `manager${index}@example.test`,
    `QA angle ${index}`,
    `Controlled stress row ${index}`,
    index % 17 === 0 ? 'Hot' : 'Warm',
    'independent gym',
    `LQA${String(index).padStart(5, '0')}`,
    'Complete',
    'GOOD',
    String(50 + index % 50),
    'Synthetic QA only',
    String(index),
  ]);
}

const csvText = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
const elements = new Map();
const makeElement = () => ({
  value: '',
  textContent: '',
  innerHTML: '',
  style: {},
  hidden: false,
  classList: { add() {}, remove() {}, toggle() {} },
  setAttribute() {},
  getAttribute() { return null; },
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  click() {},
  remove() {},
  focus() {},
  select() {},
  setSelectionRange() {},
});
const body = makeElement();
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
  performance,
  setTimeout,
  clearTimeout,
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: {
    hidden: false,
    body,
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById(id) { if (!elements.has(id)) elements.set(id, makeElement()); return elements.get(id); },
    createElement() { return makeElement(); },
    execCommand() { return true; },
  },
  window: { isSecureContext: true, addEventListener() {}, open() {}, matchMedia() { return { matches: false }; }, scrollTo() {}, location: {} },
  location: { href: 'https://example.test/app', replace() {}, reload() {} },
  navigator: { userAgent: 'stress-test', clipboard: { async writeText() {} }, standalone: false },
  alert(message) { throw new Error(String(message)); },
  confirm() { return true; },
});

vm.runInContext(script, context);
context.csvText = csvText;

const result = vm.runInContext(`(() => {
  render=()=>{};
  save=()=>true;
  showApp=()=>{};
  const parsed=parseCSV(csvText);
  headers=parsed[0];
  raw=parsed.slice(1).map(cells=>{const row={};headers.forEach((header,index)=>row[header]=cells[index]||'');return row});
  FIELDS.forEach(field=>document.getElementById('map-'+field).value=LABELS[field]);
  const importStarted=performance.now();
  confirmImport();
  const importMs=performance.now()-importStarted;
  const exportStarted=performance.now();
  const exported=generateCsvText();
  const exportMs=performance.now()-exportStarted;
  const exportedRows=parseCSV(exported);
  const filterStarted=performance.now();
  for(let pass=0;pass<100;pass++){
    activeFilters=[pass%2?'Retry':'Recent'];
    applyFilter();
  }
  const filterMs=performance.now()-filterStarted;
  activeFilters=['All'];
  const validation=validateExportSnapshot();
  const packageNames=sessionPackageNames(new Date(2026,6,22,7,30));
  const zip=createZipBlob([{name:packageNames.csv,text:exported},{name:packageNames.handover,text:generateHandover(new Date(2026,6,22,7,30))}]);
  return{
    parsedRows:parsed.length-1,
    rawRows:raw.length,
    leads:leads.length,
    exportedRows:exportedRows.length-1,
    exportHeaders:exportedRows[0].length,
    firstLeadId:exportedRows[1][16],
    lastLeadId:exportedRows.at(-1)[16],
    quotedBusiness:exportedRows[50][1],
    importMs,
    exportMs,
    filterMs,
    validation,
    sessionBytes:JSON.stringify(buildSessionState()).length,
    zipBytes:zip.size
  };
})()`, context);

assert.equal(result.parsedRows, 1500);
assert.equal(result.rawRows, 1500);
assert.equal(result.leads, 1500);
assert.equal(result.exportedRows, 1500);
assert.equal(result.exportHeaders, 22);
assert.equal(result.firstLeadId, 'LQA00001');
assert.equal(result.lastLeadId, 'LQA01500');
assert.equal(result.quotedBusiness, 'QA "Quoted", Venue 50');
assert.equal(result.validation.errors.length, 0);
assert(result.importMs < 3000, `large-sheet import took ${result.importMs.toFixed(1)} ms`);
assert(result.exportMs < 2000, `large-sheet export took ${result.exportMs.toFixed(1)} ms`);
assert(result.filterMs < 1500, `100 large-sheet filter passes took ${result.filterMs.toFixed(1)} ms`);
assert(result.sessionBytes < 15_000_000, `session state is unexpectedly large: ${result.sessionBytes}`);
assert(result.zipBytes > csvText.length, 'session package ZIP is unexpectedly small');

console.log(`large-sheet round trip passed: 1,500 rows, import ${result.importMs.toFixed(1)} ms, export ${result.exportMs.toFixed(1)} ms, filters ${result.filterMs.toFixed(1)} ms`);
