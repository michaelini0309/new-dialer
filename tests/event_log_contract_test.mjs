import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('../aresfit-dialer-sandde-v2.html', import.meta.url), 'utf8');

const requiredHeader = 'timestamp,rep,row_number,lead_id,business_name,phone,email,channel,outcome,reason,next_action,next_action_date,owner,proof_source,quote_value,blocked_value,blocker_type,notes';
const requiredOutcomes = [
  'reached',
  'no answer',
  'voicemail',
  'dead air',
  'email sent',
  'reply received',
  'quote sent',
  'quote needed',
  'supplier needed',
  'customer waiting',
  'parked',
  'lost',
  'do not touch',
  'HOLD',
  'app issue',
];

assert(html.includes(requiredHeader), 'event log CSV header must match event_log.py exactly');
assert(html.includes('aresfit_sandde_v2_event_log'), 'event log must have append-only local storage');
assert(html.includes('AresFit_Event_Log_'), 'daily CSV event log export is missing');
assert(html.includes('AresFit_Notion_Delta_'), 'daily Notion delta export is missing');

for (const outcome of requiredOutcomes) {
  assert(html.includes(`'${outcome}'`) || html.includes(`"${outcome}"`), `missing outcome: ${outcome}`);
}

for (const fn of [
  'buildEventRow',
  'validateEventDraft',
  'appendEventRow',
  'logCallEvent',
  'logEmailEvent',
  'openManualEvent',
  'saveManualEvent',
  'exportEventLog',
  'exportNotionDelta',
  'canStartFreshDials',
]) {
  assert(html.includes(`function ${fn}`), `missing function ${fn}`);
}

for (const id of [
  'manual-event-modal',
  'manual-event-outcome',
  'manual-event-blocker-type',
  'q-warm-reviewed',
  'q-blockers-reviewed',
  'q-override-reason',
]) {
  assert(html.includes(`id="${id}"`), `missing control ${id}`);
}

const expectedSheetCols = [
  'FINAL PRIORITY',
  'Business Name',
  'Phone',
  'Website',
  'Status',
  'Stage',
  'Notes',
  'Follow-up Date',
  'Equipment Brands',
  'AresFit Brands',
  'PSC / Decision Maker',
  'Email',
  'Call Angle',
  'Research Notes',
  'Lead Priority',
  'Segment',
  'Lead_ID',
  'Research Status',
  'Verified',
  'Viability Score',
  'Verification Notes',
  'Sort',
];

const sheetColsMatch = html.match(/const SHEET_COLS\s*=\s*\[(.*?)\];/s);
assert(sheetColsMatch, 'SHEET_COLS must remain declared');
const sheetCols = [...sheetColsMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
assert.deepEqual(sheetCols, expectedSheetCols, 'call sheet export must keep the current 22-column shape');

console.log('event log contract checks passed');
