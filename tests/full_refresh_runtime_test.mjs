import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import vm from 'node:vm';

const html = readFileSync(new URL('../aresfit-dialer-sandde-v2.html', import.meta.url), 'utf8');
const script = html
  .slice(html.indexOf('<script>') + '<script>'.length, html.indexOf('// ===== Init ====='));

const storage = new Map();
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
  alert(message) { throw new Error(String(message)); },
  confirm() { return true; },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  },
  document: {
    hidden: false,
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() { return { click() {}, remove() {}, style: {} }; },
    body: { appendChild() {}, removeChild() {} },
  },
  window: { addEventListener() {}, open() {}, location: {} },
  location: { reload() {} },
  navigator: { userAgent: 'test', clipboard: { writeText() {} } },
  URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
});

vm.runInContext(script, context);

vm.runInContext(`
{
  const parsed=parseImportedNotes('14/07 09:10 - NA [GK] - no answer | 14/07 09:30 - VM - voicemail | unstructured legacy note',Date.parse('2026-07-14T12:00:00+01:00'));
  assert.equal(parsed.length,3);
  assert.equal(parsed[0].speakerRole,'GK');
  assert.equal(parsed[0].outcome,'NA');
  assert.equal(parsed[2].legacy,true);
  assert.equal(countLeadAttempts(parsed),2);

  const next={notes:parsed.slice(0,1),pending:{outcome:'',text:''},attempts:0};
  const previous={notes:[parsed[0],parsed[1]],pending:{outcome:'Callback',text:'call back'},pendingEmail:{subject:'Test'}};
  mergeImportedLeadHistory(next,previous);
  assert.equal(next.notes.length,2,'re-import merge must deduplicate notes');
  assert.equal(next.pending.outcome,'Callback','re-import merge must preserve an in-progress outcome');
  assert.equal(next.pendingEmail.subject,'Test','re-import merge must preserve email confirmation state');
}

{
  raw=[{Lead_ID:'L01311'}];
  const lead={rawIdx:0,row:999,business:'BECKWITH HEALTH CLUB',status:'Callback',followUp:'',notes:[]};
  assert.equal(callbackOverrideForLead(lead).state,'future callback');
  raw=[{}];
  assert.equal(callbackOverrideForLead(lead).state,'future callback','exact business fallback must survive row changes');
}

{
  const names=sessionPackageNames(new Date(2026,6,14,16,5),'Michael Davies');
  assert.equal(names.zip,'AresFit_Session_Package_14-07-2026_1605.zip');
  assert.equal(names.csv,'AresFit_Call_Sheet_14-07-2026_1605.csv');
  assert.equal(names.handover,'handover-14-07-2026_1605.md');
  assert.equal(getExportFileName(new Date(2026,6,14,16,5)),'AresFit_Call_Sheet_14-07-2026_1605.csv');
}

{
  raw=[];
  leads=[];
  const first=createTemporaryLeadId();
  assert.match(first,/^TMP-\\d{8}-001$/);
  raw=[{Lead_ID:first}];
  leads=[{rawIdx:0,leadId:first}];
  const second=createTemporaryLeadId();
  assert.equal(second,first.replace(/001$/,'002'),'temporary Lead_ID allocation must be stable and collision-free');
}

{
  const existing=new Set(['01111111111']);
  const result=circleLoopNovelPhones({phone:'01111 111111',phone2:'07222 222222'},existing,new Set());
  assert.equal(result.existing,1);
  assert.deepEqual(result.phones.map(phone=>phone.normalised),['07222222222'],'a new second number must still export');
}

{
  raw=[{'Lead_ID':'L1','Business Name':'Old name','Phone':'01000'}];
  leads=[{id:1,row:1,rawIdx:0,leadId:'L1',priority:'GOOD',business:'Current name',phone:'02000',phone2:'',website:'',status:'Callback',stage:'Contacted',followUp:'',cbDate:'',equipBrands:'',aresBrands:'',dm:'',email:'',email2:'',callAngle:'',research:'',notes:[]}];
  const row=buildCanonicalSheetRows()[0];
  assert.equal(row['Business Name'],'Current name');
  assert.equal(row.Phone,'02000');
  assert.deepEqual(validateExportSnapshot().errors,[]);
  raw.push({'Lead_ID':'L1','Business Name':'Duplicate'});
  assert(validateExportSnapshot().errors.some(error=>error.includes('Duplicate Lead_ID L1')));
}

{
  raw=[{Lead_ID:'L7'}];
  leads=[{id:7,row:7,rawIdx:0,leadId:'L7',business:'Sample Gym',phone:'01234',email:'owner@example.com',status:'',notes:[],pending:{outcome:'',text:''}}];
  filtered=leads.slice();idx=0;eventLog=[];user={name:'Sandde',email:'info@aresfit.co.uk'};prefs={usedSubjects:{},subjectDomainLock:{}};
  save=()=>true;render=()=>{};saveEventLog=()=>{};savePrefs=()=>{};flashDot=()=>{};showToast=()=>{};
  recordEmailCompose(leads[0],{toAddr:'owner@example.com',subject:'Test subject',detail:'test'});
  assert.equal(eventLog.at(-1).outcome,'HOLD','opening Gmail must never claim a send');
  assert.equal(leads[0].notes.at(-1).outcome,'EMAIL OPENED');
  markEmailSent(7);
  assert.equal(eventLog.at(-1).outcome,'email sent','only explicit confirmation records a send');
  assert.equal(leads[0].notes.at(-1).outcome,'EMAIL SENT');
  assert.equal(leads[0].status,'Emailed');
}
`, context);

console.log('full refresh runtime checks passed');
