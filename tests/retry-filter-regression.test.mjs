import assert from 'node:assert/strict';
import fs from 'node:fs';

const htmlPath = new URL('../aresfit-dialer-sandde-v2.html', import.meta.url);
const html = fs.readFileSync(htmlPath, 'utf8');
const start = html.indexOf('function latestRealNote(l){');
const end = html.indexOf('// Parse Follow-up Date column', start);

assert.ok(start >= 0 && end > start, 'Retry predicate source was not found');

const source = html.slice(start, end);
const { isRetryLead } = Function(`${source}; return { isRetryLead };`)();

const note = (outcome, ts = 1000) => ({ outcome, ts });
const lead = ({ status = '', attempts = 1, outcome = 'NA', notes } = {}) => ({
  status,
  attempts,
  notes: notes ?? [note(outcome)],
});

const cases = [
  ['blank current state plus one NA', lead(), true],
  ['Uncalled plus one NA', lead({ status: 'Uncalled' }), true],
  ['No Answer plus one NA', lead({ status: 'No Answer' }), true],
  ['No Answer plus one No Answer', lead({ status: 'No Answer', outcome: 'No Answer' }), true],
  ['Contacted waiting-reply override plus stale NA', lead({ status: 'Contacted' }), false],
  ['Awaiting Pass-Through plus stale NA', lead({ status: 'Awaiting Pass-Through' }), false],
  ['Callback plus stale NA', lead({ status: 'Callback' }), false],
  ['Awaiting Callback plus stale NA', lead({ status: 'Awaiting Callback' }), false],
  ['Emailed plus stale NA', lead({ status: 'Emailed' }), false],
  ['Quoted plus stale NA', lead({ status: 'Quoted' }), false],
  ['Hot Lead plus stale NA', lead({ status: 'Hot Lead' }), false],
  ['Not Interested plus stale NA', lead({ status: 'Not Interested' }), false],
  ['DO NOT CALL plus stale NA', lead({ status: 'DO NOT CALL' }), false],
  ['Voicemail current state plus stale NA', lead({ status: 'Voicemail' }), false],
  ['one VM', lead({ outcome: 'VM' }), false],
  ['one Voicemail', lead({ outcome: 'Voicemail' }), false],
  ['zero attempts', lead({ attempts: 0 }), false],
  ['two attempts', lead({ attempts: 2 }), false],
  ['legacy-only note', lead({ notes: [{ outcome: 'NA', ts: 1000, legacy: true }] }), false],
  ['no notes', lead({ notes: [] }), false],
  ['newer Contacted after NA', lead({ notes: [note('NA', 1000), note('Contacted', 2000)] }), false],
];

for (const [name, fixture, expected] of cases) {
  assert.equal(isRetryLead(fixture), expected, name);
}

console.log(`PASS: ${cases.length}/${cases.length} Retry predicate cases`);
