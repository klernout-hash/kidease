import assert from 'node:assert/strict';
import {test} from 'node:test';
import {startClaimLookup} from '../src/lib/claim-lookup.ts';
import {createServerFnFetch} from '../src/lib/server-fn-client.ts';

const endpoint='http://127.0.0.1/_serverFn/synthetic-claim-read';
const rows=()=>new Response(JSON.stringify([{id:'synthetic-lotus'}]),{headers:{'content-type':'application/json'}});
function deferred(){let resolve;const promise=new Promise(yes=>resolve=yes);return{promise,resolve};}
async function flush(){for(let i=0;i<40;i+=1)await Promise.resolve();}
function clock(t){t.mock.timers.enable({apis:['setTimeout']});return async ms=>{t.mock.timers.tick(ms);await flush();};}
const read=(gate,query,signal)=>gate(endpoint,{method:'POST',body:JSON.stringify({query}),signal}).then(r=>r.json());

test('known-offline lookup does not spend the shared retry budget; restored Retry works immediately',async t=>{
 const tick=clock(t);let online=false,calls=0,elapsed=0;
 const gate=createServerFnFetch({now:()=>elapsed,sleep:async ms=>{elapsed+=ms;},fetchImpl:async()=>{calls+=1;if(!online)throw new Error('offline synthetic transport');return rows();}});
 const states=[];
 const stop=startClaimLookup('Synthetic Lotus',(q,signal)=>read(gate,q,signal),s=>states.push(s),{isOnline:()=>online});
 await tick(180);
 assert.equal(states.at(-1).status,'error');
 assert.equal(calls,0,'Offline state must not exhaust the function circuit with transport attempts');
 stop();online=true;
 startClaimLookup('Synthetic Lotus',(q,signal)=>read(gate,q,signal),s=>states.push(s),{isOnline:()=>online});
 await tick(180);
 assert.equal(states.at(-1).status,'ready');
 assert.deepEqual(states.at(-1).hits,[{id:'synthetic-lotus'}]);
 assert.equal(calls,1);
});

test('superseding a held lookup cancels its transport and releases the function queue',async t=>{
 const tick=clock(t),old=deferred(),states=[];let firstSignal,calls=0;
 const gate=createServerFnFetch({fetchImpl:async(_input,init)=>{calls+=1;if(calls===1){firstSignal=init.signal;return old.promise;}return rows();}});
 const stop=startClaimLookup('Synthetic Juniper',(q,signal)=>read(gate,q,signal),s=>states.push(s),{isOnline:()=>true});
 await tick(180);assert.equal(calls,1);
 stop();
 const stopNext=startClaimLookup('Synthetic Lotus',(q,signal)=>read(gate,q,signal),s=>states.push(s),{isOnline:()=>true});
 await tick(180);
 try{
  assert.equal(firstSignal?.aborted,true,'The abandoned request must be cancelled, not merely hidden');
  assert.equal(calls,2,'Newer query must run before the old transport resolves');
  assert.equal(states.at(-1).status,'ready');
  assert.equal(states.at(-1).query,'Synthetic Lotus');
 }finally{stopNext();old.resolve(rows());await flush();}
});

test('a lookup deadline cancels the held transport so a fresh retry is not queued behind it',async t=>{
 const tick=clock(t),held=deferred(),states=[];let firstSignal,calls=0;
 const gate=createServerFnFetch({fetchImpl:async(_input,init)=>{calls+=1;if(calls===1){firstSignal=init.signal;return held.promise;}return rows();}});
 const stop=startClaimLookup('Synthetic Lotus',(q,signal)=>read(gate,q,signal),s=>states.push(s),{isOnline:()=>true,timeoutMs:500});
 await tick(180);await tick(500);assert.equal(states.at(-1).status,'error');
 const stopNext=startClaimLookup('Synthetic Lotus',(q,signal)=>read(gate,q,signal),s=>states.push(s),{isOnline:()=>true});
 await tick(180);
 try{
  assert.equal(firstSignal?.aborted,true,'Expired lookup must abort the pending request');
  assert.equal(calls,2);
  assert.equal(states.at(-1).status,'ready');
 }finally{stop();stopNext();held.resolve(rows());await flush();}
});
