import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DeckHost,owner} from '../agentic/host.mjs';
import {ToolBroker,GovernedRuntime} from '../agentic/ae.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function setup(t,options={}) {
 const directory=mkdtempSync(join(tmpdir(),'reveal-agentic-test-'));
 const database=join(directory,'deck.sqlite');
 const host=new DeckHost({database,indexPath:join(root,'index.html'),allowWrite:true});
 t.after(()=>{try{host.close()}finally{rmSync(directory,{recursive:true,force:true})}});
 const broker=new ToolBroker(host,options);
 const prepare=(run='test-run',args={})=>broker.prepare(owner,run,'edit','replace_slide_text',{deckId:'index',slide:0,text:'Approved',expectedVersion:1,...args});
 const approve=p=>{const a=broker.requestApproval(owner,p,'reveal-local-v1');broker.approvals.decide(owner,{approvalId:a.binding.approvalId,expectedHash:a.expectedHash,decision:'approve'});return a.binding.approvalId};
 return{host,broker,prepare,approve,database};
}
test('exact approval required; confirmed write and repeat preserve one receipt',async t=>{
 const {host,broker,prepare,approve}=setup(t);const p=prepare();
 assert.equal((await broker.execute(owner,p,'reveal-local-v1')).status,'denied');assert.equal(host.snapshot(owner).version,1);
 const id=approve(p),result=await broker.execute(owner,p,'reveal-local-v1',id);assert.equal(result.status,'succeeded');
 assert.deepEqual(await broker.execute(owner,p,'reveal-local-v1',id),result);assert.equal(host.snapshot(owner).version,2);
 assert.throws(()=>broker.approvals.decide(owner,{approvalId:id,expectedHash:'wrong',decision:'approve'}));
});
test('foreign principal, missing rights, unknown deck and extra fields fail closed',t=>{
 const {broker}=setup(t);const read=p=>broker.prepare(p,'read','read','read_deck',{deckId:'index'});
 assert.throws(()=>read({...owner,subjectId:'other'}));assert.throws(()=>read({...owner,scopes:[]}));
 assert.throws(()=>broker.prepare(owner,'r','read','read_deck',{deckId:'other'}));
 assert.throws(()=>broker.prepare(owner,'r','edit','replace_slide_text',{deckId:'index',slide:0,text:'x',expectedVersion:1,html:'<script>'}));
});
test('revocation and cancellation between approval and dispatch prevent mutation',async t=>{
 const {host,broker,prepare,approve}=setup(t);const p=prepare(),id=approve(p);host.allowWrite=false;
 assert.equal((await broker.execute(owner,p,'reveal-local-v1',id)).status,'denied');host.allowWrite=true;
 const controller=new AbortController();controller.abort();assert.equal((await broker.execute(owner,p,'reveal-local-v1',id,controller.signal)).status,'denied');assert.equal(host.snapshot(owner).version,1);
});
test('competing approved stale target cannot overwrite a newer edit',async t=>{
 const {host,broker,prepare,approve}=setup(t);const first=prepare('one'),second=prepare('two',{text:'Newer'}),a=approve(first),b=approve(second);
 assert.equal((await broker.execute(owner,second,'reveal-local-v1',b)).status,'succeeded');assert.equal((await broker.execute(owner,first,'reveal-local-v1',a)).status,'denied');assert.equal(host.snapshot(owner).slides[0],'Newer');assert.equal(host.snapshot(owner).version,2);
});
test('lost response reconciles durable receipt without repeating the edit',async t=>{
 const {host,broker,prepare,approve}=setup(t,{loseWriteResponse:true});const p=prepare(),id=approve(p);
 assert.equal((await broker.execute(owner,p,'reveal-local-v1',id)).status,'outcome-unknown');assert.equal(host.snapshot(owner).version,2);
 const receipt=broker.reconcile(owner,p);assert.equal(receipt.status,'succeeded');assert.equal(host.snapshot(owner).version,2);
 assert.deepEqual(await broker.execute(owner,p,'reveal-local-v1',id),receipt);
});
test('durable receipts survive another host connection; conflicting operation rejected',async t=>{
 const {host,broker,prepare,approve,database}=setup(t);const p=prepare();const result=await broker.execute(owner,p,'reveal-local-v1',approve(p));
 const reopened=new DeckHost({database,indexPath:join(root,'index.html'),allowWrite:true});
 try{assert.deepEqual(reopened.query(owner,p.request.operationId,p.request),result);assert.deepEqual(reopened.write(owner,p.request),result);assert.equal(reopened.snapshot(owner).version,2);assert.throws(()=>reopened.write(owner,{...p.request,arguments:{...p.request.arguments,text:'Conflict'}}))}finally{reopened.close()}
});
test('shared AE agent loop pauses for exact end-user confirmation (simulated caller)',async t=>{
 const {host,broker}=setup(t);let turn=0;const model={async complete(r){turn++;const calls=turn===1?[{callId:'read',name:'read_deck',arguments:{deckId:'index'}}]:turn===2?[{callId:'edit',name:'replace_slide_text',arguments:{deckId:'index',slide:1,text:'From the shared runtime',expectedVersion:1}}]:[];return{schemaVersion:'1',requestId:r.requestId,mode:'simulated',message:calls.length?'':'The durable receipt confirms the edit.',toolCalls:calls,finishReason:calls.length?'tool-calls':'stop'}}};
 const runtime=new GovernedRuntime({broker,model});let run=await runtime.start({principal:owner,releaseId:'reveal-local-v1',input:'Prepare the fixture edit'});assert.equal(run.status,'awaiting-approval');assert.equal(host.snapshot(owner).version,1);
 run=await runtime.decide(run.runId,owner,{approvalId:run.approval.binding.approvalId,expectedHash:run.approval.expectedHash,decision:'approve'});assert.equal(run.status,'succeeded');assert.equal(host.snapshot(owner).slides[1],'From the shared runtime');assert.equal(host.snapshot(owner).version,2);
});
