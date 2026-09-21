import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const [appUrl, fixtureArg, outputArg, edgeArg] = process.argv.slice(2);
if (!appUrl || !fixtureArg || !outputArg || !edgeArg) {
  throw new Error('Usage: node callback_picker_edge_qa_2026_07_30.mjs <url> <fixture> <output> <edge>');
}

const fixturePath = resolve(fixtureArg);
const outputDir = resolve(outputArg);
const downloadDir = resolve(outputDir, 'downloads');
const profileDir = resolve(tmpdir(), `aresfit-callback-picker-edge-qa-${Date.now()}`);
const appOrigin = new URL(appUrl).origin;
await mkdir(downloadDir, { recursive: true });
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

const port = 9239;
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
  `--app=${appUrl}`,
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

let edgeStdout = '';
let edgeStderr = '';
edge.stdout.on('data', chunk => { edgeStdout += chunk; });
edge.stderr.on('data', chunk => { edgeStderr += chunk; });

let cdp;
const runtimeErrors = [];
const consoleErrors = [];
const consoleWarnings = [];

async function findPageTarget() {
  for (let attempt = 0; attempt < 100; attempt++) {
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

async function listDownloads() {
  return (await readdir(downloadDir)).filter(name => !name.endsWith('.crdownload'));
}

async function waitForDownload(before, pattern, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const files = await listDownloads();
    const match = files.find(name => !before.includes(name) && pattern.test(name));
    if (match) return match;
    await sleep(100);
  }
  throw new Error(`Download did not complete for ${pattern}`);
}

let pickerLifecycle;
let persisted;
let editAndClear;
let exportEvidence;

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
    cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    }),
    cdp.send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
    }),
  ]);

  await waitFor("document.readyState==='complete'");
  await waitFor("location.pathname.endsWith('aresfit-dialer-sandde-v2.html')");
  check((await evaluate('location.search')).includes('v=20260817-uk-callback-display-r1'), 'cache-busted entry redirect');

  await evaluate(`localStorage.clear();
    localStorage.setItem('aresfit_sandde_v2_user', JSON.stringify({name:'Callback QA',email:'qa@aresfit.co.uk'}));
    localStorage.setItem('aresfit_sandde_v2_prefs', JSON.stringify({queueBannerCollapsed:true,autoQueue:true,theme:'dark'}));
    location.reload(); true;`);
  await waitFor("document.readyState==='complete' && document.getElementById('upload-screen')?.style.display==='flex'");
  await evaluate("window.alert=()=>{}; window.confirm=()=>true; true");

  const fixtureText = await readFile(fixturePath, 'utf8');
  await evaluate(`processCsvFile(new File([${JSON.stringify(fixtureText)}], ${JSON.stringify(basename(fixturePath))}, {type:'text/csv'})); true`);
  await waitFor("document.getElementById('map-modal')?.style.display==='flex'");
  await evaluate('confirmImport(); true');
  await waitFor("document.getElementById('main-app')?.style.display==='block'");

  pickerLifecycle = await evaluate(`(() => {
    const lead=leads.find(item=>getLeadId(item)==='LQA001');
    filtered=leads;
    idx=leads.indexOf(lead);
    lead.cbDate='';
    lead.cbEndTime='';
    lead.cbSetAt=0;
    lead.pending={outcome:'Callback',text:'QA callback picker transaction',callStartTs:Date.now(),editedHm:'',reason:'',speakerRole:'DM',direction:'out'};
    render();

    const tomorrow=new Date();
    tomorrow.setDate(tomorrow.getDate()+1);
    const pad=value=>String(value).padStart(2,'0');
    const day=tomorrow.getFullYear()+'-'+pad(tomorrow.getMonth()+1)+'-'+pad(tomorrow.getDate());
    const finalStart=day+'T22:15';
    const partialStart=day+'T10:00';

    window.__cbQaCounts={save:0,renderCard:0,renderLeadList:0,renderDueQueueBanner:0};
    window.__cbQaOriginal={save,renderCard,renderLeadList,renderDueQueueBanner};
    save=(...args)=>{window.__cbQaCounts.save++;return window.__cbQaOriginal.save(...args)};
    renderCard=(...args)=>{window.__cbQaCounts.renderCard++;return window.__cbQaOriginal.renderCard(...args)};
    renderLeadList=(...args)=>{window.__cbQaCounts.renderLeadList++;return window.__cbQaOriginal.renderLeadList(...args)};
    renderDueQueueBanner=(...args)=>{window.__cbQaCounts.renderDueQueueBanner++;return window.__cbQaOriginal.renderDueQueueBanner(...args)};

    const start=document.getElementById('cb-in');
    start.focus();
    start.value=partialStart;
    start.dispatchEvent(new Event('change',{bubbles:true}));
    const firstChange={
      sameNode:document.getElementById('cb-in')===start&&start.isConnected,
      focused:document.activeElement===start,
      model:lead.cbDate,
      counts:{...window.__cbQaCounts},
    };
    start.value=finalStart;
    start.dispatchEvent(new Event('change',{bubbles:true}));
    const finalChange={
      sameNode:document.getElementById('cb-in')===start&&start.isConnected,
      focused:document.activeElement===start,
      model:lead.cbDate,
      inputValue:start.value,
      counts:{...window.__cbQaCounts},
    };
    const beforeStartBlur={...window.__cbQaCounts};
    start.blur();
    const afterStartBlur={...window.__cbQaCounts};
    const renderedStart=document.getElementById('cb-in');
    const startCommit={
      oldNodeRemoved:!start.isConnected,
      newNode:renderedStart!==start&&renderedStart.isConnected,
      inputValue:renderedStart.value,
      model:lead.cbDate,
      before:beforeStartBlur,
      after:afterStartBlur,
    };

    const end=document.getElementById('cb-end');
    end.focus();
    end.value='22:45';
    end.dispatchEvent(new Event('change',{bubbles:true}));
    end.value='23:15';
    end.dispatchEvent(new Event('change',{bubbles:true}));
    const endChanges={
      sameNode:document.getElementById('cb-end')===end&&end.isConnected,
      focused:document.activeElement===end,
      model:lead.cbEndTime,
      inputValue:end.value,
      counts:{...window.__cbQaCounts},
    };
    const beforeEndBlur={...window.__cbQaCounts};
    end.blur();
    const afterEndBlur={...window.__cbQaCounts};
    const endCommit={
      sameNode:document.getElementById('cb-end')===end&&end.isConnected,
      inputValue:end.value,
      model:lead.cbEndTime,
      before:beforeEndBlur,
      after:afterEndBlur,
    };

    const beforeEqual={...window.__cbQaCounts};
    const equalStart=document.getElementById('cb-in');
    equalStart.focus();
    equalStart.blur();
    const equalEnd=document.getElementById('cb-end');
    equalEnd.focus();
    equalEnd.blur();
    const afterEqual={...window.__cbQaCounts};

    const enterEnd=document.getElementById('cb-end');
    enterEnd.value='23:30';
    enterEnd.focus();
    const enterDispatchResult=enterEnd.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    const enterCommit={
      defaultPrevented:!enterDispatchResult,
      blurred:document.activeElement!==enterEnd,
      model:lead.cbEndTime,
      saveCount:window.__cbQaCounts.save,
    };

    document.getElementById('cb-in').scrollIntoView({block:'center'});
    const layout={
      viewport:innerWidth,
      documentWidth:document.documentElement.scrollWidth,
      startWidth:document.getElementById('cb-in').getBoundingClientRect().width,
      endWidth:document.getElementById('cb-end').getBoundingClientRect().width,
      cardWidth:document.querySelector('.card').getBoundingClientRect().width,
    };

    return {
      finalStart,
      finalEnd:lead.cbEndTime,
      firstChange,
      finalChange,
      startCommit,
      endChanges,
      endCommit,
      beforeEqual,
      afterEqual,
      enterCommit,
      layout,
    };
  })()`);

  check(pickerLifecycle.firstChange.sameNode && pickerLifecycle.firstChange.focused && pickerLifecycle.firstChange.model === '', 'first intermediate start change keeps picker input focused', JSON.stringify(pickerLifecycle.firstChange));
  check(pickerLifecycle.finalChange.sameNode && pickerLifecycle.finalChange.focused && pickerLifecycle.finalChange.model === '' && pickerLifecycle.finalChange.inputValue.endsWith('T22:15'), 'repeated start changes stay in one editing transaction', JSON.stringify(pickerLifecycle.finalChange));
  check(Object.values(pickerLifecycle.finalChange.counts).every(value => value === 0), 'intermediate start changes do not save or re-render', JSON.stringify(pickerLifecycle.finalChange.counts));
  check(pickerLifecycle.startCommit.oldNodeRemoved && pickerLifecycle.startCommit.newNode && pickerLifecycle.startCommit.model === pickerLifecycle.finalStart, 'start value commits only after blur', JSON.stringify(pickerLifecycle.startCommit));
  check(pickerLifecycle.startCommit.after.save === pickerLifecycle.startCommit.before.save + 1 && pickerLifecycle.startCommit.after.renderCard === pickerLifecycle.startCommit.before.renderCard + 1 && pickerLifecycle.startCommit.after.renderDueQueueBanner === pickerLifecycle.startCommit.before.renderDueQueueBanner + 1, 'start blur saves and refreshes callback queue once', JSON.stringify(pickerLifecycle.startCommit));
  check(pickerLifecycle.endChanges.sameNode && pickerLifecycle.endChanges.focused && pickerLifecycle.endChanges.model === '', 'repeated end-time changes keep picker input focused', JSON.stringify(pickerLifecycle.endChanges));
  check(pickerLifecycle.endCommit.sameNode && pickerLifecycle.endCommit.model === '23:15' && pickerLifecycle.endCommit.after.save === pickerLifecycle.endCommit.before.save + 1 && pickerLifecycle.endCommit.after.renderCard === pickerLifecycle.endCommit.before.renderCard, 'end time commits on blur without rebuilding the card', JSON.stringify(pickerLifecycle.endCommit));
  check(JSON.stringify(pickerLifecycle.beforeEqual) === JSON.stringify(pickerLifecycle.afterEqual), 'unchanged blur is a no-op', JSON.stringify(pickerLifecycle.afterEqual));
  check(pickerLifecycle.enterCommit.defaultPrevented && pickerLifecycle.enterCommit.blurred && pickerLifecycle.enterCommit.model === '23:30', 'Enter commits by blurring the time input', JSON.stringify(pickerLifecycle.enterCommit));
  check(pickerLifecycle.layout.documentWidth <= pickerLifecycle.layout.viewport && pickerLifecycle.layout.startWidth > 250 && pickerLifecycle.layout.endWidth > 250, 'callback inputs fit the 390px mobile app view', JSON.stringify(pickerLifecycle.layout));

  await sleep(100);
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  const screenshotBytes = Buffer.from(screenshot.data, 'base64');
  check(screenshotBytes.length > 10000, 'callback picker mobile screenshot nonblank', `${screenshotBytes.length} bytes`);
  await writeFile(resolve(outputDir, 'callback-picker-mobile-390x844.png'), screenshotBytes);

  const committed = await evaluate(`(() => {
    const lead=leads.find(item=>getLeadId(item)==='LQA001');
    filtered=leads;
    idx=leads.indexOf(lead);
    const notesBefore=lead.notes.length;
    const ok=commitPending();
    const callbackNote=lead.notes.filter(note=>note.outcome==='Callback').at(-1);
    const targetIndex=idx;
    idx=(targetIndex+1)%filtered.length;
    render();
    idx=targetIndex;
    render();
    save(true);
    return {
      ok,
      notesAdded:lead.notes.length-notesBefore,
      start:lead.cbDate,
      end:lead.cbEndTime,
      direction:callbackNote?.direction,
      noteEnd:callbackNote?.cbEndTime,
      returnedBusiness:filtered[idx]?.business,
      sessionStart:JSON.parse(localStorage.getItem('aresfit_sandde_v2_state'))?.leads?.find(item=>item.id===lead.id)?.cbDate,
    };
  })()`);
  check(committed.ok && committed.notesAdded === 1 && committed.start === pickerLifecycle.finalStart && committed.end === '23:30', 'callback note logs the complete start and end time', JSON.stringify(committed));
  check(committed.direction === 'out' && committed.noteEnd === '23:30' && committed.returnedBusiness === 'QA FRESH FITNESS', 'callback survives navigation away and back', JSON.stringify(committed));
  check(committed.sessionStart === pickerLifecycle.finalStart, 'complete callback is flushed to session storage', JSON.stringify(committed));

  await sleep(350);
  await evaluate('location.reload(); true');
  await waitFor("document.readyState==='complete' && document.getElementById('resume-box')?.style.display==='block'", 20000);
  await evaluate("window.alert=()=>{}; window.confirm=()=>true; true");
  await evaluate('(async()=>{await loadSession();return true})()');
  await waitFor("document.getElementById('main-app')?.style.display==='block' && leads.length===4", 20000);
  persisted = await evaluate(`(() => {
    const lead=leads.find(item=>getLeadId(item)==='LQA001');
    const note=lead.notes.filter(item=>item.outcome==='Callback').at(-1);
    return {
      build:APP_BUILD,
      release:RELEASE_ID,
      start:lead.cbDate,
      end:lead.cbEndTime,
      noteEnd:note?.cbEndTime,
      callbackState:classifyCallbackState(lead).state,
      exportFollowUp:buildCanonicalSheetRows().find(row=>row.Lead_ID==='LQA001')?.['Follow-up Date'],
    };
  })()`);
  check(persisted.build === '2026.08.17' && persisted.release === '20260817-uk-callback-display-r1', 'resumed session uses the UK callback display release', JSON.stringify(persisted));
  check(persisted.start === pickerLifecycle.finalStart && persisted.end === '23:30' && persisted.noteEnd === '23:30', 'complete callback survives reload and resume', JSON.stringify(persisted));
  check(persisted.callbackState === 'future callback' && persisted.exportFollowUp === `${pickerLifecycle.finalStart.replace('T',' ')}-23:30`, 'future callback classification and export snapshot retain the complete callback', JSON.stringify(persisted));

  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });
  const before = await listDownloads();
  await evaluate('exportCSV(); true');
  const csvName = await waitForDownload(before, /^AresFit_Call_Sheet_\d{2}-\d{2}-\d{4}_\d{4}\.csv$/);
  const csvText = (await readFile(resolve(downloadDir, csvName), 'utf8')).replace(/^\ufeff/, '');
  exportEvidence = {
    fileName: csvName,
    rowCount: csvText.trimEnd().split(/\r?\n/).length - 1,
    expectedFollowUp: persisted.exportFollowUp,
    containsLead: csvText.includes('LQA001'),
    containsFollowUp: csvText.includes(persisted.exportFollowUp),
  };
  check(exportEvidence.rowCount === 4 && exportEvidence.containsLead && exportEvidence.containsFollowUp, 'downloaded CSV contains the complete callback window', JSON.stringify(exportEvidence));

  editAndClear = await evaluate(`(() => {
    const lead=leads.find(item=>getLeadId(item)==='LQA001');
    filtered=leads;
    idx=leads.indexOf(lead);
    render();
    const noteCount=lead.notes.length;
    openCbEdit();
    document.getElementById('cbe-date').value=lead.cbDate.replace('22:15','20:45');
    document.getElementById('cbe-end').value='21:30';
    saveCbEdit();
    const edited={start:lead.cbDate,end:lead.cbEndTime,modal:document.getElementById('cb-edit-modal').style.display};
    openCbEdit();
    clearCbEdit();
    save(true);
    return {
      edited,
      cleared:{start:lead.cbDate,end:lead.cbEndTime,followUp:lead.followUp},
      notesPreserved:lead.notes.length===noteCount,
    };
  })()`);
  check(editAndClear.edited.start.endsWith('T20:45') && editAndClear.edited.end === '21:30' && editAndClear.edited.modal === 'none', 'existing callback edits through the modal', JSON.stringify(editAndClear));
  check(editAndClear.cleared.start === '' && editAndClear.cleared.end === '' && editAndClear.cleared.followUp === '' && editAndClear.notesPreserved, 'clearing callback removes schedule without deleting note history', JSON.stringify(editAndClear));

  check(runtimeErrors.length === 0, 'zero browser runtime errors', runtimeErrors.join(' | '));
  check(consoleErrors.length === 0, 'zero browser console errors', consoleErrors.join(' | '));
  check(consoleWarnings.length === 0, 'zero browser console warnings', consoleWarnings.join(' | '));

  const report = {
    status: 'passed',
    browser: 'Microsoft Edge app-mode via Chrome DevTools Protocol',
    mobileEmulation: '390x844 with iPhone Safari user agent',
    scopeNote: 'Native iOS picker lifecycle is represented by repeated focused change events followed by one blur commit.',
    appUrl,
    fixture: basename(fixturePath),
    pickerLifecycle,
    persisted,
    exportEvidence,
    editAndClear,
    checks,
    runtimeErrors,
    consoleErrors,
    consoleWarnings,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(resolve(outputDir, 'callback-picker-edge-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Callback picker Edge QA passed: ${checks.length} checks`);
} catch (error) {
  const report = {
    status: 'failed',
    error: String(error?.stack || error),
    pickerLifecycle,
    persisted,
    exportEvidence,
    editAndClear,
    checks,
    runtimeErrors,
    consoleErrors,
    consoleWarnings,
    edgeStdout,
    edgeStderr,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(resolve(outputDir, 'callback-picker-edge-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  if (cdp) cdp.close();
  edge.kill();
  edge.stdout.destroy();
  edge.stderr.destroy();
  await sleep(200);
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}
