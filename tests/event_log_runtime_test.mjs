import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import vm from 'node:vm';

const html = readFileSync(new URL('../aresfit-dialer-sandde-v2.html', import.meta.url), 'utf8');
const constants = html
  .match(/const EVENT_LOG_STORAGE_KEY[\s\S]*?const FILTERS =/)[0]
  .replace(/const FILTERS =$/, '');
const eventBlock = html
  .match(/\/\/ ===== Event log \+ daily queue gate =====[\s\S]*?\/\/ ===== CSV import =====/)[0]
  .replace('// ===== CSV import =====', '');

const harness = `
function pad2(n){return String(n).padStart(2,'0')}
function todayKey(){const d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())}
function uid(){return 'test-'+Math.random().toString(36).slice(2)}
function csvEscape(v){v=String(v==null?'':v);return /[",\\n\\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
function esc(s){return String(s==null?'':s)}
function alert(msg){throw new Error(msg)}
function savePrefs(){}
function saveEventLog(){}
function flashDot(){}
function showToast(){}
function save(){}
function render(){}
var Blob=function(){};
var URL={createObjectURL(){return 'blob:test'}};
var document={getElementById(){return null},createElement(){return {click(){}}}};
var raw=[{Lead_ID:'lead-007'}];
var user={name:'Sandde',email:'info@aresfit.co.uk'};
var prefs={};
var eventLog=[];
var filtered=[];
var leads=[];
${constants}
${eventBlock}

const lead={id:7,row:7,rawIdx:0,business:'Sample Gym',phone:'01234 567890',email:'owner@example.com',status:'',notes:[]};
const note={id:'n1',ts:Date.UTC(2026,5,21,9,30),text:'Spoke to owner'};
let row=buildCallEventRow(lead,note,{outcome:'Contacted',callStartTs:note.ts});
assert.equal(row.outcome,'reached');
assert.equal(row.lead_id,'lead-007');
assert.equal(validateEventDraft(row).length,0);

row=buildEventRow(lead,{channel:'call',outcome:'lost',proof_source:'manual call outcome',notes:'declined'});
assert(validateEventDraft(row).includes('Lost requires a reason'));
row=buildEventRow(lead,{channel:'call',outcome:'lost',reason:'no budget',proof_source:'manual call outcome',notes:'declined'});
assert.equal(validateEventDraft(row).length,0);

row=buildEventRow(lead,{channel:'quote',outcome:'quote needed',proof_source:'manual quote log',notes:'needs quote'});
assert(validateEventDraft(row).includes('Quote outcome requires quote value'));
row=buildEventRow(lead,{channel:'quote',outcome:'quote needed',quote_value:'12500',proof_source:'manual quote log',notes:'needs quote'});
assert.equal(validateEventDraft(row).length,0);

row=buildEventRow(lead,{channel:'blocker',outcome:'customer waiting',blocker_type:'pricing',proof_source:'manual blocker log',notes:'pricing blocked'});
assert(validateEventDraft(row).includes('Blocked value required'));
row=buildEventRow(lead,{channel:'blocker',outcome:'customer waiting',blocker_type:'pricing',blocked_value:'12500',proof_source:'manual blocker log',notes:'pricing blocked'});
assert.equal(validateEventDraft(row).length,0);

row=buildEventRow(lead,{channel:'app issue',outcome:'app issue',blocked_value:'12500',proof_source:'manual app issue log',notes:'export failed'});
assert(validateEventDraft(row).includes('Blocker type required'));
row=buildEventRow(lead,{channel:'app issue',outcome:'app issue',blocker_type:'app/CircleLoop',blocked_value:'12500',proof_source:'manual app issue log',notes:'export failed'});
assert.equal(validateEventDraft(row).length,0);

ensureQueueGateState();
assert.equal(canStartFreshDials(),false);
prefs.queueGate.warmReviewed=true;
prefs.queueGate.blockersReviewed=true;
assert.equal(canStartFreshDials(),true);
prefs.queueGate.warmReviewed=false;
prefs.queueGate.blockersReviewed=false;
prefs.queueGate.overrideReason='manager override';
assert.equal(canStartFreshDials(),true);

const first=buildEventRow(lead,{channel:'WhatsApp',outcome:'reply received',proof_source:'manual WhatsApp log',notes:'customer replied'});
eventLog.push(first);
const originalTimestamp=eventLog[0].timestamp;
const second=buildEventRow({...lead,row:8,rawIdx:0},{channel:'email',outcome:'HOLD',next_action:'confirm sent or not sent',proof_source:'Gmail compose launched; send not verified',notes:'opened compose'});
appendEventRow(second);
assert.equal(eventLog.length,2);
assert.equal(eventLog[0].timestamp,originalTimestamp);
assert.equal(eventLog[1].outcome,'HOLD');
assert(eventRowsToCsv(eventLog).startsWith(EVENT_LOG_HEADER_LINE+'\\n'));
`;

vm.runInNewContext(harness, { assert, console });
console.log('event log runtime checks passed');
