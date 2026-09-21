import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('../aresfit-dialer-sandde-v2.html', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const style = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));

assert.doesNotThrow(() => new Function(script), 'app JavaScript has a syntax error');

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicateIds)], [], `duplicate HTML ids: ${[...new Set(duplicateIds)].join(', ')}`);

const handlers = [...html.matchAll(/\bon(?:click|change|input|keydown|toggle)="([^"]+)"/g)].map(match => match[1]);
const ignored = new Set(['if', 'encodeURIComponent', 'parseInt', 'click', 'blur', 'preventDefault', 'stopPropagation']);
const handlerCalls = new Set();
for (const handler of handlers) {
  for (const match of handler.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!ignored.has(match[1]) && !handler.slice(Math.max(0, match.index - 10), match.index).endsWith('document.')) handlerCalls.add(match[1]);
  }
}
const missingHandlers = [...handlerCalls].filter(name => !new RegExp(`function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=`).test(script));
assert.deepEqual(missingHandlers, [], `inline handlers reference missing functions: ${missingHandlers.join(', ')}`);

const braceBalance = value => [...value].reduce((count, char) => count + (char === '{' ? 1 : char === '}' ? -1 : 0), 0);
assert.equal(braceBalance(style), 0, 'CSS braces are unbalanced');
assert(html.includes('input,textarea,select{font-size:16px;'), 'iOS input zoom protection is missing');
assert(!/[ÂÃ�]/.test(html), 'visible mojibake remains in the source');
assert(html.includes('<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">'));
assert(html.includes("default-src 'self' data: blob:"), 'the standalone app CSP is missing');
assert(html.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion handling is missing');

console.log(`source integrity passed: ${ids.length} unique ids and ${handlerCalls.size} inline handler functions`);
