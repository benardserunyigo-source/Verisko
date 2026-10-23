import test from 'node:test';import assert from 'node:assert/strict';
import {readyInstallationSources} from '../netlify/functions/lib/materials-assignment.mjs';
import {createInstallerHandler} from '../netlify/functions/lib/installer-core.mjs';
import {installationProgress,readiness} from '../installer-model.mjs';
import {FieldMemoryStore} from './helpers/field-fixture.mjs';
const at='2026-10-23T10:00:00Z',ops={id:'ops',name:'TEST Operations',role:'operations',phone:'0772000000'},rep={id:'installer',name:'TEST Installer',role:'installer'},other={id:'other',name:'TEST Other',role:'installer'},users=[ops,rep,other];
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
async function fixture(){
 const source=readyInstallationSources({prospects:[{id:'client',business:'TEST Shop',location:'TEST Kampala'}],transactions:[{direction:'in',prospectId:'client',status:'approved',amount:2000000}],jobs:[]},[{contactId:'client',materialPlans:[{sourceId:'client-client',requestedAt:at,items:[{id:'camera',name:'4K bullet camera',unit:'pcs',planned:1,orders:[{quantity:1}],receipts:[{quantity:1}]},{id:'cable',name:'Cat6 cable',unit:'m',planned:100,orders:[{quantity:100}],receipts:[{quantity:100}]}]}]}])[0];
 const store=new FieldMemoryStore(),handler=createInstallerHandler({store,now:()=>at,authorize:async req=>({me:users.find(u=>u.id===req.headers.get('authorization')),users,readySources:[source]})});let n=0,j;
 async function call(action,data={},who=rep,extra={}){const cmd={action,requestId:'completion-test-'+(++n),data,...extra};const r=await handler(new Request('https://test/api/installer',{method:'POST',headers:{authorization:who.id},body:JSON.stringify({jobId:source.installationId,command:cmd})}));const body=await r.json();if(body.job)j=body.job;return {status:r.status,...body};}
 async function ok(...args){const r=await call(...args);assert.equal(r.status,200,r.error);return r.job;}
 await ok('offerMaterials',{contactId:source.contactId,materialSourceId:source.materialSourceId,snapshot:source.snapshot,installerId:rep.id,siteStaffId:ops.id,scheduledDate:'2026-10-23',amount:350000,locations:['Front gate'],remoteIncluded:true},ops,{baseVersion:0,assignmentVersion:0});
 await ok('assignmentResponse',{status:'accepted'},rep,{baseVersion:j.versions.assignment});
 const version=key=>({baseVersion:j.versions[key]||0});
 const photo=(kind,cameraId='')=>ok('evidence',{id:'photo-'+kind+'-'+(++n),kind,image},kind==='reference'?ops:rep,{cameraId});
 async function dispatch(){for(const i of j.materials.items)await ok('materialIssue',{itemId:i.id,quantity:i.needed},ops,version('materials'));await ok('materialConfirm',{},ops,version('materials'));}
 async function work(){
 await ok('pilot',{cableMethods:'One full cable per camera.',weather:'Waterproof box and sealed entry.',mounting:'Correct fixings. Camera firm.',approvalCover:'Operations',backup:'Operations',confirmed:true},ops,version('pilot'));await photo('reference');
 await ok('workStart',{location:{lat:.3,lng:32.5,accuracy:10},capturedAt:at});
 await photo('route','camera-1');await ok('cable',{route:'NVR to gate through conduit',joins:'no'},rep,{cameraId:'camera-1',baseVersion:0});
 for(const kind of ['mount','fixings','entry','view'])await photo(kind,'camera-1');
 await ok('mount',{fixings:true,secured:true,stability:true},rep,{cameraId:'camera-1',baseVersion:0});
 await ok('tests',Object.fromEntries(['live','recording','playback','coverage','remote'].map(k=>[k,{result:'pass'}])),rep,{cameraId:'camera-1',baseVersion:0});
 await photo('demo');await ok('handover',{demonstration:'Live view, recording, playback and phone viewing',issues:'None',acknowledged:true,customerName:'TEST Verisko staff'},rep,version('handover'));
 await ok('workFinish',{location:{lat:.3,lng:32.5,accuracy:10},capturedAt:at});
 }
 return {source,store,handler,call,ok,photo,dispatch,work,version,get j(){return j;}};
}
test('same assigned job collects checks, photos and leftovers, then Operations approves after returns',async()=>{
 const f=await fixture(),id=f.j.id;await f.dispatch();await f.work();assert.equal(installationProgress(f.j).camerasDone,1);
 assert.equal((await f.call('submit')).status,400); // quantities have not been counted
 await f.ok('materialReport',{itemId:'camera',used:1,damaged:0,missing:0},rep,f.version('materials'));
 await f.ok('materialReport',{itemId:'cable',used:85,damaged:2,missing:1,note:'TEST: Damaged during fitting; missing cut piece.'},rep,f.version('materials'));
 assert.deepEqual(readiness(f.j),[]);assert.equal(installationProgress(f.j).materialsDone,2);
 await f.ok('submit');assert.equal(f.j.status,'Submitted');assert.equal(f.j.id,id);assert.equal(f.j.readyContactId,'client');assert.equal(f.j.materialSourceId,'client-client');assert.equal(f.j.evidence.length,7);
 assert.equal((await f.call('cable',{route:'Changed',joins:'no'},rep,{cameraId:'camera-1',baseVersion:1})).status,409);
 assert.equal((await f.call('complete',{comment:'TEST'},rep)).status,403);
 assert.equal((await f.call('complete',{comment:'TEST'},ops)).status,400); // warehouse returns still due
 assert.equal((await f.call('materialReceive',{itemId:'cable',good:13,damaged:2},ops,f.version('materials'))).status,400);
 await f.ok('materialReceive',{itemId:'cable',good:12,damaged:2,acceptLoss:true,note:'TEST: missing piece reviewed.'},ops,f.version('materials'));
 await f.ok('complete',{comment:'Photos, playback and returned materials checked.'},ops);assert.equal(f.j.status,'Completed');assert.equal(f.j.approval.by,ops.id);assert.equal(f.j.materials.items[1].returnedGood,12);
 const jobs=[...f.store.rows.keys()].filter(k=>k.startsWith('jobs/'));assert.deepEqual(jobs,['jobs/'+id]);
 const photo=await f.handler(new Request('https://test/api/installer?jobId='+id+'&photo='+f.j.evidence[1].id,{headers:{authorization:ops.id}}));assert.equal(photo.status,200);
 assert.equal((await f.call('submit',{},other)).status,404);
});
test('linked job cannot be sent without site dispatch, real uploaded photos and finished work',async()=>{
 const f=await fixture();await f.work();assert.ok(readiness(f.j).some(m=>m.includes('taken to the site')));assert.equal((await f.call('submit')).status,400);
 await f.dispatch();for(const item of f.j.materials.items)await f.ok('materialReport',{itemId:item.id,used:item.issued,damaged:0,missing:0},rep,f.version('materials'));
 const stored=await f.store.get('jobs/'+f.j.id);stored.evidence=stored.evidence.filter(e=>e.kind!=='view');await f.store.setJSON('jobs/'+f.j.id,stored);
 assert.equal((await f.call('submit')).status,400);
 assert.equal((await f.call('evidence',{id:'fake-image',kind:'view',image:'not an image'},rep,{cameraId:'camera-1'})).status,400);
 await f.photo('view','camera-1');await f.ok('submit');assert.equal(f.j.status,'Submitted');
});
test('Operations returns a camera check with a reason; installer fixes and resends the same job',async()=>{
 const f=await fixture();await f.dispatch();await f.work();for(const item of f.j.materials.items)await f.ok('materialReport',{itemId:item.id,used:item.issued,damaged:0,missing:0},rep,f.version('materials'));await f.ok('submit');const id=f.j.id;
 assert.equal((await f.call('return',{comment:''},ops,{cameraId:'camera-1',part:'mount'})).status,400);
 await f.ok('return',{comment:'Seal the cable entry and take a new photo.'},ops,{cameraId:'camera-1',part:'mount'});assert.equal(f.j.status,'Needs correction');assert.equal((await f.call('submit')).status,400);
 await f.photo('entry','camera-1');await f.ok('mount',{fixings:true,secured:true,stability:true,correctionNote:'Entry sealed and checked.'},rep,{cameraId:'camera-1',baseVersion:f.j.cameras[0].versions.mount});await f.ok('submit');assert.equal(f.j.id,id);await f.ok('complete',{comment:'New entry photo checked.'},ops);assert.equal(f.j.status,'Completed');
});
