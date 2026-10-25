import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {DeckHost,owner} from './host.mjs';
import {ToolBroker,GovernedRuntime} from './ae.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||8314);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid PORT');
const origin=`http://127.0.0.1:${port}`;const session=randomBytes(32).toString('hex');
const state=resolve(process.env.REVEAL_STATE_DIR||resolve(root,'.agentic-state'));mkdirSync(state,{recursive:true,mode:0o700});
const host=new DeckHost({database:resolve(state,'deck.sqlite'),indexPath:resolve(root,'index.html'),allowWrite:process.argv.includes('--allow-write')});
const broker=new ToolBroker(host),turns=new Map();
const model={async complete(request){let s=turns.get(request.runId);if(!s){const text=request.messages.filter(m=>m.role==='user').map(m=>m.content).join('\n');const match=/^replace slide ([12]): ([^\n]{1,1000})(?:\n|$)/.exec(text);s={turn:0,match};turns.set(request.runId,s)}s.turn++;let toolCalls=[];
 if(s.turn===1)toolCalls=[{callId:'inspect',name:'read_deck',arguments:{deckId:'index'}}];
 if(s.turn===2&&s.match)toolCalls=[{callId:'edit',name:'replace_slide_text',arguments:{deckId:'index',slide:Number(s.match[1])-1,text:s.match[2],expectedVersion:host.snapshot(owner).version}}];
 return{schemaVersion:'1',requestId:request.requestId,mode:'simulated',message:toolCalls.length?'':s.match?'The host receipt confirms the local deck edit.':'Deck inspection complete. To edit, use: replace slide 1: Your text',toolCalls,finishReason:toolCalls.length?'tool-calls':'stop'};
}};
const runtime=new GovernedRuntime({broker,model,maxTurns:5});
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
const body=async req=>{let value='';for await(const c of req){value+=c;if(Buffer.byteLength(value)>16384)throw Error('Request too large')}return JSON.parse(value)};
const server=createServer(async(req,res)=>{try{
 if(req.headers.host!==`127.0.0.1:${port}`){json(res,403,{error:'HOST_DENIED'});return}
 const url=new URL(req.url,origin),path=url.pathname;
 if(path.startsWith('/ae/')){
  if(!String(req.headers.cookie||'').split(';').some(c=>c.trim()===`reveal_session=${session}`)){json(res,401,{error:'LOCAL_SESSION_REQUIRED'});return}
  if(req.method!=='GET'&&(req.headers.origin!==origin||req.headers['content-type']!=='application/json')){json(res,403,{error:'ORIGIN_OR_CONTENT_TYPE_DENIED'});return}
  if(req.method==='GET'&&path==='/ae/deck'){json(res,200,{...host.snapshot(owner),writeEnabled:host.allowWrite,mode:'Deterministic simulated caller · no paid model API',persistence:'Deck and receipts: SQLite. Runs and pending approvals: memory; restart invalidates pending approvals.'});return}
  if(req.method==='GET'&&path==='/ae/runs'){json(res,200,runtime.list(owner));return}
  if(req.method==='POST'&&path==='/ae/runs'){const input=await body(req);if(Object.keys(input).join()!=='input'||typeof input.input!=='string')throw Error('Only input is accepted');json(res,200,await runtime.start({principal:owner,releaseId:'reveal-local-v1',input:input.input,context:{deckId:'index'}}));return}
  const match=/^\/ae\/runs\/([a-zA-Z0-9-]+)(?:\/(decision|cancel|reconcile))?$/.exec(path);
  if(match){const [,id,action]=match;if(req.method==='GET'&&!action){json(res,200,runtime.get(id,owner));return}if(req.method==='POST'&&action){const input=await body(req);let result;if(action==='decision'){if(Object.keys(input).sort().join()!=='approvalId,decision,expectedHash'||!['approve','reject'].includes(input.decision))throw Error('Invalid decision');result=await runtime.decide(id,owner,input)}else{if(Object.keys(input).length)throw Error('Empty object required');result=runtime[action](id,owner)}json(res,200,result);return}}
  json(res,404,{error:'NOT_FOUND'});return
 }
 if(req.method!=='GET'){json(res,405,{error:'METHOD_DENIED'});return}
 if(path==='/'||path==='/index.html'){
  res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','Set-Cookie':`reveal_session=${session}; HttpOnly; SameSite=Strict; Path=/`,'X-Content-Type-Options':'nosniff'});
  res.end(readFileSync(resolve(root,'index.html'),'utf8').replace('</body>','<script type="module" src="/agentic/assistant.mjs"></script></body>'));return
 }
 const allowed=path==='/agentic/assistant.mjs'||/^\/(dist|examples|css|plugin)\/[a-zA-Z0-9_./-]+$/.test(path)||path==='/demo.html';
 const file=resolve(root,'.'+path);if(!allowed||!file.startsWith(root+'/')||!existsSync(file)||realpathSync(file)!==file){json(res,404,{error:'NOT_FOUND'});return}
 const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4'};
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(readFileSync(file));
 }catch(error){json(res,400,{error:error.code||error.message||'REQUEST_FAILED'})}});
server.listen(port,'127.0.0.1',()=>console.log(`reveal.js Agentic: ${origin} · ${host.allowWrite?'local durable edits enabled':'read-only (use --allow-write to enable local edits)'} · simulated caller`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{host.close();process.exit(0)}));
