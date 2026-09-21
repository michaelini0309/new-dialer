import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../aresfit-dialer-sandde-v2.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const sandbox = {
  CALLBACK_LEAD_OVERRIDES: {},
  CALLBACK_NAME_OVERRIDES: {},
  DUE_WINDOW_MS: 0,
  Date,
  getLeadId: () => '',
  normaliseBusinessName: value => String(value || '').toLowerCase(),
  parseFollowUp: () => null,
};

vm.createContext(sandbox);
vm.runInContext([
  extractFunction('callbackEvidenceText'),
  'function callbackOverrideForLead(){ return null; }',
  "function isActiveCallbackRow(l){ return Boolean(l) && String(l.status || '').trim() === 'Callback'; }",
  extractFunction('classifyCallbackState'),
].join('\n'), sandbox);

const classify = lead => JSON.parse(JSON.stringify(sandbox.classifyCallbackState(lead)));

assert.deepEqual(classify({business: 'PENNYHILL PARK', status: '', notes: []}), {state: '', detail: ''});
assert.deepEqual(classify({business: 'Example Gym', dm: 'Alex Park', status: '', notes: []}), {state: '', detail: ''});
assert.equal(classify({business: 'Example Gym', status: '', notes: [{text: 'Park until September'}]}).state, 'parked/no current need');
assert.equal(classify({business: 'Example Gym', status: '', notes: [{outcome: 'No current need'}]}).state, 'parked/no current need');
assert.equal(classify({business: 'Example Gym', status: 'Callback', notes: []}).state, 'call-now');

console.log('callback-state regression tests passed');
