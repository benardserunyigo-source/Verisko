import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createClientPlanHandler} from '../netlify/functions/lib/client-plan-core.mjs';
import {journeyFixture} from './helpers/journey-fixture.mjs';
import {contactToPaid} from './helpers/journey-steps.mjs';
import {FieldMemoryStore} from './helpers/field-fixture.mjs';
import {buildJobSummaries} from '../job-summary.mjs';
const token='A'.repeat(43),jobId='journey-quote';
async function fixture(){const f=await journeyFixture();await contactToPaid(f);const store=new FieldMemoryStore();
 const handler=createClientPlanHandler({store,loadWorkspace:f.raw,now:f.now,authorize:async req=>({me:f.users.find(u=>u.id===req.headers.get('authorization')),status:401})});
 const api=async(body,role='',query='',method=body?'POST':'GET')=>{const r=await handler(new Request('https://test.local/api/client-plan'+query,{method,headers:{authorization:role,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,...await r.json()};};
 return {...f,store,api};}
test('Operations shares checked offers; client chooses once; staff see reply on same job without changing finances',async()=>{
 const f=await fixture(),before=JSON.stringify(await f.raw());assert.equal((await f.api({action:'create',jobId,token},'operations')).status,200);
 const d=await f.api({action:'view',jobId,token});assert.equal(d.status,200);assert.deepEqual(d.offer.options.map(p=>p.id),['installments','cash']);
 const p=d.offer.options[0];assert.ok(p.rows.length===3&&p.total>0);assert.equal(p.rows.reduce((n,x)=>n+x.amount,0),p.total);
 const privateText=JSON.stringify(d);for(const x of ['costEvidence','costOfDoingBusiness','netProfit','PRIVATE','transactions','"phone":','fundingApproved','tokenHash','fingerprint'])assert.ok(!privateText.includes(x),x);
 const body={action:'choose',jobId,token,plan:p.id,name:'TEST Client',confirmed:true};
 const a=await f.api(body);assert.equal(a.status,200);assert.equal((await f.api(body)).choice.at,a.choice.at);
 assert.equal((await f.api({...body,plan:'cash'})).status,409);
 const status=await f.api(null,'operations','?jobId='+jobId);assert.equal(status.item.choice.plan,p.id);assert.equal(status.item.current,true);
 assert.ok(!JSON.stringify(await f.store.get('jobs/'+jobId)).includes(token));
 const summary=buildJobSummaries({user:{role:'operations'},data:await f.raw(),clientPlans:(await f.api(null,'operations')).items});assert.equal(summary[0].clientPlan.choice.name,'TEST Client');
 assert.equal(JSON.stringify(await f.raw()),before); // no stage/payment/commission/funding/terms changes
});
test('Sales, Team Lead, Installer and unsigned requests cannot issue or read staff reply lists',async()=>{
 const f=await fixture();for(const role of ['sales','teamlead','installer','']){assert.equal((await f.api({action:'create',jobId,token},role)).status,role?403:401);assert.equal((await f.api(null,role)).status,role?403:401);}
 assert.equal((await f.api({action:'create',jobId,token},'admin')).status,200);
 assert.equal((await f.api({action:'view',jobId,token:'B'.repeat(43)})).status,404);
 assert.equal((await f.api({action:'view',jobId:'other-job',token})).status,404);
});
test('client must select a real offered plan, provide name and explicitly say yes',async()=>{
 const f=await fixture();await f.api({action:'create',jobId,token},'operations');
 const body={action:'choose',jobId,token,plan:'installments',name:'TEST Client',confirmed:true};
 for(const change of [{plan:'free'},{name:''},{confirmed:false},{confirmed:'yes'},{name:'x'.repeat(101)}])assert.equal((await f.api({...body,...change})).status,400);
 assert.equal((await f.api(null,'operations','?jobId='+jobId)).item.choice,null);
});
test('new link revokes old token; explicit revoke and expiry block viewing or choosing',async()=>{
 const f=await fixture();await f.api({action:'create',jobId,token},'operations');await f.api({action:'create',jobId,token:'B'.repeat(43)},'operations');assert.equal((await f.api({action:'view',jobId,token})).status,404);
 await f.api({action:'revoke',jobId},'operations');assert.equal((await f.api({action:'view',jobId,token:'B'.repeat(43)})).status,410);
 await f.api({action:'create',jobId,token},'operations');f.setTime('2030-01-01T00:00:00Z');assert.equal((await f.api({action:'view',jobId,token})).status,410);
});
test('changed price or dates invalidate an earlier link and flag its earlier reply',async()=>{
 const f=await fixture();await f.api({action:'create',jobId,token},'operations');await f.api({action:'choose',jobId,token,plan:'cash',name:'TEST Client',confirmed:true});
 const raw=await f.raw();raw.jobs[0].scheduledDate='2030-01-01';await f.main.setJSON('app-data',raw);
 assert.equal((await f.api({action:'view',jobId,token})).status,410);assert.equal((await f.api(null,'operations','?jobId='+jobId)).item.current,false);
});
test('unconfirmed costs and expired quotes cannot generate links; accepted quote offers only its agreed plan',async()=>{
 const f=await fixture();const raw=await f.raw(),j=raw.jobs[0];j.costConfirmed=false;j.quoteSnapshot.releaseErrors=['Check costs'];await f.main.setJSON('app-data',raw);assert.equal((await f.api({action:'create',jobId,token},'operations')).status,409);
 j.costConfirmed=true;j.quoteSnapshot.releaseErrors=[];j.stage='Accepted';await f.main.setJSON('app-data',raw);assert.equal((await f.api({action:'create',jobId,token},'operations')).status,200);assert.deepEqual((await f.api({action:'view',jobId,token})).offer.options.map(x=>x.id),['cash']);
});
test('concurrent client replies cannot overwrite the winner',async()=>{
 const f=await fixture();await f.api({action:'create',jobId,token},'operations');
 const body={action:'choose',jobId,token,plan:'cash',name:'TEST Client',confirmed:true};const r=await Promise.all([f.api(body),f.api({...body,name:'TEST Other'})]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);
});
test('public page uses fragment token, no third-party assets, and service worker does not cache client pages',()=>{
 const html=fs.readFileSync(new URL('../client-plan.html',import.meta.url),'utf8'),js=fs.readFileSync(new URL('../client-plan.js',import.meta.url),'utf8');assert.match(html,/no-referrer/);assert.match(html,/noindex/);assert.doesNotMatch(html,/https?:\/\//);assert.match(js,/location.hash/);assert.match(js,/credentials:'omit'/);assert.match(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),/pathname.startsWith\("\/client-plan"\)/);
 for(const f of ['../_redirects','../netlify.toml'])assert.match(fs.readFileSync(new URL(f,import.meta.url),'utf8'),/\/api\/client-plan/);
});
test('cancelled or removed source quotes stop an issued link without touching its saved reply',async()=>{
 const f=await fixture();await f.api({action:'create',jobId,token},'operations');
 const raw=await f.raw();raw.jobs[0].stage='Cancelled';await f.main.setJSON('app-data',raw);
 assert.equal((await f.api({action:'view',jobId,token})).status,410);
 raw.jobs=[];await f.main.setJSON('app-data',raw);assert.equal((await f.api({action:'choose',jobId,token,plan:'cash',name:'TEST Client',confirmed:true})).status,410);
});
test('link creation retry is idempotent and does not erase an already saved choice',async()=>{
 const f=await fixture();const cmd={action:'create',jobId,token};const a=await f.api(cmd,'operations'),b=await f.api(cmd,'operations');assert.equal(a.item.createdAt,b.item.createdAt);assert.equal(f.store.rows.size,1);
 await f.api({action:'choose',jobId,token,plan:'cash',name:'TEST Client',confirmed:true});assert.equal((await f.api({...cmd,token:'B'.repeat(43)},'operations')).status,409);assert.equal((await f.api(null,'operations','?jobId='+jobId)).item.choice.name,'TEST Client');
});
test('cross-site forms and malformed public bodies are rejected',async()=>{
 const f=await fixture();const cross=await f.handlers.data(new Request('https://test.local/api/data',{headers:{authorization:'operations'}}));assert.equal(cross.status,200);
 const handler=createClientPlanHandler({store:f.store,loadWorkspace:f.raw,authorize:async()=>({me:{id:'ops',role:'operations'}})});
 const r=await handler(new Request('https://test.local/api/client-plan',{method:'POST',headers:{origin:'https://other.invalid','content-type':'application/json'},body:JSON.stringify({action:'create',jobId,token})}));assert.equal(r.status,403);
 assert.equal((await handler(new Request('https://test.local/api/client-plan',{method:'POST',headers:{'content-type':'text/plain'},body:'anything'}))).status,415);
 assert.equal((await handler(new Request('https://test.local/api/client-plan',{method:'POST',headers:{'content-type':'application/json'},body:'{'}))).status,400);
});
test('recording the sharing attempt from Draft to Sent preserves the same offered link',async()=>{
 const f=await fixture(),raw=await f.raw();raw.jobs[0].stage='Draft';await f.main.setJSON('app-data',raw);
 assert.equal((await f.api({action:'create',jobId,token},'operations')).status,200);
 assert.equal((await f.save('operations',d=>{d.jobs[0].stage='Sent';d.jobs[0].quoteSharedAt=f.now();})).status,200);
 assert.equal((await f.api({action:'view',jobId,token})).status,200);
});
