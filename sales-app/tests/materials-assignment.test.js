import test from 'node:test';import assert from 'node:assert/strict';
import {readyInstallationSources,offerMaterialInstallation,resolveInstallationSource} from '../netlify/functions/lib/materials-assignment.mjs';
import {createInstallerHandler} from '../netlify/functions/lib/installer-core.mjs';
import {applyCommand,canRead} from '../installer-model.mjs';
import {FieldMemoryStore} from './helpers/field-fixture.mjs';
const at='2026-10-23T10:00:00Z',ops={id:'ops',name:'TEST Ops',role:'operations',phone:'0772000000'},installer={id:'installer',name:'TEST Installer',role:'installer'},other={id:'other',name:'TEST Other',role:'installer'},sales={id:'sales',role:'sales'},lead={id:'lead',role:'teamlead'},users=[ops,installer,other,sales,lead];
const data={prospects:[{id:'client',business:'TEST Shop',location:'TEST Kampala'}],transactions:[{id:'paid',direction:'in',prospectId:'client',status:'approved',amount:2000000}],jobs:[]};
const cases=[{contactId:'client',materialPlans:[{sourceId:'client-client',label:'TEST Work',requestedAt:at,items:[{id:'camera',name:'4K bullet camera',unit:'pcs',planned:2,orders:[{quantity:2,supplier:'PRIVATE SUPPLIER'}],receipts:[{quantity:2}]},{id:'cable',name:'Cat6 cable',unit:'m',planned:100,orders:[{quantity:100}],receipts:[{quantity:100}]}]}]}];
const source=()=>readyInstallationSources(data,cases)[0];
const command=(s=source(),extra={})=>({action:'offerMaterials',requestId:'offer-test-0001',baseVersion:0,assignmentVersion:0,data:{snapshot:s.snapshot,contactId:s.contactId,materialSourceId:s.materialSourceId,installerId:installer.id,siteStaffId:ops.id,scheduledDate:'2026-10-24',amount:350000,locations:['Gate','Rear'],...extra}});
const offer=()=>offerMaterialInstallation(source(),null,command(),ops,users,at);
const response=(j,status,extra={})=>({action:'assignmentResponse',requestId:'response-'+status,baseVersion:j.versions.assignment,data:{status,...extra}});
test('only approved paid work with every material arrived becomes assignable',()=>{
 assert.equal(readyInstallationSources({...data,transactions:[]},cases).length,0);
 const partial=structuredClone(cases);partial[0].materialPlans[0].items[0].receipts=[{quantity:1}];assert.equal(readyInstallationSources(data,partial).length,0);
 const s=source();assert.equal(s.business,'TEST Shop');assert.equal(s.materials[1].quantity,100);assert.ok(!JSON.stringify(s).includes('PRIVATE SUPPLIER'));
});
test('offer reuses client and materials exactly, without issuing warehouse stock',()=>{
 const j=offer();assert.equal(j.readyContactId,'client');assert.equal(j.materialSourceId,'client-client');assert.equal(j.business,'TEST Shop');assert.equal(j.address,'TEST Kampala');assert.equal(j.assignment.status,'pending');assert.equal(j.installerPay.installer.amount,350000);assert.deepEqual(j.materials.items.map(i=>[i.id,i.needed,i.issued,i.unit]),[['camera',2,0,'pieces'],['cable',100,0,'metres']]);assert.equal(j.cameras.length,2);
});
test('offer validates role, roster, current materials, future date, camera positions and pay',()=>{
 const s=source();for(const role of ['sales','installer','teamlead'])assert.throws(()=>offerMaterialInstallation(s,null,command(),{...ops,role},users,at),/Only Operations/);
 for(const patch of [{snapshot:'old'},{installerId:'sales'},{siteStaffId:'installer'},{scheduledDate:'2026-10-22'},{scheduledDate:'2026-02-30'},{amount:0},{amount:10.2},{locations:['Gate']},{locations:['Gate','Gate']}])assert.throws(()=>offerMaterialInstallation(s,null,command(s,patch),ops,users,at));
 const j=offerMaterialInstallation(s,null,command(s,{business:'FORGED',equipment:'FORGED'}),ops,users,at);assert.equal(j.business,'TEST Shop');assert.ok(!j.equipment.includes('FORGED'));
});
test('pending and declined installers cannot record work; own acceptance is required',()=>{
 let j=offer();for(const action of ['workStart','cable','evidence','materialReport','submit'])assert.throws(()=>applyCommand(j,{action,requestId:'blocked-'+action,data:{}},installer,at),/Accept this job/);
 assert.throws(()=>applyCommand(j,response(j,'accepted'),ops,at),/Only the offered installer/);assert.throws(()=>applyCommand(j,response(j,'accepted'),other,at),/not assigned/);
 assert.throws(()=>applyCommand(j,response(j,'declined'),installer,at),/Reason/);
 const accepted=applyCommand(j,response(j,'accepted'),installer,at);assert.equal(accepted.assignment.status,'accepted');assert.deepEqual(applyCommand(accepted,response(j,'accepted'),installer,at),accepted);
 const started=applyCommand(accepted,{action:'workStart',requestId:'work-start-test',data:{location:{lat:0.3,lng:32.5,accuracy:10},capturedAt:at}},installer,at);assert.equal(started.workLog.length,1);
 j=applyCommand(j,response(j,'declined',{note:'Not available that day'}),installer,at);assert.equal(j.assignment.note,'Not available that day');assert.throws(()=>applyCommand(j,{action:'workStart',requestId:'declined-work',data:{}},installer,at),/Accept this job/);
});
test('decline and reoffer preserve one installation and reject stale replies and overwritten work',()=>{
 const s=source();let j=offer();j=applyCommand(j,response(j,'declined',{note:'Busy'}),installer,at);
 assert.throws(()=>offerMaterialInstallation(s,j,command(),ops,users,at),/assignment changed/);
 const cmd=command(s,{installerId:'other'});cmd.requestId='offer-test-0002';cmd.baseVersion=j.versions.plan;cmd.assignmentVersion=j.versions.assignment;const reassigned=offerMaterialInstallation(s,j,cmd,ops,users,at);
 assert.equal(reassigned.id,j.id);assert.equal(reassigned.assignment.status,'pending');assert.equal(canRead(reassigned,installer),false);assert.equal(canRead(reassigned,other),true);assert.equal(reassigned.assignmentHistory.length,3);
 for(const mutate of [x=>x.workLog.push({by:'installer'}),x=>x.materials.items[0].issued=1,x=>x.evidence.push({by:'installer',id:'photo'}),x=>x.cameras[0].cable={route:'TEST'}]){const copy=structuredClone(j);mutate(copy);assert.throws(()=>offerMaterialInstallation(s,copy,cmd,ops,users,at),/already recorded/);}
});
test('API offers are idempotent, concurrent offers have one winner, and access is scoped',async()=>{
 const store=new FieldMemoryStore(),s=source();const h=createInstallerHandler({store,now:()=>at,authorize:async req=>({me:users.find(u=>u.id===req.headers.get('authorization')),users,readySources:[s]})});
 const call=async(user,cmd,jobId=s.installationId)=>{const r=await h(new Request('https://test/api/installer'+(!cmd?'?jobId='+jobId:''),{method:cmd?'POST':'GET',headers:{authorization:user},...(cmd?{body:JSON.stringify({jobId,command:cmd})}:{})}));return {status:r.status,...await r.json()};};
 assert.equal((await call('sales',command())).status,403);assert.equal((await call('ops',command(),'wrong-job')).status,409);
 const outcomes=await Promise.all([call('ops',command()),call('ops',{...command(),requestId:'other-offer-0002'})]);assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,409]);assert.equal(store.rows.size,1);assert.equal((await call('ops',command())).status,200);
 assert.equal((await call('other')).status,404);assert.equal((await call('installer')).job.assignment.status,'pending');
 const j=(await call('installer')).job;assert.equal((await call('installer',response(j,'accepted'))).status,200);
});
test('existing unused installation is reused and duplicate source records are blocked',async()=>{
 const store=new FieldMemoryStore(),s={...source(),sourceId:'quote1'},old=offer();old.sourceId='quote1';old.id='source-quote1';await store.setJSON('jobs/'+old.id,old);assert.equal((await resolveInstallationSource(s,store)).installationId,old.id);
 await store.setJSON('jobs/second',{...old,id:'second'});await assert.rejects(()=>resolveInstallationSource(s,store),/more than one installation/);
});
test('acceptance locks the offered pay and equipment until an explicit new offer',()=>{
 const j=offer();assert.throws(()=>applyCommand(j,{action:'installerPay',requestId:'changed-pay-test',baseVersion:0,data:{payments:[{installerId:installer.id,amount:500000}]}},ops,at),/Materials & buying/);
 assert.throws(()=>applyCommand(j,{action:'plan',requestId:'changed-plan-test',baseVersion:j.versions.plan,data:{assignees:[other.id],scheduledDate:j.scheduledDate}},ops,at),/Materials & buying/);
 assert.throws(()=>applyCommand(j,{action:'materialIssue',requestId:'stock-issue-test',baseVersion:0,data:{}},ops,at),/Wait for the installer/);
 const accepted=applyCommand(j,response(j,'accepted'),installer,at);assert.throws(()=>offerMaterialInstallation(source(),accepted,{...command(),baseVersion:j.versions.plan,assignmentVersion:j.versions.assignment},ops,users,at),/assignment changed/);
});
