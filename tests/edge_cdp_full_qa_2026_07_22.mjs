import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const [appUrl, fixtureArg, outputArg, edgeArg] = process.argv.slice(2);
if (!appUrl || !fixtureArg || !outputArg || !edgeArg) {
  throw new Error('Usage: node edge_cdp_full_qa_2026_07_22.mjs <url> <fixture> <output> <edge>');
}

const fixturePath = resolve(fixtureArg);
const outputDir = resolve(outputArg);
const downloadDir = resolve(outputDir, 'downloads');
const profileDir = resolve(tmpdir(), `aresfit-edge-qa-${Date.now()}`);
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
      this.ws.addEventListener('error', event => { clearTimeout(timer); reject(new Error(`CDP WebSocket error: ${event.message || 'unknown'}`)); }, { once: true });
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const { resolve: resolvePromise, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message}${message.error.data ? `: ${message.error.data}` : ''}`));
        else resolvePromise(message.result || {});
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

  close() { if (this.ws && this.ws.readyState < 2) this.ws.close(); }
}

const port = 9237;
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

let edgeStdout = '';
let edgeStderr = '';
edge.stdout.on('data', chunk => { edgeStdout += chunk; });
edge.stderr.on('data', chunk => { edgeStderr += chunk; });

let cdp;
const runtimeErrors = [];
const consoleErrors = [];

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

async function waitFor(expression, timeout = 10000) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(`Boolean(${expression})`, { userGesture: false })) return true;
    } catch (error) { lastError = String(error); }
    await sleep(80);
  }
  throw new Error(`Timed out waiting for ${expression}${lastError ? ` (${lastError})` : ''}`);
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

async function capture(name, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 430,
    screenWidth: width,
    screenHeight: height,
  });
  await evaluate('window.scrollTo(0,0); true', { userGesture: false });
  await sleep(100);
  const layout = await evaluate(`(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    cardWidth: document.querySelector('.card')?.scrollWidth || 0,
    cardClientWidth: document.querySelector('.card')?.clientWidth || 0,
    stickyHeight: Math.round(document.querySelector('.sticky-top')?.getBoundingClientRect().height || 0),
    clippedButtons: [...document.querySelectorAll('button')].filter(button => button.offsetParent !== null && button.scrollWidth > button.clientWidth + 2).map(button => (button.textContent || '').trim()).slice(0,10)
  }))()`);
  check(layout.documentWidth <= layout.viewport, `${name} horizontal page fit`, JSON.stringify(layout));
  check(layout.cardWidth <= layout.cardClientWidth + 1, `${name} card fit`, JSON.stringify(layout));
  check(layout.clippedButtons.length === 0, `${name} button text fit`, JSON.stringify(layout));
  const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true });
  const bytes = Buffer.from(image.data, 'base64');
  check(bytes.length > 15000, `${name} screenshot nonblank`, `${bytes.length} bytes`);
  await writeFile(resolve(outputDir, `${name}.png`), bytes);
  return layout;
}

async function captureUpload(name, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
  });
  await evaluate('window.scrollTo(0,0); true', { userGesture: false });
  await sleep(100);
  const layout = await evaluate(`(() => {
    const screen=document.getElementById('upload-screen');
    const card=document.querySelector('.upload-card');
    const zone=document.getElementById('upload-zone');
    const title=card?.querySelector('.logo span');
    const sender=card?.querySelector('.x-btn');
    const cardRect=card?.getBoundingClientRect();
    const zoneRect=zone?.getBoundingClientRect();
    const titleRect=title?.getBoundingClientRect();
    const senderRect=sender?.getBoundingClientRect();
    const cardStyle=card?getComputedStyle(card):null;
    const contentLeft=(cardRect?.left||0)+parseFloat(cardStyle?.borderLeftWidth||0)+parseFloat(cardStyle?.paddingLeft||0);
    const contentRight=(cardRect?.right||0)-parseFloat(cardStyle?.borderRightWidth||0)-parseFloat(cardStyle?.paddingRight||0);
    const contentWidth=contentRight-contentLeft;
    const contentCentre=(contentLeft+contentRight)/2;
    const overlaps=!!(titleRect&&senderRect&&titleRect.left<senderRect.right&&titleRect.right>senderRect.left&&titleRect.top<senderRect.bottom&&titleRect.bottom>senderRect.top);
    return {
      display:getComputedStyle(screen).display,
      viewport:window.innerWidth,
      viewportHeight:window.innerHeight,
      documentWidth:document.documentElement.scrollWidth,
      cardLeft:cardRect?.left||0,
      cardRight:cardRect?.right||0,
      cardTop:cardRect?.top||0,
      cardBottom:cardRect?.bottom||0,
      cardWidth:cardRect?.width||0,
      cardHeight:cardRect?.height||0,
      cardCentreDelta:Math.abs(((cardRect?.left||0)+(cardRect?.right||0))/2-window.innerWidth/2),
      zoneLeft:zoneRect?.left||0,
      zoneRight:zoneRect?.right||0,
      zoneWidth:zoneRect?.width||0,
      zoneHeight:zoneRect?.height||0,
      contentWidth,
      zoneWidthDelta:Math.abs((zoneRect?.width||0)-contentWidth),
      zoneCentreDelta:Math.abs(((zoneRect?.left||0)+(zoneRect?.right||0))/2-contentCentre),
      titleSenderOverlap:overlaps,
      zoneTextClipped:!!zone&&(zone.scrollWidth>zone.clientWidth+1||zone.scrollHeight>zone.clientHeight+1),
      clippedButtons:[...card.querySelectorAll('button')].filter(button=>button.scrollWidth>button.clientWidth+1).map(button=>(button.textContent||'').trim())
    };
  })()`);
  check(layout.display === 'flex', `${name} upload screen visible`, JSON.stringify(layout));
  check(layout.documentWidth <= layout.viewport, `${name} horizontal page fit`, JSON.stringify(layout));
  check(layout.cardCentreDelta <= 1, `${name} upload card centred`, JSON.stringify(layout));
  check(layout.zoneCentreDelta <= 1 && layout.zoneWidthDelta <= 1.5, `${name} upload control full-width and centred`, JSON.stringify(layout));
  check(layout.zoneHeight >= 145, `${name} upload control usable height`, JSON.stringify(layout));
  check(layout.cardTop >= 0 && layout.cardBottom <= layout.viewportHeight, `${name} upload card vertical fit`, JSON.stringify(layout));
  check(!layout.titleSenderOverlap, `${name} title and sender do not overlap`, JSON.stringify(layout));
  check(!layout.zoneTextClipped, `${name} upload text fit`, JSON.stringify(layout));
  check(layout.clippedButtons.length === 0, `${name} upload buttons fit`, JSON.stringify(layout));
  const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true });
  const bytes = Buffer.from(image.data, 'base64');
  check(bytes.length > 10000, `${name} screenshot nonblank`, `${bytes.length} bytes`);
  await writeFile(resolve(outputDir, `${name}.png`), bytes);
  return layout;
}

try {
  const target = await findPageTarget();
  cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  cdp.on('Runtime.exceptionThrown', event => runtimeErrors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || 'runtime exception'));
  cdp.on('Runtime.consoleAPICalled', event => {
    if (event.type === 'error') consoleErrors.push(event.args?.map(arg => arg.value || arg.description || '').join(' ') || 'console error');
  });
  cdp.on('Log.entryAdded', event => { if (event.entry?.level === 'error') consoleErrors.push(event.entry.text); });
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
    localStorage.setItem('aresfit_sandde_v2_user', JSON.stringify({name:'Sandde Kloer',email:'sandde@aresfit.co.uk'}));
    localStorage.setItem('aresfit_sandde_v2_prefs', JSON.stringify({queueBannerCollapsed:true,autoQueue:true,theme:'dark'}));
    location.reload(); true;`);
  await sleep(400);
  await waitFor("document.readyState==='complete' && document.getElementById('upload-screen')?.style.display==='flex'");
  await evaluate("window.__qaAlerts=[]; window.alert=message=>window.__qaAlerts.push(String(message)); window.confirm=()=>true; true");
  await evaluate("document.getElementById('resume-box').style.display='block'; true");

  await captureUpload('upload-mobile-320x568', 320, 568);
  await captureUpload('upload-mobile-390x844', 390, 844);
  await captureUpload('upload-mobile-430x932', 430, 932);

  const fixtureText = await readFile(fixturePath, 'utf8');
  await evaluate(`processCsvFile(new File([${JSON.stringify(fixtureText)}], ${JSON.stringify(basename(fixturePath))}, {type:'text/csv'})); true`);
  await waitFor("document.getElementById('map-modal')?.style.display==='flex'");
  await evaluate('confirmImport(); true');
  await waitFor("document.getElementById('main-app')?.style.display==='block'");

  const imported = await evaluate(`(() => ({
    build: APP_BUILD,
    release: RELEASE_ID,
    rows: raw.length,
    leads: leads.length,
    schema: SHEET_COLS.length,
    first: filtered[idx]?.business,
    source: sourceMeta.fileName,
    retryAttempts: leads.find(lead=>getLeadId(lead)==='LQA003')?.attempts,
    callbackRole: leads.find(lead=>getLeadId(lead)==='LQA002')?.notes[0]?.speakerRole,
    queueCollapsed: prefs.queueBannerCollapsed,
    headerHeight: Math.round(document.querySelector('.sticky-top').getBoundingClientRect().height),
    dueSlotHeight: Math.round(document.getElementById('due-queue-slot').getBoundingClientRect().height)
  }))()`);
  check(imported.build === '2026.08.17' && imported.release === '20260817-uk-callback-display-r1', 'build and release identity', JSON.stringify(imported));
  check(imported.rows === 4 && imported.leads === 4 && imported.schema === 22, '22-column import counts', JSON.stringify(imported));
  check(imported.first === 'QA FRESH FITNESS' && imported.source === basename(fixturePath), 'imported source and first lead', JSON.stringify(imported));
  check(imported.retryAttempts === 1 && imported.callbackRole === 'DM', 'structured note restoration', JSON.stringify(imported));
  check(imported.queueCollapsed && imported.dueSlotHeight < 55 && imported.headerHeight < 280, 'compact callback header default', JSON.stringify(imported));

  await evaluate(`prefs.queueGate={date:todayKey(),warmReviewed:true,blockersReviewed:true,overrideReason:''}; savePrefs(); render(); true`);
  const validation = await evaluate(`(() => {
    const callback=leads.find(lead=>getLeadId(lead)==='LQA001');
    filtered=leads; idx=leads.indexOf(callback); callback.cbDate='';
    callback.pending={outcome:'Callback',text:'QA scheduled callback',callStartTs:0,editedHm:'',reason:'',speakerRole:'DM',direction:'out'};
    const notesBefore=callback.notes.length;
    const blockedCallback=commitPending();
    callback.cbDate='2026-08-01T10:30';
    const committedCallback=commitPending();
    const lost=leads.find(lead=>getLeadId(lead)==='LQA003');
    idx=leads.indexOf(lost); lost.pending={outcome:'Not Int.',text:'QA not interested',callStartTs:0,editedHm:'',reason:'',speakerRole:'GK'};
    const blockedLost=commitPending();
    lost.pending.reason='unknown';
    const committedLost=commitPending();
    return {
      blockedCallback, committedCallback, callbackAdded:callback.notes.length-notesBefore,
      blockedLost, committedLost, lostReason:eventLog.filter(row=>row.business_name==='QA RETRY GYM').at(-1)?.reason,
      alerts:[...window.__qaAlerts]
    };
  })()`);
  check(validation.blockedCallback === false && validation.committedCallback === true && validation.callbackAdded === 1, 'callback date enforcement and commit', JSON.stringify(validation));
  check(validation.blockedLost === false && validation.committedLost === true && validation.lostReason === 'unknown', 'lost reason enforcement and commit', JSON.stringify(validation));

  const noteEdit = await evaluate(`(() => {
    const lead=leads.find(item=>getLeadId(item)==='LQA002');
    const note=lead.notes.find(item=>item.outcome==='Callback');
    openNoteEdit(lead.id,note.id);
    document.getElementById('ne-speaker').value='GK';
    document.getElementById('ne-cb-date').value=lead.cbDate||'2026-08-02T11:00';
    saveNoteEdit();
    return {speaker:note.speakerRole,audit:eventLog.at(-1),modal:document.getElementById('note-edit-modal').style.display};
  })()`);
  check(noteEdit.speaker === 'GK' && noteEdit.audit?.proof_source === 'in-app note edit audit' && noteEdit.modal === 'none', 'editable DM/GK note and audit', JSON.stringify(noteEdit));

  const queueState = await evaluate(`(() => {
    const retry=leads.find(lead=>getLeadId(lead)==='LQA003');
    const callback=leads.find(lead=>getLeadId(lead)==='LQA002');
    activateLeadQueue([retry,callback],'Retry + callback',retry.id); render();
    const chip=document.querySelector('.queue-chip');
    const visible=!!chip&&chip.offsetParent!==null;
    const text=chip?.textContent.trim();
    nav(1);
    return {visible,text,position:idx,current:filtered[idx]?.business};
  })()`);
  check(queueState.visible && /1\/2/.test(queueState.text) && queueState.position === 1 && queueState.current === 'QA CALLBACK CLUB', 'compact persistent queue and navigation', JSON.stringify(queueState));
  await sleep(250);
  const savedQueue = await evaluate(`(() => {const state=JSON.parse(localStorage.getItem('aresfit_sandde_v2_state'));return{ids:state.queueLeadIds.length,index:state.idx,selected:state.selectedLeadId}})()`);
  check(savedQueue.ids === 2 && savedQueue.index === 1, 'queue position saved to session', JSON.stringify(savedQueue));

  const realClipboard = await evaluate("copyTextVerified('AresFit browser QA clipboard')");
  check(typeof realClipboard.ok === 'boolean' && ['clipboard-api','execCommand','none'].includes(realClipboard.method), 'browser clipboard result is verified and typed', JSON.stringify(realClipboard));

  await cdp.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/136 Mobile Safari/537.36', platform: 'Android' });
  const androidDial = await evaluate(`(async()=>{
    window.__dialHref='';
    launchHrefFromUserGesture=href=>{window.__dialHref=href};
    copyTextVerified=async()=>({ok:true,method:'qa-mock'});
    const lead=leads.find(item=>getLeadId(item)==='LQA001');
    lead.mobileVerified=true; filtered=[lead]; idx=0;
    tapCall('primary'); await new Promise(resolve=>setTimeout(resolve,0));
    return{href:window.__dialHref,route:lead.pending.dialRoute,feedback:lead.pending.dialFeedback,copy:lead.pending.dialCopyOk};
  })()`);
  check(androidDial.route === 'android-circleloop-intent' && androidDial.href.includes('package=com.circleloop') && androidDial.href.includes('browser_fallback_url=tel%3A'), 'Android CircleLoop intent with telephone fallback', JSON.stringify(androidDial));
  check(androidDial.copy === true && /number copied/.test(androidDial.feedback), 'verified dial clipboard feedback', JSON.stringify(androidDial));

  await cdp.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
  const iosRoute = await evaluate(`(() => {prefs.clScheme='circleloop://keypad/';return dialRouteForNumber('03301243155')})()`);
  check(iosRoute.kind === 'ios-circleloop-scheme' && iosRoute.href === 'circleloop://keypad/03301243155', 'iOS CircleLoop route', JSON.stringify(iosRoute));

  const callbackDisplay = await evaluate(`(() => {
    clearLeadQueue();
    const lead=leads.find(item=>getLeadId(item)==='LQA002');
    filtered=leads;idx=leads.indexOf(lead);render();
    return{dueBanners:document.querySelectorAll('.due-banner').length,topText:document.getElementById('due-queue-slot').textContent.trim(),cardBusiness:document.querySelector('.biz-head').textContent};
  })()`);
  check(callbackDisplay.dueBanners <= 1 && !callbackDisplay.topText, 'no duplicate callback banner on active lead', JSON.stringify(callbackDisplay));

  const accessibility = await evaluate(`(() => {
    const ids=[...document.querySelectorAll('[id]')].map(element=>element.id);
    const duplicates=ids.filter((id,index)=>ids.indexOf(id)!==index);
    const unnamedButtons=[...document.querySelectorAll('button')].filter(button=>button.offsetParent!==null&&!((button.textContent||button.getAttribute('aria-label')||'').trim())).length;
    const unlabelledControls=[...document.querySelectorAll('input,select,textarea')].filter(control=>control.type!=='hidden'&&control.offsetParent!==null&&!control.closest('label')&&!control.getAttribute('aria-label')&&!control.getAttribute('aria-labelledby')&&!(control.id&&document.querySelector('label[for="'+control.id+'"]'))).length;
    return{duplicates:[...new Set(duplicates)],unnamedButtons,unlabelledControls};
  })()`);
  check(accessibility.duplicates.length === 0 && accessibility.unnamedButtons === 0 && accessibility.unlabelledControls === 0, 'runtime accessibility names and unique IDs', JSON.stringify(accessibility));

  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });
  const downloads = {};
  let before = await listDownloads();
  await evaluate('clearLeadQueue(); exportCSV(); true');
  downloads.csv = await waitForDownload(before, /^AresFit_Call_Sheet_\d{2}-\d{2}-\d{4}_\d{4}\.csv$/);
  before = await listDownloads();
  await evaluate('exportSessionPackage(); true');
  downloads.package = await waitForDownload(before, /^AresFit_Session_Package_\d{2}-\d{2}-\d{4}_\d{4}\.zip$/);
  before = await listDownloads();
  await evaluate('exportEventLog(); true');
  downloads.eventLog = await waitForDownload(before, /^AresFit_Event_Log_\d{2}-\d{2}-\d{4}_\d{4}\.csv$/);
  before = await listDownloads();
  await evaluate('exportNotionDelta(); true');
  downloads.notion = await waitForDownload(before, /^AresFit_Notion_Delta_\d{2}-\d{2}-\d{4}_\d{4}\.md$/);
  before = await listDownloads();
  await evaluate('downloadHandover(); true');
  downloads.handover = await waitForDownload(before, /^handover-\d{2}-\d{2}-\d{4}_\d{4}\.md$/);
  before = await listDownloads();
  await evaluate('exportCircleLoopContacts(null,{}); true');
  downloads.circleLoop = await waitForDownload(before, /^CircleLoop_Contacts_\d{2}-\d{2}-\d{4}_\d{4}\.csv$/);

  const csvText = (await readFile(resolve(downloadDir, downloads.csv), 'utf8')).replace(/^\ufeff/, '');
  const packageBytes = await readFile(resolve(downloadDir, downloads.package));
  const handoverText = await readFile(resolve(downloadDir, downloads.handover), 'utf8');
  check(csvText.split(/\r?\n/)[0].split(',').length === 22 && csvText.includes('LQA001'), 'downloaded 22-column CSV round trip');
  check(packageBytes.includes(Buffer.from('AresFit_Call_Sheet_')) && packageBytes.includes(Buffer.from('handover-')), 'session package inner files');
  check(handoverText.includes('**Release:** 20260817-uk-callback-display-r1') && handoverText.includes('**Export schema:** AresFit-22-column-v1 - 22 columns'), 'handover provenance');
  check(Object.values(downloads).every(name => /\d{2}-\d{2}-\d{4}_\d{4}/.test(name)), 'all export filenames use readable date and time', JSON.stringify(downloads));

  await evaluate(`clearLeadQueue(); filtered=leads; idx=0; prefs.queueBannerCollapsed=true; render(); document.querySelector('.toast')?.remove(); window.scrollTo(0,0); true`);
  const layouts = {};
  layouts.mobile320 = await capture('mobile-320x568', 320, 568);
  layouts.mobile390 = await capture('mobile-390x844', 390, 844);
  layouts.mobile430 = await capture('mobile-430x932', 430, 932);
  layouts.desktop = await capture('desktop-1440x1000', 1440, 1000);
  check(layouts.mobile390.stickyHeight < 280, 'mobile header remains compact', JSON.stringify(layouts.mobile390));

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
  await evaluate('openSettings(); true');
  await waitFor("document.getElementById('settings-modal')?.style.display==='flex'");
  const diagnosticText = await evaluate("document.getElementById('diagnostics-body').textContent");
  check(diagnosticText.includes('Build: 2026.08.17') && diagnosticText.includes('Last dial route: android-circleloop-intent') && diagnosticText.includes('Last download request:'), 'settings diagnostics evidence', diagnosticText);
  await evaluate("document.querySelector('.toast')?.remove(); true", { userGesture: false });
  const settingsImage = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  await writeFile(resolve(outputDir, 'mobile-settings-390x844.png'), Buffer.from(settingsImage.data, 'base64'));

  check(runtimeErrors.length === 0, 'zero browser runtime errors', runtimeErrors.join(' | '));
  check(consoleErrors.length === 0, 'zero browser console errors', consoleErrors.join(' | '));

  const relevantEdgeStderr = edgeStderr.split(/\r?\n/).filter(line => line && !/DevTools listening|ITaskbarList3|edge_aadc/.test(line));
  const report = {
    status: 'passed',
    browser: 'Microsoft Edge via Chrome DevTools Protocol',
    appUrl,
    fixture: basename(fixturePath),
    checks,
    downloads,
    runtimeErrors,
    consoleErrors,
    edgeStderr: relevantEdgeStderr,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(resolve(outputDir, 'edge-cdp-qa-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Edge CDP QA passed: ${checks.length} checks`);
} catch (error) {
  const report = {
    status: 'failed',
    error: String(error?.stack || error),
    checks,
    runtimeErrors,
    consoleErrors,
    edgeStdout,
    edgeStderr,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(resolve(outputDir, 'edge-cdp-qa-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  if (cdp) cdp.close();
  edge.kill();
  edge.stdout.destroy();
  edge.stderr.destroy();
}
