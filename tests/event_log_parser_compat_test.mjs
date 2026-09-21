import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const expectedHeaders = [
  'timestamp',
  'rep',
  'row_number',
  'lead_id',
  'business_name',
  'phone',
  'email',
  'channel',
  'outcome',
  'reason',
  'next_action',
  'next_action_date',
  'owner',
  'proof_source',
  'quote_value',
  'blocked_value',
  'blocker_type',
  'notes',
];

const allowedOutcomes = new Set([
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
]);

function parseCsv(text) {
  text = text.replace(/^\ufeff/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((value) => value !== '')) rows.push(row);
  }
  return rows;
}

function normaliseOutcome(value) {
  const text = String(value || '').trim();
  return text.toLowerCase() === 'hold' ? 'HOLD' : text.toLowerCase();
}

function validEventDate(value) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ||
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value) ||
    !Number.isNaN(Date.parse(value));
}

function loadEventLogLikePython(csvText) {
  const rows = parseCsv(csvText);
  const headers = rows[0] || [];
  const missing = expectedHeaders.filter((header) => !headers.includes(header));
  if (missing.length) return { headers, events: [], warnings: [`event log missing headers: ${missing.join(', ')}`] };
  const warnings = [];
  const events = [];
  const index = Object.fromEntries(headers.map((header, i) => [header, i]));
  rows.slice(1).forEach((cells, i) => {
    const lineNumber = i + 2;
    const event = Object.fromEntries(expectedHeaders.map((header) => [header, String(cells[index[header]] || '').trim()]));
    event.outcome = normaliseOutcome(event.outcome);
    const rowMissing = ['timestamp', 'row_number', 'business_name', 'channel', 'outcome', 'owner', 'proof_source'].filter((field) => !event[field]);
    if (rowMissing.length) warnings.push(`event log row ${lineNumber} skipped, missing: ${rowMissing.join(', ')}`);
    else if (!allowedOutcomes.has(event.outcome)) warnings.push(`event log row ${lineNumber} skipped, invalid outcome: ${event.outcome}`);
    else if (Number.isNaN(Date.parse(event.timestamp))) warnings.push(`event log row ${lineNumber} skipped, invalid timestamp: ${event.timestamp}`);
    else if (!validEventDate(event.next_action_date)) warnings.push(`event log row ${lineNumber} skipped, invalid next_action_date: ${event.next_action_date}`);
    else if (event.outcome === 'lost' && !event.reason) warnings.push(`event log row ${lineNumber} skipped, lost outcome missing reason`);
    else {
      if ((event.outcome === 'quote sent' || event.outcome === 'quote needed') && !event.quote_value) {
        warnings.push(`event log row ${lineNumber} quote outcome missing quote_value; downstream treats as HOLD`);
      }
      events.push(event);
    }
  });
  const byRow = new Map();
  for (const event of events) {
    const rowNumber = event.row_number.trim().toUpperCase().replace(/^R/, '');
    if (!byRow.has(rowNumber)) byRow.set(rowNumber, []);
    byRow.get(rowNumber).push(event);
  }
  for (const [rowNumber, rowEvents] of byRow.entries()) {
    if (rowEvents.length > 1) warnings.push(`event log duplicate row_number R${rowNumber}; latest timestamp wins`);
  }
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { headers, events, warnings };
}

const fixture = readFileSync(new URL('./fixtures/AresFit_Event_Log_2026-06-21.csv', import.meta.url), 'utf8');
const parsed = loadEventLogLikePython(fixture);

assert.deepEqual(parsed.headers, expectedHeaders);
assert.equal(parsed.events.length, 6);
assert.deepEqual(parsed.warnings, []);
assert(parsed.events.some((event) => event.outcome === 'app issue'));
assert(parsed.events.some((event) => event.outcome === 'quote needed' && event.quote_value === '12500'));
assert(parsed.events.some((event) => event.blocker_type === 'supplier' && event.blocked_value === '7500'));

console.log('event log parser compatibility checks passed');
