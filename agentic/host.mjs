import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {z,digest,PolicyError,samePrincipal,validateDefinitions,parseCapabilityArguments} from './ae.mjs';
export const owner={tenantId:'local',applicationId:'reveal-authoring',subjectId:'local-owner',roles:['editor'],scopes:['deck:read','deck:write']};
const read=z.strictObject({deckId:z.literal('index')});
const edit=z.strictObject({deckId:z.literal('index'),slide:z.number().int().min(0).max(1),text:z.string().trim().min(1).max(1000),expectedVersion:z.number().int().positive()});
const definition=(name,parameters,write)=>({parameters,capability:{schemaVersion:'1',capabilityId:name,version:'1',description:write?'Replace plain text of one slide in the local two-slide deck. Durable authoring overlay, not HTML or script execution.':'Read the local deck text and version.',inputSchema:z.toJSONSchema(parameters),outputSchema:{},risk:write?'write':'read',requiredScopes:[write?'deck:write':'deck:read'],sourceRevision:'reveal-6.0.2-local-v1',bindingHash:digest({name,schema:z.toJSONSchema(parameters)}),approvalRequired:write,idempotency:'operation-key',supportsOutcomeQuery:true,timeoutMs:5000}});
export const definitions=validateDefinitions({read_deck:definition('read_deck',read,false),replace_slide_text:definition('replace_slide_text',edit,true)});
/** Single local operator boundary. reveal.js has no authentication server; this is not multi-user auth. */
export class DeckHost{
 policyVersion='reveal-local-v1';definitions=definitions;
 constructor({database,indexPath,allowWrite=false}){
  this.allowWrite=allowWrite;this.enabled=true;this.db=new DatabaseSync(database);
  this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS deck(id TEXT PRIMARY KEY, version INTEGER NOT NULL, slides TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipts(operation TEXT PRIMARY KEY, hash TEXT NOT NULL, principal TEXT NOT NULL, result TEXT NOT NULL)');
  const source=readFileSync(indexPath,'utf8');const slides=[...source.matchAll(/<section>([^<]*)<\/section>/g)].map(x=>x[1]);
  if(slides.length!==2)throw Error('Only the pinned two plain-text slide index deck is supported.');
  this.db.prepare('INSERT OR IGNORE INTO deck VALUES (?,1,?)').run('index',JSON.stringify(slides));
 }
 current(p,write=false){if(!this.enabled||!samePrincipal(p,owner)||!p.scopes.includes(write?'deck:write':'deck:read')||!p.roles.includes('editor')||(write&&!this.allowWrite))throw new PolicyError('LOCAL_AUTHORITY_DENIED');return structuredClone(p)}
 supports(n){return Object.hasOwn(this.definitions,n)}
 authorizeCapability(p,n){if(!this.supports(n))throw new PolicyError('CAPABILITY_NOT_ALLOWED');this.current(p,n==='replace_slide_text')}
 referenceTarget(n,a){return parseCapabilityArguments(this.definitions,n,a).deckId}
 snapshot(p){this.current(p);const row=this.db.prepare('SELECT * FROM deck WHERE id=?').get('index');return{deckId:'index',version:row.version,slides:JSON.parse(row.slides)}}
 assertReadable(p,t){this.current(p);if(t.targetId!=='index'||!this.supports(t.capabilityId))throw new PolicyError('RESOURCE_DENIED')}
 prepareTarget(p,n,a){this.authorizeCapability(p,n);a=parseCapabilityArguments(this.definitions,n,a);const d=this.snapshot(p);if(n==='read_deck')return{targetId:'index',preview:{deckId:'index'}};if(a.expectedVersion!==d.version)throw new PolicyError('RESOURCE_VERSION_CONFLICT');return{targetId:'index',expectedResourceVersion:String(d.version),preview:{deckId:'index',slide:a.slide+1,before:d.slides[a.slide],after:a.text,version:d.version,effect:'Durable local SQLite authoring overlay; source HTML is unchanged.'}}}
 readResult(p,r){this.assertReadable(p,r);if(r.capabilityId!=='read_deck')throw new PolicyError('CAPABILITY_NOT_ALLOWED');return this.snapshot(p)}
 write(p,r){
  this.authorizeCapability(p,r.capabilityId);if(r.capabilityId!=='replace_slide_text'||r.capabilityVersion!=='1')throw new PolicyError('CAPABILITY_NOT_ALLOWED');
  const a=edit.parse(r.arguments);if(r.targetId!==a.deckId||r.expectedResourceVersion!==String(a.expectedVersion))throw new PolicyError('REQUEST_BINDING_MISMATCH');
  const hash=digest(r),principal=digest({tenantId:p.tenantId,applicationId:p.applicationId,subjectId:p.subjectId});
  this.db.exec('BEGIN IMMEDIATE');try{
   const old=this.db.prepare('SELECT * FROM receipts WHERE operation=?').get(r.operationId);
   if(old){if(old.hash!==hash||old.principal!==principal)throw new PolicyError('OPERATION_CONFLICT');this.db.exec('COMMIT');return JSON.parse(old.result)}
   const d=this.snapshot(p);if(d.version!==a.expectedVersion){this.db.exec('ROLLBACK');return{status:'denied',code:'RESOURCE_VERSION_CONFLICT',message:'Deck changed. Prepare a fresh approval.'}}
   d.slides[a.slide]=a.text;d.version++;
   const result={status:'succeeded',operationId:r.operationId,receiptId:randomUUID(),data:d};
   this.db.prepare('UPDATE deck SET version=?,slides=? WHERE id=?').run(d.version,JSON.stringify(d.slides),'index');
   this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?)').run(r.operationId,hash,principal,JSON.stringify(result));this.db.exec('COMMIT');return result;
  }catch(e){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw e}
 }
 query(p,operationId,request){this.current(p,true);const row=this.db.prepare('SELECT * FROM receipts WHERE operation=?').get(operationId);if(!row)return{status:'outcome-unknown',operationId,message:'No durable receipt. Do not retry blindly.'};if(row.principal!==digest({tenantId:p.tenantId,applicationId:p.applicationId,subjectId:p.subjectId})||(request&&row.hash!==digest(request)))throw new PolicyError('RECEIPT_BINDING_MISMATCH');return JSON.parse(row.result)}
 close(){this.db.close()}
}
