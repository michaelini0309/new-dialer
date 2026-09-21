import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const [appUrl, fixtureArg, outputArg, edgeArg] = process.argv.slice(2);
if (!appUrl || !fixtureArg || !outputArg || !edgeArg) {
  throw new Error('Usage: node retry_real_sheet_edge_qa_2026_07_26.mjs <url> <fixture> <output> <edge>');
}

const fixturePath = resolve(fixtureArg);
const outputDir = resolve(outputArg);
const profileDir = resolve(tmpdir(), `aresfit-retry-sheet-edge-qa-${Date.now()}`);
const appOrigin = new URL(appUrl).origin;
await mkdir(outputDir, { recursive: true });
await mkdir(profileDir, { recursive: true });

const sleep = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));
const checks = [];
const check = (condition, name, detail = 'passed') => {
  if (!condition) throw new Error(`${name}: ${detail}`);
  checks.push({ name, detail });
};

class CdpClient {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket connection timed out')), 10000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolvePromise(); }, { once: true });
      this.ws.addEventListener('error', event => {
        clearTimeout(timer);
        reject(new Error(`CDP WebSocket error: ${event.message || 'unknown'}`));
      }, { once: true });
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result || {});
        return;
      }
      for (const handler of this.handlers.get(message.method) || []) handler(message.params || {});
    });
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(handler);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws && this.ws.readyState < 2) this.ws.close();
  }
}

const port = 9238;
const edge = spawn(edgeArg, [
  '--headless',
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--no-sandbox',
  '--disable-features=Vulkan,SkiaGraphite,UseDawn,WebGPU,CanvasOopRasterization',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-allow-origins=*',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  '--window-size=390,844',
  appUrl,
], {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    USERPROFILE: process.env.USERPROFILE,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    Path: process.env.Path || process.env.PATH,
  },
});

let edgeStderr = '';
edge.stderr.on('data', chunk => { edgeStderr += chunk; });
edge.stdout.resume();

let cdp;
const runtimeErrors = [];
const consoleErrors = [];
const consoleWarnings = [];

async function findPageTarget() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find(target => target.type === 'page' && target.url.startsWith(appOrigin));
      if (page) return page;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Edge debugging target did not appear. ${edgeStderr.slice(-1000)}`);
}

async function evaluate(expression, options = {}) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: options.userGesture !== false,
  });
  if (response.exceptionDetails) {
    const detail = response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Runtime evaluation failed';
    throw new Error(detail);
  }
  return response.result?.value;
}

async function waitFor(expression, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(`Boolean(${expression})`, { userGesture: false })) return;
    } catch {}
    await sleep(80);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

let acceptance;
try {
  const target = await findPageTarget();
  cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  cdp.on('Runtime.exceptionThrown', event => {
    runtimeErrors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || 'runtime exception');
  });
  cdp.on('Runtime.consoleAPICalled', event => {
    const message = event.args?.map(arg => arg.value || arg.description || '').join(' ') || event.type;
    if (event.type === 'error') consoleErrors.push(message);
    if (event.type === 'warning') consoleWarnings.push(message);
  });
  cdp.on('Log.entryAdded', event => {
    if (event.entry?.level === 'error') consoleErrors.push(event.entry.text);
    if (event.entry?.level === 'warning') consoleWarnings.push(event.entry.text);
  });
  await Promise.all([
    cdp.send('Page.enable'),
    cdp.send('Runtime.enable'),
    cdp.send('Log.enable'),
    cdp.send('Network.enable'),
  ]);
  await waitFor("document.readyState==='complete'");
  await waitFor("location.pathname.endsWith('aresfit-dialer-sandde-v2.html')");
  check((await evaluate('location.search')).includes('v=20260817-uk-callback-display-r1'), 'cache-busted entry redirect');

  await evaluate(`localStorage.clear();
    localStorage.setItem('aresfit_sandde_v2_user', JSON.stringify({name:'QA',email:'qa@aresfit.co.uk'}));
    localStorage.setItem('aresfit_sandde_v2_prefs', JSON.stringify({queueBannerCollapsed:true,autoQueue:true,theme:'dark'}));
    location.reload(); true;`);
  await waitFor("document.readyState==='complete' && document.getElementById('upload-screen')?.style.display==='flex'");

  const fixtureText = await readFile(fixturePath, 'utf8');
  await evaluate(`processCsvFile(new File([${JSON.stringify(fixtureText)}], ${JSON.stringify(basename(fixturePath))}, {type:'text/csv'})); true`);
  await waitFor("document.getElementById('map-modal')?.style.display==='flex'");
  await evaluate('confirmImport(); true');
  await waitFor("document.getElementById('main-app')?.style.display==='block'", 30000);

  acceptance = await evaluate(`(() => {
    const byRow = items => [...items].sort((a,b)=>(a.row||0)-(b.row||0));
    const uncalled = byRow(leads.filter(FILTER_PREDICATES.Uncalled));
    const retry = byRow(leads.filter(FILTER_PREDICATES.Retry));
    const waiting = byRow(leads.filter(FILTER_PREDICATES.Waiting));
    const iron = leads.find(lead => getLeadId(lead)==='L04449');
    return {
      build: APP_BUILD,
      release: RELEASE_ID,
      physicalRows: raw.length,
      realLeads: leads.length,
      uncalledCount: uncalled.length,
      uncalledFirst: uncalled[0]?.business || '',
      uncalledLast: uncalled.at(-1)?.business || '',
      pennyhillPresent: uncalled.some(lead => lead.business==='PENNYHILL PARK'),
      marlowAbsent: !uncalled.some(lead => lead.business==='THE MARLOW CLUB'),
      retryCount: retry.length,
      waitingCount: waiting.length,
      iron: iron ? {
        business: iron.business,
        status: iron.status,
        retry: retry.includes(iron),
        waiting: waiting.includes(iron),
        state: classifyCallbackState(iron).state,
      } : null,
      retryIds: retry.map(getLeadId),
    };
  })()`);

  check(acceptance.build === '2026.08.17' && acceptance.release === '20260817-uk-callback-display-r1', 'build and release identity', JSON.stringify(acceptance));
  check(acceptance.physicalRows === 999 && acceptance.realLeads === 438, 'sheet row and lead counts', JSON.stringify(acceptance));
  check(acceptance.uncalledCount === 75, 'Uncalled count is 75', JSON.stringify(acceptance));
  check(acceptance.uncalledFirst === 'EAST SUSSEX NATIONAL GOLF RESORT AND SPA', 'first Uncalled lead', acceptance.uncalledFirst);
  check(acceptance.uncalledLast === 'YMCA (BARNSLEY)', 'last Uncalled lead', acceptance.uncalledLast);
  check(acceptance.pennyhillPresent && acceptance.marlowAbsent, 'Uncalled membership edge cases', JSON.stringify(acceptance));
  check(acceptance.retryCount === 17, 'Retry count is 17', JSON.stringify(acceptance));
  check(acceptance.waitingCount === 10, 'Waiting reply count is 10', JSON.stringify(acceptance));
  check(acceptance.iron?.business === 'THE IRON GENERATION GYM', 'Iron Generation lead resolved', JSON.stringify(acceptance));
  check(!acceptance.iron.retry && acceptance.iron.waiting, 'Iron Generation excluded from Retry and retained in Waiting reply', JSON.stringify(acceptance));
  check(acceptance.iron.status === 'Contacted' && acceptance.iron.state === 'waiting reply', 'Iron Generation current state takes precedence', JSON.stringify(acceptance));

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await evaluate("activeFilters=['Retry']; const retryRows=applyFilter(); activateLeadQueue(retryRows,'Retry QA',retryRows[0]?.id); render(); window.scrollTo(0,0); true");
  await sleep(150);
  const layout = await evaluate(`(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    visibleLead: document.querySelector('.biz-head')?.textContent?.trim() || '',
    queueSize: filtered.length,
  }))()`);
  check(layout.documentWidth <= layout.viewport && layout.queueSize === 17, 'Retry mobile layout and queue size', JSON.stringify(layout));
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true });
  const screenshotBytes = Buffer.from(screenshot.data, 'base64');
  check(screenshotBytes.length > 15000, 'Retry screenshot nonblank', `${screenshotBytes.length} bytes`);
  await writeFile(resolve(outputDir, 'retry-real-sheet-mobile-390x844.png'), screenshotBytes);

  check(runtimeErrors.length === 0, 'zero browser runtime errors', runtimeErrors.join(' | '));
  check(consoleErrors.length === 0, 'zero browser console errors', consoleErrors.join(' | '));
  check(consoleWarnings.length === 0, 'zero browser console warnings', consoleWarnings.join(' | '));

  const report = {
    status: 'passed',
    browser: 'Microsoft Edge via Chrome DevTools Protocol',
    appUrl,
    fixture: basename(fixturePath),
    acceptance,
    checks,
    runtimeErrors,
    consoleErrors,
    consoleWarnings,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(resolve(outputDir, 'retry-real-sheet-edge-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Retry real-sheet Edge QA passed: ${checks.length} checks, ${acceptance.retryCount} Retry leads`);
} catch (error) {
  const report = {
    status: 'failed',
    error: String(error?.stack || error),
    acceptance,
    checks,
    runtimeErrors,
    consoleErrors,
    consoleWarnings,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(resolve(outputDir, 'retry-real-sheet-edge-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  if (cdp) cdp.close();
  edge.kill();
  edge.stdout.destroy();
  edge.stderr.destroy();
}
