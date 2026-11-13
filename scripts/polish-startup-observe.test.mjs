import test from "node:test";
import assert from "node:assert/strict";
import { observationPath, safeObservationUrl, sanitizeObservationTrace, originalDocumentProof, OBSERVE_NETWORK } from "./polish-startup-observe.mjs";
test("empty and controlled searches remain explicitly separate cases",()=>{
  assert.equal(observationPath("search","fr","empty"),"/fr/search");
  assert.equal(observationPath("search","fr","controlled"),"/fr/search?q=Winnipeg%2C%20MB");
  assert.equal(observationPath("home","en"),"/");assert.throws(()=>observationPath("provider","en"));
  assert.equal(OBSERVE_NETWORK.latency,562.5);assert.equal(OBSERVE_NETWORK.downloadThroughput,(1474.56*1024)/8);
});
test("timeline privacy removes secrets and arbitrary strings while retaining numeric milestones",()=>{
  const clean=sanitizeObservationTrace({traceEvents:[{name:"EvaluateScript",cat:"devtools.timeline",ph:"X",ts:123,dur:45,args:{data:{url:"http://user:password@127.0.0.1:8091/assets/entry.js?token=SECRET#fragment",headers:{cookie:"SECRET"},postData:"SECRET",scriptSource:"SECRET",arbitrary:"SECRET",lineNumber:4}}}]});
  assert.doesNotMatch(JSON.stringify(clean),/SECRET|password@|fragment/);assert.equal(clean.traceEvents[0].args.data.lineNumber,4);assert.equal(clean.traceEvents[0].dur,45);
  assert.equal(safeObservationUrl("http://127.0.0.1/api/auth/SECRET?x=y"),"http://127.0.0.1/[sensitive-path]");
});
test("input or a replaced document cannot count as an uncensored thirty-second observation",()=>{
  const proof={documentCount:1,trustedInputs:0,initialOrigin:100,finalOrigin:100,elapsedMs:30000};assert.equal(originalDocumentProof(proof),true);
  for(const change of [{trustedInputs:1},{documentCount:2},{finalOrigin:101},{elapsedMs:29999}])assert.equal(originalDocumentProof({...proof,...change}),false);
});
