import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import vm from 'node:vm';

const html = readFileSync(new URL('../aresfit-dialer-sandde-v2.html', import.meta.url), 'utf8');

const filtersLine = html.match(/const FILTERS = \[[^\n]+;/)[0];
const filterBlock = html.slice(
  html.indexOf('// Predicate per filter'),
  html.indexOf('// Multi-filter toggle')
);
const retryHelpers = html.slice(
  html.indexOf('function latestRealNote'),
  html.indexOf('// Parse Follow-up Date column')
);

const harness = `
${filtersLine}
function latestNoteTs(l){
  if(!l||!l.notes||!l.notes.length)return 0;
  let max=0;
  for(const n of l.notes){
    if(n.legacy)continue;
    const t=n.ts||0;
    if(t>max)max=t;
  }
  return max;
}
function latestVmEntry(l){
  if(!l||!l.notes||!l.notes.length)return null;
  let latest=null;
  for(const n of l.notes){
    if(n.legacy)continue;
    if(!latest||(n.ts||0)>(latest.ts||0))latest=n;
  }
  return (latest&&(latest.outcome||'').toUpperCase()==='VM')?latest:null;
}
${retryHelpers}
function isActiveCallNowCallback(){return false}
function isCallbackState(){return false}
function parseFollowUp(){return null}
var raw=[];
var prefs={};
var searchTerm='';
var activeFilters=['Retry'];
var leads=[
  {row:40,business:'Retry NA later row',status:'',stage:'Intro',attempts:1,notes:[{outcome:'NA',ts:100}]},
  {row:34,business:'Retry No Answer early row',status:'No Answer',stage:'Intro',attempts:1,notes:[{outcome:'No Answer',ts:120}]},
  {row:36,business:'Retry VM row',status:'',stage:'Intro',attempts:1,notes:[{outcome:'VM',ts:110}]},
  {row:38,business:'Retry Voicemail row',status:'Voicemail',stage:'Intro',attempts:1,notes:[{outcome:'Voicemail',ts:130}]},
  {row:35,business:'Fresh untouched',status:'',stage:'Intro',attempts:0,notes:[]},
  {row:39,business:'Second attempt',status:'',stage:'Intro',attempts:2,notes:[{outcome:'NA',ts:10},{outcome:'VM',ts:20}]},
  {row:43,business:'Emailed row',status:'Emailed',stage:'Intro',attempts:1,notes:[{outcome:'NA',ts:10}]},
  {row:44,business:'Callback row',status:'Callback',stage:'Contacted',attempts:1,notes:[{outcome:'VM',ts:10}]},
  {row:45,business:'Awaiting callback row',status:'Awaiting Callback',stage:'Contacted',attempts:1,notes:[{outcome:'NA',ts:10}]},
  {row:46,business:'Quoted row',status:'Quoted',stage:'Quoted',attempts:1,notes:[{outcome:'VM',ts:10}]},
  {row:47,business:'Not interested row',status:'Not Interested',stage:'Lost',attempts:1,notes:[{outcome:'NA',ts:10}]},
  {row:48,business:'DNC row',status:'DO NOT CALL',stage:'Lost',attempts:1,notes:[{outcome:'VM',ts:10}]},
  {row:49,business:'Provider reject row',status:'Provider Reject',stage:'Lost',attempts:1,notes:[{outcome:'Provider Reject',ts:10}]}
];
${filterBlock}

assert(FILTERS.includes('Retry'), 'Retry must appear in filter list');
assert.deepEqual(applyFilter().map(l=>l.row), [34,40], 'Retry rows must be exactly one-attempt NA / No Answer rows sorted by row number');

activeFilters=['Uncalled'];
assert.deepEqual(applyFilter().map(l=>l.row), [35], 'Uncalled remains untouched fresh rows only');

activeFilters=['Callback'];
assert.equal(applyFilter().includes(leads.find(l=>l.row===44)), false, 'Callback behaviour is not broadened by Retry');
`;

vm.runInNewContext(harness, { assert, console });
console.log('retry filter 2026-07-07 NA-only regression checks passed');
