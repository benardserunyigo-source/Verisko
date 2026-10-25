import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createDraftCostsHandler} from '../netlify/functions/lib/draft-costs-core.mjs';
import {FieldMemoryStore} from './helpers/field-fixture.mjs';
import {draftCostEstimate,draftPaymentOptions} from '../draft-payment-options.mjs';
const baseline={policy:{contingency:.1,callbacks:200000,acquisition:50000,overhead:200000,processing:.03,monthly:.02},packages:{4:{direct:2200000},6:{direct:3150000},8:{direct:4100000},12:{direct:5900000}}};
function fixture(){
 const store=new FieldMemoryStore(),workspace={jobs:[{id:'job-a',prospectId:'client-a',business:'TEST Shop',cameraCount:4,stage:'Accepted',quotedTotal:5280000,paymentPlan:'installments',paymentSchedule:[{amount:2110000,due:'2026-10-24'}],fundingApproved:true},{id:'job-b',prospectId:'client-b',cameraCount:4},{id:'job-six',cameraCount:6},{id:'job-eight',quoteSnapshot:{cameras:8}},{id:'job-twelve',cameraCount:'12'},{id:'job-five',cameraCount:5}],users:[],transactions:[{id:'paid',amount:2000000,status:'approved'}],prospects:[{id:'client-a'}]};
 const authorize=async req=>{const role=req.headers.get('authorization');return role?{me:{id:role,name:'TEST '+role,role}}:{status:401};};
 const create=()=>createDraftCostsHandler({store,loadWorkspace:async()=>workspace,authorize,baseline,now:()=> '2026-10-24T23:30:00.000Z'});
 let handler=create();
 async function api(body,role='operations',jobId='job-a',options={}){const r=await handler(new Request('https://test.local/api/draft-costs?jobId='+jobId,{method:body?'POST':'GET',headers:{...(role?{authorization:role}:{}),'Content-Type':'application/json',...options.headers},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,cache:r.headers.get('cache-control'),...await r.json()};}
 async function body(extra={}){const r=await api();return {jobId:'job-a',baseVersion:r.item?.version||0,basisHash:r.basisHash,requestId:'request-'+store.serial,costs:{direct:2630000,care:200000,business:250000},...extra};}
 return {store,workspace,api,body,restart(){handler=create();}};
}
test('saved costs reopen on the same job with all four results and unchanged client money, pricing and source records',async()=>{
 const f=fixture(),original=structuredClone(f.workspace),prices=draftPaymentOptions('operations');const request=await f.body();
 const saved=await f.api(request);assert.equal(saved.status,200);assert.equal(saved.item.version,1);assert.equal(saved.item.results.filter(r=>r.belowFloor).length,1);assert.equal(saved.item.savedBy.id,'operations');assert.equal(saved.item.jobId,'job-a');
 f.restart();const reopened=await f.api(null,'admin');assert.equal(reopened.status,200);assert.deepEqual(reopened.item,saved.item);assert.deepEqual(reopened.item.results,draftCostEstimate('operations',reopened.budget).rows);assert.deepEqual(reopened.item.options,prices);assert.equal(reopened.cache,'no-store');
 assert.deepEqual(f.workspace,original);assert.equal((await f.api(null,'operations','job-b')).item,null);assert.equal(f.store.rows.size,1);
});
test('Sales, Team Lead, Installer, unknown roles and unsigned callers cannot read or write private drafts',async()=>{
 const f=fixture(),request=await f.body();await f.api(request);const original=structuredClone([...f.store.rows]);
 for(const role of ['sales','teamlead','installer','unknown',''])for(const body of [null,request]){const r=await f.api(body,role);assert.equal(r.status,role?403:401);assert.equal(r.item,undefined);assert.equal(r.budget,undefined);}
 assert.deepEqual([...f.store.rows],original);
});
test('duplicate retries are idempotent; conflicting edits and request-ID reuse cannot overwrite the saved draft',async()=>{
 const f=fixture(),first=await f.body(),a=await f.api(first);assert.deepEqual((await f.api(first)).item,a.item);assert.equal(f.store.serial,1);
 assert.equal((await f.api({...first,costs:{...first.costs,care:1}})).status,409);
 assert.equal((await f.api({...first,requestId:'another-request'})).status,409);
 const next=await f.body({requestId:'next-request',costs:{direct:2500000,care:250000,business:300000}});assert.equal((await f.api(next,'admin')).item.version,2);assert.equal((await f.api(first)).status,409);
 const current=await f.api();assert.equal(current.item.costs.direct,2500000);assert.equal(f.store.serial,2);
});
test('simultaneous first saves have exactly one winner',async()=>{
 const f=fixture(),a=await f.body(),b={...a,requestId:'parallel'};const results=await Promise.all([f.api(a),f.api(b,'admin')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(f.store.rows.size,1);assert.equal(f.store.serial,1);
});
test('invalid costs, missing jobs, wrong package sizes and cross-origin writes do not save',async()=>{
 const f=fixture(),body=await f.body();
 for(const value of [-1,'2630000',null,Infinity,0,2.5,9007199254740992])assert.equal((await f.api({...body,costs:{...body.costs,direct:value}})).status,400);
 assert.equal((await f.api({...body,costs:{direct:1,care:0}})).status,400);
 assert.equal((await f.api(null,'operations','missing')).status,404);assert.equal((await f.api(null,'operations','job-five')).status,409);
 assert.equal((await f.api(body,'operations','job-a',{headers:{origin:'https://other.invalid'}})).status,403);assert.equal(f.store.rows.size,0);
});
test('saved assumptions remain stable; changed job identity or scope blocks access to the old draft',async()=>{
 const f=fixture();const saved=await f.api(await f.body());baseline.policy.monthly=.025;try{assert.deepEqual((await f.api()).item.results,saved.item.results);}finally{baseline.policy.monthly=.02;}
 f.workspace.jobs[0].prospectId='different-client';assert.equal((await f.api()).status,409);f.workspace.jobs[0].prospectId='client-a';f.workspace.jobs[0].cameraCount=6;assert.equal((await f.api()).status,409);
 f.workspace.jobs=[];assert.equal((await f.api()).status,404);
});
test('missing company budget fails closed, while both deployment routers expose the private endpoint',async()=>{
 const handler=createDraftCostsHandler({store:new FieldMemoryStore(),loadWorkspace:async()=>({jobs:[{id:'j',cameraCount:4}]}),authorize:async()=>({me:{role:'operations'}}),baseline:null});
 assert.equal((await handler(new Request('https://test.local/api/draft-costs?jobId=j'))).status,503);
 for(const file of ['../_redirects','../netlify.toml'])assert.match(fs.readFileSync(new URL(file,import.meta.url),'utf8'),/\/api\/draft-costs/);
});

test('all four camera packages load their own budget, save four estimates, and reopen without changing the quote',async()=>{
 const f=fixture(),original=structuredClone(f.workspace);
 for(const [jobId,cameras] of [['job-a',4],['job-six',6],['job-eight',8],['job-twelve',12]]){
  const loaded=await f.api(null,'operations',jobId);assert.equal(loaded.status,200);assert.equal(loaded.cameras,cameras);assert.equal(loaded.budget.packages[cameras].direct,baseline.packages[cameras].direct);assert.deepEqual(Object.keys(loaded.budget.packages),[String(cameras)]);
  const direct=baseline.packages[cameras].direct+25000;
  const saved=await f.api({jobId,baseVersion:0,basisHash:loaded.basisHash,requestId:'package-'+cameras,costs:{direct,care:200000+cameras,business:250000}},'operations',jobId);
  assert.equal(saved.status,200);assert.equal(saved.item.cameras,cameras);assert.equal(saved.item.results.length,4);assert.deepEqual(saved.item.options,draftPaymentOptions('operations',{cameras}));assert.deepEqual(saved.item.results,draftCostEstimate('operations',saved.item.budget,{cameras}).rows);
  f.restart();assert.deepEqual((await f.api(null,'admin',jobId)).item,saved.item);
 }
 assert.equal(f.store.rows.size,4);assert.deepEqual(f.workspace,original);
 const loaded=await f.api(null,'operations','job-twelve');const costs={direct:12000000,care:200000,business:250000};
 const low=await f.api({jobId:'job-twelve',baseVersion:loaded.item.version,basisHash:loaded.basisHash,requestId:'twelve-low',costs});assert.equal(low.status,200);assert.equal(low.item.results.filter(r=>r.belowFloor).length,4);assert.deepEqual(low.item.options,loaded.item.options);
 for(const role of ['sales','teamlead','installer',''])assert.equal((await f.api(null,role,'job-twelve')).status,role?403:401);
});
test('legacy four-camera saves reopen unchanged, but changing count cannot reuse any previous draft',async()=>{
 const f=fixture(),saved=await f.api(await f.body());delete f.store.rows.get('jobs/job-a').data.cameras;
 const legacy=await f.api();assert.equal(legacy.status,200);assert.equal(legacy.item.cameras,4);assert.deepEqual(legacy.item.results,saved.item.results);assert.deepEqual(legacy.item.budget,saved.item.budget);
 const before=structuredClone([...f.store.rows]);f.workspace.jobs[0].cameraCount=12;assert.equal((await f.api()).status,409);assert.equal((await f.api({...await f.body(),requestId:'changed-count'})).status,409);assert.deepEqual([...f.store.rows],before);
});
test('a missing larger-package budget never substitutes four-camera costs or fictional values',async()=>{
 const handler=createDraftCostsHandler({store:new FieldMemoryStore(),loadWorkspace:async()=>({jobs:[{id:'j',cameraCount:12}]}),authorize:async()=>({me:{id:'ops',role:'operations'}}),baseline:{...baseline,packages:{4:baseline.packages[4]}}});
 const r=await handler(new Request('https://test.local/api/draft-costs?jobId=j'));assert.equal(r.status,503);assert.equal((await r.json()).budget,undefined);
});

test('edited payments and costs save together on each job and reopen with server-calculated profit',async()=>{
 const f=fixture(),original=structuredClone(f.workspace);
 for(const [jobId,cameras] of [['job-a',4],['job-six',6],['job-eight',8],['job-twelve',12]]){
  const first=await f.api(null,'operations',jobId),options=draftPaymentOptions('operations',{cameras}).map(({id,upfront,monthly})=>({id,upfront,monthly}));options[0].upfront-=100000;options[1].upfront=0;options[1].monthly=10000;options[2].monthly+=10000;options[3].upfront=500000;
  const request={jobId,baseVersion:0,basisHash:first.basisHash,requestId:'terms-'+cameras,costs:{direct:2200000*cameras/4,care:200000,business:250000},options};
  const saved=await f.api(request);assert.equal(saved.status,200);assert.equal(saved.item.options[1].upfront,0);assert.equal(saved.item.options[1].monthly,10000);assert.equal(saved.item.results[1].belowFloor,true);assert.deepEqual(saved.item.results,draftCostEstimate('operations',saved.item.budget,{cameras,options:saved.item.options}).rows);assert.deepEqual((await f.api(request)).item,saved.item);
  f.restart();assert.deepEqual((await f.api(null,'admin',jobId)).item,saved.item);
  const stale=await f.api({...request,requestId:'stale-'+cameras,options:options.map(p=>({...p,upfront:p.upfront+10000}))});assert.equal(stale.status,409);
  const next=await f.api(null,'operations',jobId);const oldClient=await f.api({jobId,baseVersion:next.item.version,basisHash:next.basisHash,requestId:'cost-only-'+cameras,costs:{direct:2500000*cameras/4,care:210000,business:250000}});assert.equal(oldClient.status,200);assert.deepEqual(oldClient.item.options,saved.item.options);
 }
 assert.deepEqual(f.workspace,original);assert.equal(f.store.rows.size,4);
});
test('invalid or forged payment plans cannot be saved or alter any existing private draft',async()=>{
 const f=fixture(),first=await f.body();await f.api(first);const base=await f.body({requestId:'edit-terms'}),source=draftPaymentOptions('operations').map(({id,upfront,monthly})=>({id,upfront,monthly})),before=structuredClone([...f.store.rows]);
 const invalid=[null,[],source.slice(1),[source[0],source[0],source[2],source[3]]];
 for(const patch of [{monthly:-10000},{upfront:5000},{monthly:'10000'},{monthly:0},{months:120},{owns:false},{total:999999},{id:'bad'}]){const options=structuredClone(source);Object.assign(options[1],patch);invalid.push(options);}
 for(const options of invalid)assert.equal((await f.api({...base,options})).status,400);
 for(const role of ['sales','teamlead','installer',''])assert.equal((await f.api({...base,options:source},role)).status,role?403:401);
 assert.deepEqual([...f.store.rows],before);
});
test('legacy cost-only saves keep their stored payment snapshot and can accept an edited plan',async()=>{
 const f=fixture(),a=await f.api(await f.body());delete f.store.rows.get('jobs/job-a').data.cameras;
 const old=await f.api();assert.deepEqual(old.item.options,a.item.options);assert.deepEqual(old.item.results,a.item.results);
 const options=old.item.options.map(({id,upfront,monthly})=>({id,upfront,monthly}));options[0].upfront=3000000;
 const updated=await f.api({jobId:'job-a',baseVersion:old.item.version,basisHash:old.basisHash,requestId:'legacy-terms',costs:old.item.costs,options});assert.equal(updated.status,200);assert.equal(updated.item.options[0].total,3000000);assert.equal(updated.item.results[0].belowFloor,true);
});

test('reviewed suggestion saves and reopens on the same job without changing client quote or payment records',async()=>{
 const {createDraftCostScenario}=await import('../draft-payment-editor.mjs');const f=fixture(),original=structuredClone(f.workspace),loaded=await f.api();
 const editor=createDraftCostScenario('operations',loaded.budget,{options:loaded.options});editor.updatePayment('12months','upfront','1500000');editor.updatePayment('12months','monthly','200000');
 assert.equal(f.store.rows.size,0);assert.equal(editor.read().options[1].monthly,200000);const reviewed=editor.applySuggestion('12months');assert.equal(f.store.rows.size,0);assert.equal(reviewed.estimate.rows[1].belowFloor,false);
 const saved=await f.api(await f.body({costs:{direct:2200000,care:200000,business:250000},options:reviewed.options.map(({id,upfront,monthly})=>({id,upfront,monthly}))}));assert.equal(saved.status,200);
 f.restart();const reopened=await f.api();assert.deepEqual(reopened.item.options,reviewed.options);assert.equal(reopened.item.results[1].belowFloor,false);assert.ok(reopened.item.results[1].margin>.26);assert.deepEqual(f.workspace,original);assert.equal(f.store.rows.size,1);
});

test('per-option profit targets save privately and reject targets beyond 26–50%',async()=>{
 const f=fixture(),loaded=await f.api(),options=loaded.options.map(p=>({...p,targetMargin:.5}));const saved=await f.api(await f.body({options}));assert.equal(saved.status,200);assert.equal((await f.api()).item.options[3].targetMargin,.5);
 for(const targetMargin of [.25,.51,1,'50'])assert.equal((await f.api(await f.body({requestId:'bad-target',options:options.map(p=>({...p,targetMargin}))}))).status,400);
});
