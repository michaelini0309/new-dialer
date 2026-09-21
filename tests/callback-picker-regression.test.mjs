import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(
  new URL('../aresfit-dialer-sandde-v2.html', import.meta.url),
  'utf8',
);

const startInput = html.match(/<input type="datetime-local" id="cb-in"[^>]*>/)?.[0] || '';
const endInput = html.match(/<input type="time" id="cb-end"[^>]*>/)?.[0] || '';

assert(startInput, 'inline callback start input must exist');
assert(endInput, 'inline callback end input must exist');

assert(
  startInput.includes('onblur="updateCb(this.value)"'),
  'callback start must commit on blur after the native picker is finished',
);
assert(
  !startInput.includes('onchange="updateCb(this.value)"'),
  'callback start must not re-render from a native picker change event',
);
assert(
  endInput.includes('onblur="updateCbEnd(this.value)"'),
  'callback end time must commit on blur',
);
assert(
  !endInput.includes('onchange="updateCbEnd(this.value)"'),
  'callback end time must not commit from an intermediate picker change',
);

const updateStart = html.indexOf('function updateCb(v)');
const updateEnd = html.indexOf('function openCbEdit()', updateStart);
const callbackFunctions = html.slice(updateStart, updateEnd);

assert(callbackFunctions.includes("if(next===l.cbDate)return"));
assert(callbackFunctions.includes("if(next===l.cbEndTime)return"));

console.log('callback picker regression checks passed');
