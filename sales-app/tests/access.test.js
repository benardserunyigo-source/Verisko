import test from 'node:test';import assert from 'node:assert/strict';
import {createDataHandler} from '../netlify/functions/data.mjs';
import {ROLES,canAssignRole,guardRoster,guardCash,canManageMember,visibleRoster} from '../netlify/functions/access.mjs';
import {canReadReceipt,createReceiptHandler} from '../netlify/functions/lib/receipt-core.mjs';
import {createJob,applyCommand,canRead} from '../installer-model.mjs';
const users=['admin','operations','teamlead','sales','installer','supervisor'].map((role,i)=>({id:'u'+i,name:role,email:role+'@test.invalid',role,authMethod:'email',internalSecret:'PRIVATE'}));
const [admin,ops,lead,sales,installer,supervisor]=users;
function fixture(actor=sales){
 let data={users:structuredClone(users),prospects:[{id:'mine',business:'TEST Mine',createdByEmail:sales.email,reviewStatus:'pending',photoId:'mine-photo'},{id:'other',business:'TEST Other',createdByEmail:ops.email,photoId:'other-photo'},{id:'private',business:'PRIVATE SAVED LEAD',createdByEmail:ops.email,leadOnly:true,phone:'0772000011'}],appointments:[{id:'v1',prospectId:'mine'}],jobs:[],transactions:[{id:'expense',direction:'out',amount:20,status:'approved',proofId:'finance-photo',note:'PRIVATE FINANCE'},{id:'deposit',direction:'in',amount:100,status:'approved',prospectId:'mine'}],technicians:[{id:'tech',phone:'PRIVATE TECH'}],quotes:[{id:'OLD PRIVATE QUOTE'}],installations:[{id:'OLD PRIVATE INSTALL'}],training:{u0:{v1:'T'},u2:{v2:'T'},u3:{v3:'T'}},config:{exportKey:'PRIVATE EXPORT KEY',internalSecret:'PRIVATE CONFIG',pettyLimit:20000,commissionPerSale:100000},unexpectedSecret:'PRIVATE TOP LEVEL'};
 const photos=new Map([['owner/mine-photo',{userId:sales.id,role:'sales'}],['owner/finance-photo',{userId:ops.id,role:'operations'}]]);
 const storeFor=name=>{name=typeof name==='string'?name:name.name;return {async get(key){return structuredClone(name==='verisko-sales'?data:photos.get(key)||null);},async setJSON(key,value){if(name==='verisko-sales')data=structuredClone(value);else photos.set(key,structuredClone(value));},async list(){return {blobs:[]};}};};
 const handler=createDataHandler({storeFor,identifyRequest:async()=>({me:actor,email:actor?.email})});
 const get=()=>handler(new Request('https://test/api/data'));
 const post=body=>handler(new Request('https://test/api/data',{method:'POST',body:JSON.stringify({data:body})}));
 return {get,post,read:()=>structuredClone(data),set:value=>data=value,photos};
}
test('each role receives only the main workspace data needed for its job',async()=>{
 for(const actor of users.filter(u=>u.role!=='supervisor')){const f=fixture(actor),r=await f.get(),b=await r.json();assert.equal(r.status,200);
  if(['installer','supervisor'].includes(actor.role)){assert.deepEqual(b.data.prospects,[]);assert.deepEqual(b.data.transactions,[]);assert.equal(b.data.users.length,1);assert.equal(b.pricing,undefined);}
  if(actor.role==='sales'){assert.deepEqual(b.data.prospects.map(p=>p.id),['mine']);assert.equal(b.data.transactions[0].direction,'in');assert.equal(b.data.quotes.length,0);assert.equal(b.pricing,undefined);assert.ok(!JSON.stringify(b).includes('PRIVATE'));}
  if(actor.role==='teamlead'){assert.deepEqual(b.data.prospects.map(p=>p.id),['mine','other']);assert.equal(b.data.transactions.some(t=>t.direction==='out'),false);assert.deepEqual(Object.keys(b.data.training),[lead.id]);assert.ok(!JSON.stringify(b).includes('PRIVATE'));}
  if(actor.role==='operations'){assert.equal(b.data.prospects.length,3);assert.equal(b.data.config.exportKey,undefined);assert.equal(b.data.config.internalSecret,undefined);assert.equal(b.data.unexpectedSecret,undefined);assert.equal(b.data.users[0].email,undefined);}
  if(actor.role==='admin')assert.equal(b.data.config.exportKey,'PRIVATE EXPORT KEY');
  assert.equal(b.data.users.some(u=>u.internalSecret),false);
 }
});
test('unknown roles fail closed; installer/supervisor cannot write the main workspace',async()=>{
 assert.equal((await fixture({id:'x',email:'x@test',role:'unknown'}).get()).status,403);assert.equal((await fixture(supervisor).get()).status,403);
 for(const actor of [installer,supervisor])assert.equal((await fixture(actor).post({users:[{id:actor.id,role:'admin'}]})).status,403);
});
test('Sales forged saves cannot alter other contacts, grant roles, change config or write cash/jobs',async()=>{
 const f=fixture(),original=f.read(),body=structuredClone(original);body.prospects=body.prospects.map(p=>({...p,business:'FORGED',createdByEmail:'attacker@test',followUps:[{at:'T',byEmail:ops.email,note:'FORGED STAFF NOTE'}]}));body.users=[{...sales,role:'admin'}];body.config={exportKey:'STOLEN',commissionPerSale:9};body.transactions=[];body.jobs=[{id:'FORGED JOB'}];body.quotes=[];body.installations=[];
 assert.equal((await f.post(body)).status,200);const saved=f.read();assert.deepEqual(saved.users,original.users);assert.deepEqual(saved.config,original.config);assert.deepEqual(saved.transactions,original.transactions);assert.deepEqual(saved.jobs,original.jobs);assert.deepEqual(saved.quotes,original.quotes);assert.deepEqual(saved.installations,original.installations);assert.equal(saved.prospects.find(p=>p.id==='mine').createdByEmail,sales.email);assert.equal(saved.prospects.find(p=>p.id==='other').business,'TEST Other');assert.equal(saved.prospects.find(p=>p.id==='mine').followUps.length,0);
});
test('Operations cannot change access/policy or approved cash by a crafted save',async()=>{
 const f=fixture(ops),original=f.read(),body=structuredClone(original);body.users=body.users.map(u=>({...u,role:'admin',email:'attacker@test',pinPhone:'FORGED'}));body.config={exportKey:'FORGED',commissionPerSale:1};body.transactions=[{id:'new',direction:'out',amount:999,status:'approved',preapproved:true,reviewedBy:'FORGED'}];body.quotes=[];body.installations=[];
 assert.equal((await f.post(body)).status,200);const saved=f.read();assert.deepEqual(saved.config,original.config);assert.equal(saved.users.some(u=>u.role==='admin'&&u.id!==admin.id),false);assert.deepEqual(saved.users.find(u=>u.id===admin.id),admin);assert.deepEqual(saved.users.find(u=>u.id===ops.id),ops);assert.equal(saved.transactions.find(t=>t.id==='expense').amount,20);assert.equal(saved.transactions.find(t=>t.id==='new').status,'pending');assert.equal(saved.transactions.find(t=>t.id==='new').preapproved,false);assert.deepEqual(saved.quotes,original.quotes);
});
test('roster management has the same bounds for phone and email members',()=>{
 assert.equal(canManageMember(ops,supervisor,admin.id),false);assert.equal(canManageMember(ops,ops,admin.id),false);assert.equal(canManageMember(ops,sales,admin.id),true);
 const incoming=[{...admin,email:'attacker@test'},{...ops,role:'admin'},{...sales,role:'operations'},{id:'new',email:'new@test.invalid',role:'operations'}];
 const result=guardRoster(users,incoming,ops);assert.equal(result.find(u=>u.id===sales.id).role,'sales');assert.equal(result.some(u=>u.id==='new'),false);
 const protectedOwner=guardRoster(users,[],admin);assert.equal(protectedOwner[0].id,admin.id);assert.equal(visibleRoster(users,ops).find(u=>u.id===admin.id).email,undefined);
});
test('Sales cannot attach a known finance photo to manufacture access to it',async()=>{
 const f=fixture(),body=f.read();body.prospects[0].photoId='finance-photo';assert.equal((await f.post(body)).status,403);assert.equal(f.read().prospects[0].photoId,'mine-photo');
 f.photos.set('owner/new-photo',{userId:sales.id,role:'sales'});body.prospects[0].photoId='new-photo';assert.equal((await f.post(body)).status,200);
});
test('shared photos check record visibility, finance role and upload owner',async()=>{
 const data=fixture().read();assert.equal(canReadReceipt(data,sales,'mine-photo'),true);assert.equal(canReadReceipt(data,sales,'other-photo'),false);assert.equal(canReadReceipt(data,sales,'finance-photo'),false);assert.equal(canReadReceipt(data,lead,'other-photo'),true);assert.equal(canReadReceipt(data,ops,'finance-photo'),true);assert.equal(canReadReceipt(data,installer,'mine-photo'),false);assert.equal(canReadReceipt(data,sales,'unattached',{userId:sales.id,role:'sales'}),true);
 const map=new Map([['finance-photo','data:image/png;base64,iVBORw0KGgo=']]);const store={get:async k=>map.get(k),set:async(k,v)=>map.set(k,v),setJSON:async(k,v)=>map.set(k,v)};const h=createReceiptHandler({store,authorize:async()=>({me:sales,data})});assert.equal((await h(new Request('https://test/api/receipt?id=finance-photo'))).status,404);assert.equal((await h(new Request('https://test/api/receipt',{method:'POST',body:JSON.stringify({image:'data:image/svg+xml;base64,PGh0bWw+'})}))).status,400);
});
test('Team Leads see only assigned reviews and cannot fill installer checks or set up jobs',()=>{
 const now='2026-10-22T12:00:00Z',j=createJob({id:'install',business:'TEST',siteStaff:{name:'Ops',phone:'000'},address:'TEST',scope:'TEST',equipment:'1 × Camera',locations:['Gate'],assignees:[installer.id],supervisorIds:[lead.id],scheduledDate:'2026-10-23'},ops,now,users);
 assert.equal(canRead(j,lead),true);assert.equal(canRead({...j,supervisorIds:[]},lead),false);assert.equal(canRead(j,sales),false);
 for(const actor of [ops,lead])assert.throws(()=>applyCommand(j,{action:'tests',requestId:'forged-check',cameraId:'camera-1',baseVersion:0,data:{}},actor,now),/assigned installer/);
 assert.throws(()=>applyCommand(j,{action:'plan',requestId:'forged-plan',baseVersion:0,data:{assignees:[installer.id],scheduledDate:'2026-10-23'}},lead,now),/Only Operations/);
 assert.throws(()=>createJob({},lead,now,users),/Only Operations/);
});

test('live auth handler enforces identity, PIN reset and invitation privilege bounds',async()=>{
 const {createAuthHandler}=await import('../netlify/functions/auth.mjs');let actor=ops;
 const roster=structuredClone(users).map(u=>({...u,authMethod:'pin'})),maps=new Map();
 function storeFor(name){name=typeof name==='string'?name:name.name;if(!maps.has(name))maps.set(name,new Map());const map=maps.get(name);return {get:async k=>structuredClone(map.get(k)||null),set:async(k,v)=>{map.set(k,v);return {modified:true};},setJSON:async(k,v)=>{map.set(k,structuredClone(v));return {modified:true};},delete:async k=>map.delete(k)};}
 await storeFor('verisko-sales').setJSON('app-data',{users:roster});
 for(const u of roster)await storeFor('verisko-staff').setJSON('staff/'+u.id,{...u,status:'active',idStatus:'submitted',nin:'TEST-ID',selfie:'TEST-PHOTO'});
 // Use the exported store constants so tests exercise the actual auth routes.
 const {STAFF_STORE}=await import('../netlify/functions/pin-auth.mjs');if(STAFF_STORE!=='verisko-staff')maps.set(STAFF_STORE,maps.get('verisko-staff'));
 const handler=createAuthHandler({storeFor,identifyRequest:async()=>({me:actor,email:actor.email}),clock:()=>Date.parse('2026-10-22T12:00:00Z')});
 const send=data=>handler(new Request('https://test/api/auth',{method:'POST',body:JSON.stringify(data)}));
 for(const target of [admin,ops,supervisor]){
  assert.equal((await send({action:'resetPin',userId:target.id})).status,403);
  assert.equal((await send({action:'remove',userId:target.id})).status,403);
  assert.equal((await send({action:'checkId',userId:target.id,ok:true})).status,403);
 }
 assert.equal((await send({action:'record',id:admin.id})).status,403);assert.equal((await send({action:'record',id:supervisor.id})).status,403);
 assert.equal((await send({action:'record',id:sales.id})).status,200);
 for(const role of ['admin','operations','supervisor']){const r=await send({action:'invite',phone:'0772001234',role});assert.equal(r.status,403);}
 actor=admin;assert.equal((await send({action:'invite',phone:'0772001234',role:'supervisor'})).status,403);
 actor=sales;assert.equal((await send({action:'record',id:ops.id})).status,403);assert.equal((await send({action:'invite',phone:'0772001234',role:'sales'})).status,403);
 actor={...ops,authMethod:'pin',idStatus:'needed',idDueAt:'2026-10-01T00:00:00Z'};assert.equal((await send({action:'invite',phone:'0772001234',role:'sales'})).status,403);
});
test('Team lead cannot retrieve a private saved lead through linked job/visit stubs',async()=>{
 const f=fixture(lead),data=f.read();data.jobs=[{id:'private-job',prospectId:'private',stage:'Draft'}];data.appointments.push({id:'private-visit',prospectId:'private'});f.set(data);
 const b=await(await f.get()).json();assert.equal(b.data.jobs.length,0);assert.equal(b.data.appointments.some(a=>a.id==='private-visit'),false);
});
test('a demoted Operations user cannot recover old expense uploads through uploader ownership',async()=>{
 const data=fixture().read(),demoted={...ops,role:'sales'};assert.equal(canReadReceipt(data,demoted,'finance-photo',{userId:ops.id,role:'operations'}),false);
 const f=fixture(sales),body=f.read();f.photos.set('owner/old-privileged-upload',{userId:sales.id,role:'operations'});body.prospects[0].photoId='old-privileged-upload';assert.equal((await f.post(body)).status,403);
});
test('photo uploads are owned by the current account and cannot be opened by another account',async()=>{
 const data=fixture().read(),map=new Map(),store={get:async k=>map.get(k),set:async(k,v)=>map.set(k,v),setJSON:async(k,v)=>map.set(k,v)};let actor=sales;
 const h=createReceiptHandler({store,authorize:async()=>({me:actor,data})});const r=await h(new Request('https://test/api/receipt',{method:'POST',body:JSON.stringify({image:'data:image/png;base64,iVBORw0KGgo='})}));const b=await r.json();assert.equal(r.status,200);assert.equal(map.get('owner/'+b.id).role,'sales');assert.equal((await h(new Request('https://test/api/receipt?id='+b.id))).status,200);
 actor=lead;assert.equal((await h(new Request('https://test/api/receipt?id='+b.id))).status,404);
});

test('retired Supervisor role cannot be granted or use installation access even with an old assignment',async()=>{
 assert.ok(!ROLES.includes('supervisor'));assert.equal(canAssignRole(admin,'supervisor'),false);const j={supervisorIds:[supervisor.id],assignees:[]};assert.equal(canRead(j,supervisor),false);assert.equal(canReadReceipt(fixture().read(),supervisor,'mine-photo'),false);
 const {createInstallerHandler}=await import('../netlify/functions/lib/installer-core.mjs');const handler=createInstallerHandler({store:{},authorize:async()=>({me:supervisor})});assert.equal((await handler(new Request('https://test/api/installer'))).status,403);
 const incoming=[...users,{id:'retired-new',name:'Retired',email:'retired@test.invalid',role:'supervisor'}];assert.ok(!guardRoster(users,incoming,admin).some(u=>u.id==='retired-new'));
});
