import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import vm from 'node:vm';

const html = readFileSync(new URL('../aresfit-dialer-sandde-v2.html', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('// ===== Init ====='));
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
  setTimeout,
  clearTimeout,
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: {
    hidden: false,
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() { return { click() {}, remove() {}, style: {} }; },
    body: { classList: { toggle() {} }, appendChild() {}, removeChild() {} },
  },
  window: { addEventListener() {}, open() {}, location: {} },
  location: { reload() {} },
  navigator: { userAgent: 'test', clipboard: { writeText() {} } },
  URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
  alert(message) { throw new Error(String(message)); },
  confirm() { return true; },
});

vm.runInContext(script, context);
vm.runInContext(`
{
  const date=new Date(2026,6,21,17,42);
  assert.equal(exportStampLegacy(date),'21-07-2026_1742');
  assert.equal(getExportFileName(date),'AresFit_Call_Sheet_21-07-2026_1742.csv');
  assert.equal(
    JSON.stringify(sessionPackageNames(date,'Ignored Sender')),
    JSON.stringify({
      handover:'handover-21-07-2026_1742.md',
      csv:'AresFit_Call_Sheet_21-07-2026_1742.csv',
      zip:'AresFit_Session_Package_21-07-2026_1742.zip'
    })
  );
}
`, context);

assert(html.includes('AresFit_Event_Log_${exportStampLegacy(new Date())}.csv'), 'event log filename does not use the restored date format');
assert(html.includes('AresFit_Notion_Delta_${exportStampLegacy(new Date())}.md'), 'Notion delta filename does not use the restored date format');
assert(html.includes('const stamp=exportStampLegacy(ts);'), 'CircleLoop exports do not use the restored date format');
assert(!html.includes('function exportStampShort'), 'compact date helper must not remain in the app');
assert(!html.includes('function exportStampLong'), 'time-first date helper must not remain in the app');

console.log('all export filename paths use DD-MM-YYYY_HHMM');
