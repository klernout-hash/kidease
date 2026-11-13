#!/usr/bin/env node
/** No-input, original-document diagnostic. Never substitutes for first-click evidence. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { localAuditUrl } from "./polish-coverage.mjs";
import { inspectFixtureSurface } from "./polish-fixture-prepare.mjs";
import { inspectPolishReadiness } from "./polish-readiness.mjs";
import { isForbiddenFixturePath } from "./polish-fixture-lib.mjs";
import { controlledSearchPath, inspectSearchGeography, searchGeographyMatches, CONTROLLED_SEARCH_CASE } from "./polish-settled-surface.mjs";
import { CONTROLLED_ACCEPT_ENCODING, CONTROLLED_DOCUMENT_ACCEPT, htmlTransportFacts, loadControlledProtocol, userAgentsFromVersion } from "./polish-controlled-protocol.mjs";

export const OBSERVE_NETWORK = Object.freeze({ offline: false, latency: 562.5, downloadThroughput: (1474.56 * 1024) / 8, uploadThroughput: (675 * 1024) / 8, connectionType: "cellular4g" });
export function observationPath(id, locale, mode = "controlled") {
  if (!["home", "search"].includes(id) || !["en", "fr"].includes(locale) || !["empty", "controlled"].includes(mode)) throw new Error("Unsupported observation case.");
  return id === "home" ? (locale === "fr" ? "/fr" : "/") : mode === "controlled" ? controlledSearchPath(locale) : `${locale === "fr" ? "/fr" : ""}/search`;
}
export function safeObservationUrl(value) {
  try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? u.origin + (/auth|session|password|callback|token/i.test(u.pathname) ? "/[sensitive-path]" : u.pathname) : `[${u.protocol.replace(":", "")}]`; }
  catch { return "[unavailable-url]"; }
}
/** Keep numeric timeline arguments and URL locations; drop arbitrary string payloads entirely. */
export function sanitizeObservationTrace(trace) {
  const args = (value, key = "") => {
    if (/headers|cookie|authorization|password|token|postData|body|payload|scriptSource/i.test(key)) return undefined;
    if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
    if (typeof value === "string") return /^(url|documentURL|scriptName)$/i.test(key) ? safeObservationUrl(value) : undefined;
    if (Array.isArray(value)) return value.map(v => args(v)).filter(v => v !== undefined);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).flatMap(([k,v]) => { const clean = args(v,k); return clean === undefined ? [] : [[k,clean]]; }));
    return undefined;
  };
  return { traceEvents: (trace.traceEvents || []).map(event => ({ ...Object.fromEntries(["ts","dur","tdur","tts","pid","tid"].filter(k => typeof event[k] === "number").map(k => [k,event[k]])), name: String(event.name || "").replace(/https?:\/\/\S+/g, safeObservationUrl), cat: String(event.cat || ""), ph: String(event.ph || ""), args: args(event.args || {}) })), privacy: "Headers, arbitrary strings, credentials, payloads and URL queries removed; original trace retained in memory only." };
}
export function originalDocumentProof({ documentCount, trustedInputs, initialOrigin, finalOrigin, elapsedMs }) {
  return documentCount === 1 && trustedInputs === 0 && initialOrigin === finalOrigin && Number.isFinite(initialOrigin) && elapsedMs >= 30000;
}
const hash = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, Math.max(0,ms)));
const bounded = async (promise, ms = 5000) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_,reject) => { timer=setTimeout(()=>reject(new Error("Diagnostic operation exceeded its bounded window.")),ms); })]); }
  finally { clearTimeout(timer); }
};
function cleanStartup(value) {
  if (!value) return;
  if(value.entry)value.entry.src=safeObservationUrl(value.entry.src);
  value.modules=value.modules.map(m=>({...m,src:safeObservationUrl(m.src)}));
  value.resources=value.resources.map(r=>({...r,name:safeObservationUrl(r.name)}));
  if(value.navigation?.name)value.navigation.name=safeObservationUrl(value.navigation.name);
}

function observer() {
  if (window.top !== window) return;
  const data = { timeOrigin: performance.timeOrigin, marks: {}, handlers: [], modules: [], resources: [], trustedInputs: [], states: [] };
  const mark = key => { data.marks[key] ??= performance.now(); };
  const emit = () => window.__polishObserveRecord?.({ origin:location.origin, timeOrigin: data.timeOrigin, marks: data.marks, handlers: data.handlers, trustedInputs: data.trustedInputs }).catch(() => {});
  for (const kind of ["pointerdown","keydown","click","wheel","touchstart","input"])
    addEventListener(kind, event => { if (event.isTrusted) { data.trustedInputs.push({ type: kind, at: performance.now() }); emit(); } }, true);
  document.addEventListener("DOMContentLoaded", () => { mark("domContentLoaded"); emit(); }, { once: true });
  addEventListener("load", () => { mark("windowLoad"); emit(); }, { once: true });
  document.addEventListener("load", event => { if (event.target?.tagName === "SCRIPT") data.modules.push({ at: performance.now(), src: event.target.src, module: event.target.type === "module", event: "load-after-evaluation" }); }, true);
  document.addEventListener("error", event => { if (event.target?.tagName === "SCRIPT") data.modules.push({ at: performance.now(), src: event.target.src, event: "error" }); }, true);
  const inspect = () => {
    if (document.querySelector("h1")) mark("firstH1");
    if (document.querySelector("article[data-slug]")) mark("firstListingArticle");
    const entry = document.querySelector('script[type="module"][src]');
    if (entry && !data.entry) data.entry = { at: performance.now(), src: entry.src };
    const menu = document.querySelector('header [aria-controls="ke-nav-drawer"]');
    if (menu) {
      mark("menuElementPresent");
      const key = Object.keys(menu).find(k => k.startsWith("__reactProps$"));
      const attached = Boolean(key && typeof menu[key]?.onClick === "function");
      if (data.handlers.at(-1)?.attached !== attached) { data.handlers.push({ at: performance.now(), attached }); if (attached) mark("menuOnClickAttached"); emit(); }
    }
    const state = { hold: document.documentElement?.hasAttribute("data-ke-launch-hold") || false, skeletons: [...document.querySelectorAll(".ke-skel")].filter(n => n.getClientRects().length).length };
    if (JSON.stringify(data.states.at(-1)?.state) !== JSON.stringify(state)) data.states.push({ at: performance.now(), state });
  };
  const timer = setInterval(inspect,100);
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) if (["script","fetch","xmlhttprequest"].includes(e.initiatorType)) data.resources.push({ name:e.name,type:e.initiatorType,startTime:e.startTime,responseEnd:e.responseEnd,duration:e.duration }); }).observe({ type:"resource",buffered:true }); } catch { /* unsupported resource observation remains absent */ }
  window.__polishObserveSnapshot = () => ({ ...data, url:location.origin+location.pathname, headings:[...document.querySelectorAll("h1")].map(n=>n.textContent.trim()), userAgent:navigator.userAgent, at:performance.now(), navigation:performance.getEntriesByType("navigation")[0]?.toJSON() });
  addEventListener("pagehide", () => { clearInterval(timer); mark("pagehide"); emit(); }, { once:true });
  inspect(); emit();
}

async function run() {
  const argv = process.argv.slice(2); const value = (name,fallback="") => { const i=argv.indexOf(`--${name}`);return i<0?fallback:argv[i+1]; };
  const phase=value("phase"), base=localAuditUrl(value("base")), sourceSha=value("source-sha"), mode=value("search-mode","controlled");
  if (!/^[a-f0-9]{40}$/.test(sourceSha) || !["empty","controlled"].includes(mode)) throw new Error("Exact --source-sha and --search-mode empty|controlled are required.");
  const protocol=loadControlledProtocol({manifestFile:value("fixture-manifest"),phase,base,sourceSha,expectedHtmlEncoding:value("html-encoding")});
  if(argv.includes("--validate-protocol")){console.log(JSON.stringify({validated:true,protocol:protocol.metadata,cohort:`no-input-${mode}`}));return;}
  if(!argv.includes("--quiet-window-confirmed"))throw new Error("Root must authorize the quiet window; pass --quiet-window-confirmed only afterward.");
  const ids=value("pages","home,search").split(","),locales=value("locales","en,fr").split(",");
  ids.forEach(id=>locales.forEach(locale=>observationPath(id,locale,mode)));
  const state=protocol.stateFor("guest");if(state.cookies.some(c=>/session|auth|token/i.test(c.name)))throw new Error("No-input startup accepts only a captured guest state.");
  const out=resolve(value("out",`../evidence/iteration-4/${phase}/no-input-${mode}`));
  if(!out.startsWith(resolve(process.cwd(),"..")+"/")&&!out.startsWith("/tmp/"))throw new Error("Output must remain inside this task workspace.");
  if(existsSync(out))throw new Error("Refusing to overwrite any existing diagnostic directory.");mkdirSync(out,{recursive:true});
  const files=["polish-startup-observe.mjs","polish-controlled-protocol.mjs","polish-settled-surface.mjs","polish-fixture-prepare.mjs","polish-fixture-lib.mjs","polish-readiness.mjs"];
  const report={phase,sourceSha,startedAt:new Date().toISOString(),protocol:protocol.metadata,collectorHashes:Object.fromEntries(files.map(file=>[file,hash(readFileSync(new URL(file,import.meta.url)).toString())])),methodology:{cohort:`no-input-${mode}`,windowMs:30000,viewport:{width:1280,height:800},cpuRate:4,network:OBSERVE_NETWORK,input:"NONE: no click, focus, key, hover, wheel or form action; original-document observation only",comparison:"Separate from the immutable DCL+1s first-attempt click collector. No LCP, INP, fast-hydration or production-CDN claim.",warmup:"One same-URL document GET with actual-derived desktop UA and matching Accept/Accept-Encoding; no asset warmup",instrumentation:"100ms handler/DOM polling, resource observation and CDP timeline/network; diagnostic overhead is present. Initial/final captures may queue after their requested instant.",privacy:"Guest loopback only; external/WS/health/status/seed paths blocked, no payload/header secrets saved",serverNetwork:"Actual response.protocol recorded per request; direct local HTTP1.1 is not a production-CDN model"},results:[]};
  const save=()=>writeFileSync(resolve(out,"summary.json"),JSON.stringify(report,null,2));save();
  for(const id of ids)for(const locale of locales){
    protocol.assertCurrentValidity();const row={id,locale,searchMode:mode,requestedUrl:new URL(observationPath(id,locale,mode),base).href,blocked:[],errors:[],documents:[],network:[],complete:false};report.results.push(row);save();let browser,cdp,tracing=false,stream;
    try{
      browser=await chromium.launch({headless:true,executablePath:value("chrome","/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),args:["--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--proxy-server=http://127.0.0.1:9","--proxy-bypass-list=127.0.0.1;localhost"]});
      const versionSession=await browser.newBrowserCDPSession();const ua=userAgentsFromVersion(await versionSession.send("Browser.getVersion"));await versionSession.detach();row.userAgents=ua;
      const context=await browser.newContext({viewport:report.methodology.viewport,userAgent:ua.desktop,storageState:state,extraHTTPHeaders:{"Accept-Encoding":CONTROLLED_ACCEPT_ENCODING},serviceWorkers:"block",colorScheme:"light",reducedMotion:"reduce"});
      await context.routeWebSocket("**",socket=>socket.close());await context.route("**/*",route=>{const u=new URL(route.request().url());if(["data:","blob:","about:"].includes(u.protocol))return route.continue();let p=u.pathname;try{p=decodeURIComponent(p).replace(/\/+/g,"/").replace(/\/+$/,"");}catch{/* origin remains checked */}if(u.origin!==base||isForbiddenFixturePath(p)||/^\/api\/(?:health|e2e-seed|provider|parent|admin|government|staff|org)(?:\/|$)/i.test(p)||/^\/(?:fr\/)?(?:status|provider|parent|admin|government|staff|org)(?:\/|$)/i.test(p)){row.blocked.push({origin:u.origin,path:u.origin===base?p:null});return route.abort("blockedbyclient");}return route.request().resourceType()==="document"?route.continue({headers:{...route.request().headers(),accept:CONTROLLED_DOCUMENT_ACCEPT}}):route.continue();});
      const warm=await context.request.get(row.requestedUrl,{headers:{"user-agent":ua.desktop,accept:CONTROLLED_DOCUMENT_ACCEPT,"accept-encoding":CONTROLLED_ACCEPT_ENCODING},maxRedirects:0,timeout:45000});const body=await warm.body();row.warmup={status:warm.status(),userAgent:ua.desktop,accept:CONTROLLED_DOCUMENT_ACCEPT,acceptEncoding:CONTROLLED_ACCEPT_ENCODING,transport:htmlTransportFacts(warm.headers(),body.length,protocol.metadata.expectedHtmlEncoding)};
      if(row.warmup.status!==200||!row.warmup.transport.encodingMatched)throw new Error("The single document warmup failed its source/transport contract.");
      const documents=new Map();await context.exposeBinding("__polishObserveRecord",(source,message)=>{if(!source.frame.parentFrame()&&message.origin===base)documents.set(message.timeOrigin,message);});await context.addInitScript(observer);
      const page=await context.newPage();page.on("pageerror",()=>row.errors.push({kind:"pageerror",detail:"Omitted to avoid arbitrary string/credential retention"}));cdp=await context.newCDPSession(page);
      await cdp.send("Page.enable");row.actualTransitions=[];cdp.on("Page.frameNavigated",e=>{if(!e.frame.parentId)row.actualTransitions.push({kind:"document",url:safeObservationUrl(e.frame.url),observedUtc:new Date().toISOString()});});cdp.on("Page.navigatedWithinDocument",e=>row.actualTransitions.push({kind:"same-document",url:safeObservationUrl(e.url),observedUtc:new Date().toISOString()}));await cdp.send("Network.enable");await cdp.send("Network.setCacheDisabled",{cacheDisabled:true});await cdp.send("Network.emulateNetworkConditions",OBSERVE_NETWORK);await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
      const requests=new Map(),headerExtras=new Map();const safeHeaders=headers=>{const h=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));return{userAgent:h["user-agent"]||null,accept:h.accept||null,acceptEncoding:h["accept-encoding"]||null};};
      cdp.on("Network.requestWillBeSentExtraInfo",e=>{headerExtras.set(e.requestId,safeHeaders(e.headers));if(requests.get(e.requestId)?.type==="Document")Object.assign(requests.get(e.requestId),safeHeaders(e.headers));});
      cdp.on("Network.requestWillBeSent",e=>{const u=new URL(e.request.url);if(u.origin!==base)return;requests.set(e.requestId,{requestId:e.requestId,path:safeObservationUrl(e.request.url),type:e.type,method:e.request.method,start:e.timestamp,category:e.type==="Script"?"module":/Fetch|XHR/.test(e.type)?"rpc-or-public-fetch":"other",...(e.type==="Document"?(headerExtras.get(e.requestId)||safeHeaders(e.request.headers)): {})});});
      cdp.on("Network.responseReceived",e=>{const r=requests.get(e.requestId);if(r)Object.assign(r,{response:e.timestamp,status:e.response.status,protocol:e.response.protocol,mimeType:e.response.mimeType,fromDiskCache:e.response.fromDiskCache||false,contentEncoding:String(Object.entries(e.response.headers).find(([k])=>k.toLowerCase()==="content-encoding")?.[1]||"identity").toLowerCase().trim()});});
      cdp.on("Network.loadingFinished",e=>{const r=requests.get(e.requestId);if(r)Object.assign(r,{finish:e.timestamp,encodedBytes:e.encodedDataLength});});cdp.on("Network.loadingFailed",e=>{const r=requests.get(e.requestId);if(r)Object.assign(r,{failedAt:e.timestamp,failed:true,canceled:e.canceled||false});});
      await cdp.send("Tracing.start",{categories:"devtools.timeline,v8.execute,blink.user_timing,loading,disabled-by-default-devtools.timeline",transferMode:"ReturnAsStream"});tracing=true;
      const hostStart=performance.now();row.navigationStartUtc=new Date().toISOString();const snapshot=()=>bounded((async()=>{const startup=await page.evaluate(()=>window.__polishObserveSnapshot?.()||null);const surface=await page.evaluate(inspectFixtureSurface,{pageId:id});const readiness=await page.evaluate(inspectPolishReadiness,{pageId:id});const geography=id==="search"?await page.evaluate(inspectSearchGeography):null;return{hostElapsedMs:performance.now()-hostStart,startup,surface,surfaceHash:hash(surface),readiness,geography};})());
      const shot=async(label)=>{const at=performance.now()-hostStart;const result=await bounded(cdp.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false}));const filename=`${id}-${locale}-${label}.png`;writeFileSync(resolve(out,filename),Buffer.from(result.data,"base64"));return{file:filename,requestedHostElapsedMs:at,completedHostElapsedMs:performance.now()-hostStart};};
      const initialTask=page.goto(row.requestedUrl,{waitUntil:"commit",timeout:35000}).then(async response=>{row.httpStatus=response?.status();row.initial=await snapshot();row.initialScreenshot=await shot("initial");}).catch(()=>{row.errors.push({kind:"initial-capture-unavailable"});});
      await pause(30000-(performance.now()-hostStart));row.stopRequestedHostElapsedMs=performance.now()-hostStart;const completed=new Promise(resolveComplete=>cdp.once("Tracing.tracingComplete",resolveComplete));await cdp.send("Tracing.end");tracing=false;
      row.final=await snapshot();row.finalScreenshot=await shot("final");await bounded(initialTask);stream=(await bounded(completed)).stream;
      let raw="";const readStarted=performance.now();for(;;){if(performance.now()-readStarted>15000)throw new Error("Trace stream exceeded its diagnostic budget.");const chunk=await bounded(cdp.send("IO.read",{handle:stream}));raw+=chunk.base64Encoded?Buffer.from(chunk.data,"base64").toString():chunk.data;if(chunk.eof)break;}await cdp.send("IO.close",{handle:stream});stream=null;
      row.documents=[...documents.values()];row.network=[...requests.values()];const origin=row.initial?.startup?.timeOrigin;const finalOrigin=row.final?.startup?.timeOrigin;const trustedInputs=row.documents.reduce((n,d)=>n+(d.trustedInputs?.length||0),0);
      row.originalDocumentUncensored=originalDocumentProof({documentCount:documents.size,trustedInputs,initialOrigin:origin,finalOrigin,elapsedMs:row.stopRequestedHostElapsedMs});row.routeStayedSame=row.initial?.startup?.url===row.final?.startup?.url;row.trustedInputCount=trustedInputs;row.menuHandlerObservedBy30s=Boolean(row.final?.startup?.handlers.some(h=>h.attached&&h.at<=30000));row.handlerFirstObservedMs=row.final?.startup?.marks.menuOnClickAttached??null;
      const expected=protocol.expectedSurface(id==="home"?"guest-home":"guest",locale);row.canonicalParityApplicable=expected?.surface?.pageId===id&&(id==="home"||mode==="controlled");row.finalFullContentParity=row.canonicalParityApplicable?row.final.surfaceHash===hash(expected.surface):null;row.finalParityScope=row.canonicalParityApplicable?"Exact own-surface canonical comparison":"Own-surface canonical unavailable or empty-query diagnostic: hashes retained, no canonical content pass claimed";row.finalGeographyReady=id==="search"&&mode==="controlled"?searchGeographyMatches(row.final.geography,CONTROLLED_SEARCH_CASE):null;
      const document=row.network.find(r=>r.type==="Document");row.actualDocumentHeaders=document?{userAgent:document.userAgent,accept:document.accept,acceptEncoding:document.acceptEncoding}:null;row.userAgentMatched=row.final.startup?.userAgent===ua.desktop&&document?.userAgent===ua.desktop;row.documentEncodingMatched=document?.contentEncoding===protocol.metadata.expectedHtmlEncoding;row.documentAcceptMatched=document?.accept===CONTROLLED_DOCUMENT_ACCEPT&&document?.acceptEncoding===CONTROLLED_ACCEPT_ENCODING;
      row.complete=row.originalDocumentUncensored&&row.routeStayedSame&&row.userAgentMatched&&row.documentEncodingMatched&&row.documentAcceptMatched&&row.httpStatus===200;row.strictFinalContent=row.final.readiness.ready&&row.final.readiness.healthy&&(!row.canonicalParityApplicable||row.finalFullContentParity===true)&&(row.finalGeographyReady!==false);if(id==="search"&&mode==="controlled"&&!row.canonicalParityApplicable)row.strictFinalContent=false;row.validityAtEnd=protocol.assertCurrentValidity();
      row.trace=`${id}-${locale}-trace-sanitized.json`;const sanitized=sanitizeObservationTrace(JSON.parse(raw));await browser.close();browser=null;writeFileSync(resolve(out,row.trace),JSON.stringify(sanitized));
    }catch{row.complete=false;row.errors.push({kind:"diagnostic-failed",detail:"No retry performed; no pass claimed"});}
    finally{if(tracing)await cdp?.send("Tracing.end").catch(()=>{});if(stream)await cdp?.send("IO.close",{handle:stream}).catch(()=>{});await browser?.close();for(const stateName of ["initial","final"])cleanStartup(row[stateName]?.startup);row.browserClosed=true;save();}
  }
  report.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({out,cases:report.results.length,complete:report.results.filter(r=>r.complete).length,allBrowsersClosed:report.results.every(r=>r.browserClosed)}));if(report.results.some(r=>!r.complete||!r.strictFinalContent))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await run();
