import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import vm from 'node:vm';

const html = readFileSync(new URL('../aresfit-dialer-sandde-v2.html', import.meta.url), 'utf8');

const constants = html
  .match(/const CALLBACK_LEAD_OVERRIDES[\s\S]*?const DUE_WINDOW_MS[^\n]*\n/)[0];

const callbackHelpers = html
  .match(/function callbackPartsValid[\s\S]*?function isCallbackState\(l,state\)\{return classifyCallbackState\(l\)\.state===state\}/)[0];

const duePoolBlock = html
  .match(/function getDuePool\(\)\{[\s\S]*?\r?\n\}\r?\nfunction poolStatus/)[0]
  .replace(/\r?\nfunction poolStatus$/, '');

const fixedNow = new Date('2026-06-30T10:47:00+01:00');
class FixedDate extends Date {
  constructor(...args) {
    if (args.length === 0) super(fixedNow.getTime());
    else super(...args);
  }
  static now() { return fixedNow.getTime(); }
  static parse(value) { return Date.parse(value); }
  static UTC(...args) { return Date.UTC(...args); }
}

const harness = `
function pad2(n){return String(n).padStart(2,'0')}
function normaliseBusinessName(value){return String(value||'').trim().replace(/\s+/g,' ').toUpperCase()}
function getLeadId(l){return l.leadId||''}
${constants}
${callbackHelpers}
var prefs={autoQueue:true,dismissedOverdue:[]};
function isDismissedToday(){return false}

const conistonStale={
  id:249,row:249,business:'THE CONISTON HOTEL COUNTRY ESTATE AND SPA',
  status:'Quoted',stage:'Intro',followUp:'2026-05-05 00:00:00',
  dm:'Fiona Marchioness Of Lansdowne',
  notes:[{outcome:'legacy',text:'Called 09/04 - told they will mention to DM Kalan. Soft follow-up 05/05 if still silent.'}]
};
const ymcaDarrenStale={
  id:419,row:419,business:'YMCA THAMES GATEWAY / DARREN HOWARD',
  status:'Quoted',stage:'Quoted',followUp:'2026-05-27 09:30',
  dm:'Darren Howard',
  notes:[{outcome:'legacy',text:'Michael-owned quote/invoice context. Do not call unless specifically assigned.'}]
};
const oldRealCallback={
  id:500,row:500,business:'REAL CALLBACK',
  status:'Callback',stage:'Contacted',followUp:'2026-05-05 00:00:00',
  notes:[{outcome:'legacy',text:'Call back requested.'}]
};
const beckwithFuture={
  id:184,row:999,business:'BECKWITH HEALTH CLUB',leadId:'L01311',
  status:'Callback',stage:'Contacted',followUp:'01/10/2026',
  notes:[{outcome:'legacy',text:'Budget set around October. Callback October.'}]
};
const trimwiseFuture={
  id:300,row:1,business:'TRIMWISE (BRIDGWATER)',leadId:'L04717',
  status:'Callback',stage:'Quoted',followUp:'2026-08-01 12:22',
  notes:[{outcome:'legacy',text:'Call back in 6-8 weeks.'}]
};
const roehamptonFuture={
  id:271,row:2,business:'ROEHAMPTON CLUB',leadId:'L03684',
  status:'Callback',stage:'Contacted',followUp:'25/08/2026',
  notes:[{outcome:'legacy',text:'Contact end of summer.'}]
};
const awaitingCallback={
  id:600,row:600,business:'AWAITING CUSTOMER CALLBACK',
  status:'Awaiting Callback',stage:'Contacted',followUp:'2026-05-05',
  notes:[{outcome:'legacy',text:'Reception took details, awaiting callback.'}]
};

assert.equal(classifyCallbackState(conistonStale).state,'','Coniston stale quoted row must not be call-now');
assert.equal(classifyCallbackState(ymcaDarrenStale).state,'','YMCA Darren stale quoted row must not be call-now');
assert.equal(isActiveCallNowCallback(conistonStale),false,'Coniston stale row must not be in Callback filter');
assert.equal(isActiveCallNowCallback(ymcaDarrenStale),false,'YMCA Darren stale row must not be in Callback filter');

assert.equal(classifyCallbackState(oldRealCallback).state,'call-now','real overdue Status=Callback row stays call-now');
assert.equal(classifyCallbackState(beckwithFuture).state,'future callback','Beckwith future callback stays parked');
assert.equal(classifyCallbackState(trimwiseFuture).state,'future callback','Trimwise future callback stays parked');
assert.equal(classifyCallbackState(roehamptonFuture).state,'future callback','Roehampton future callback stays parked');
assert.equal(classifyCallbackState(awaitingCallback).state,'waiting reply','Awaiting Callback keeps existing v2 waiting state');

var leads=[conistonStale,ymcaDarrenStale,oldRealCallback,beckwithFuture,trimwiseFuture,roehamptonFuture,awaitingCallback];
${duePoolBlock}
const pool=getDuePool();
assert.deepEqual(pool.overdue.map(l=>l.business),['REAL CALLBACK'],'only real overdue Callback rows enter the red banner pool');
assert.equal(pool.due.length,0,'future callbacks are not due on 2026-06-30');
`;

vm.runInNewContext(harness, { assert, console, Date: FixedDate });
console.log('callback logic 2026-06-30 regression checks passed');
