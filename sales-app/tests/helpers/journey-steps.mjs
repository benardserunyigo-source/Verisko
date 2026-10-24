import assert from 'node:assert/strict';
import {VERSION} from '../../netlify/functions/lib/pricing-policy.mjs';
import {IMAGE} from './journey-fixture.mjs';
import '../../commission.js';import '../../sales-pay-policy.js';
const good=r=>{assert.equal(r.status,200,r.error);return r;};
export async function contactToPaid(f){
 const contact={id:'journey-client',business:'TEST Journey Shop',contact:'TEST Site contact',phone:'0772111222',location:'TEST Kampala',createdBy:'TEST sales',createdByEmail:'sales@test.invalid',created:f.day(),leadOnly:true,followUps:[],stage:'New prospect'};
 good(await f.save('sales',d=>d.prospects.push(contact)));assert.equal((await f.save('sales',d=>d.prospects.push({...contact,id:'duplicate-contact'}))).status,400);assert.equal((await f.workspace('operations')).prospects.length,1);assert.equal((await f.workspace('other-sales')).prospects.length,0);assert.equal((await f.workspace('teamlead')).prospects.length,0);
 const requestId='journey-request-repeat';good(await f.readyCmd('sales','request',{requestId,note:'TEST: Ready for a visit.'}));good(await f.readyCmd('sales','request',{requestId,baseVersion:0}));assert.equal((await f.ready.get('cases/journey-client')).history.length,1);
 good(await f.readyCmd('teamlead','take'));good(await f.readyCmd('teamlead','assign',{toId:'operations'}));assert.equal((await f.readyCmd('operations','return',{note:''})).status,400);good(await f.readyCmd('operations','return',{note:'TEST: Confirm site access.'}));good(await f.readyCmd('teamlead','return',{note:'TEST: Access confirmed.'}));
 good(await f.readyCmd('operations','confirm_visit',{date:f.day(),time:'10:00'}));
 const addNote=(role,note)=>f.save(role,d=>d.prospects.find(p=>p.id===contact.id).followUps.push({at:f.now(),byEmail:role+'@test.invalid',by:'TEST '+role,note}));
 good(await addNote('sales','TEST SALES INTERACTION'));good(await addNote('operations','TEST OPS INTERACTION'));assert.equal((await f.workspace('sales')).prospects[0].followUps.length,2);
 good(await f.readyCmd('operations','complete_visit',{date:f.day()}));
 good(await f.save('operations',d=>d.jobs.push({id:'journey-quote',ref:'TEST-Q-001',prospectId:contact.id,stage:'Sent',pricingVersion:VERSION,servicePolicyVersion:globalThis.VeriskoCare.VERSION,cameraCount:4,installationType:'Simple',addons:{},zone:'1',costConfirmed:true,costEvidence:'PRIVATE Supplier PI and site survey',paymentPlan:'cash'})));
 assert.equal((await f.readyCmd('operations','quote_sent',{date:f.day(),quoteId:'another-clients-quote'})).status,400);
 good(await f.readyCmd('operations','quote_sent',{date:f.day()}));const sent=(await f.ready.get('cases/journey-client')).quoteSent;assert.equal(sent.sourceId,'journey-quote');assert.equal(sent.reference,'TEST-Q-001');
 good(await f.readyCmd('operations','record_payment',{amount:2000000,date:f.day(),method:'MTN MoMo',reference:'PRIVATE PAYMENT REFERENCE'}));assert.equal((await f.readyCmd('teamlead','approve_payment')).status,403);
 const week=globalThis.VeriskoSalesPay.period(f.now());assert.equal(globalThis.VeriskoSalesPay.calculate(await f.workspace('sales'),week,'sales@test.invalid').total,15000);
 const approveId='journey-approve-repeat';good(await f.readyCmd('admin','approve_payment',{requestId:approveId}));good(await f.readyCmd('admin','approve_payment',{requestId:approveId,baseVersion:0}));assert.equal(globalThis.VeriskoSalesPay.calculate(await f.workspace('sales'),week,'sales@test.invalid').total,115000);
 assert.equal((await f.readyCmd('operations','record_payment',{amount:2000000,date:f.day(),method:'Cash'})).status,409);
}
export async function planAndAssign(f){
 const sourceId='journey-quote',items=[{id:'camera',name:'4K bullet camera',planned:4,unit:'pcs',source:'China'},{id:'cable',name:'Cat6 cable',planned:200,unit:'m',source:'Uganda'}];
 good(await f.readyCmd('operations','plan_materials',{sourceId,items}));assert.equal((await f.readyCmd('teamlead','request_procurement',{sourceId})).status,403);good(await f.readyCmd('operations','request_procurement',{sourceId}));
 for(const i of items)good(await f.readyCmd('operations','order_material',{sourceId,itemId:i.id,quantity:i.planned,date:f.day(),supplier:'PRIVATE-SUPPLIER',link:'https://example.com/PRIVATE-QUOTE'}));
 good(await f.readyCmd('operations','receive_material',{sourceId,itemId:'camera',quantity:4,date:f.day()}));assert.equal((await f.ok('installer','operations')).readySources.length,0);
 good(await f.readyCmd('operations','receive_material',{sourceId,itemId:'cable',quantity:200,date:f.day()}));
 const source=(await f.ok('installer','operations')).readySources[0];assert.equal(source.sourceId,'journey-quote');
 const offer={jobId:source.installationId,command:{action:'offerMaterials',requestId:'journey-offer-repeat',baseVersion:0,assignmentVersion:0,data:{contactId:source.contactId,materialSourceId:source.materialSourceId,snapshot:source.snapshot,installerId:'installer',siteStaffId:'operations',scheduledDate:f.day(),amount:350000,locations:['Gate','Reception','Rear','Office'],remoteIncluded:true}}};
 good(await f.api('installer','operations',offer));good(await f.api('installer','operations',offer));assert.equal((await f.workspace('sales')).prospects[0].readyProgress,'Waiting for installer reply');assert.equal(f.install.rows.size,1);
 const pending=(await f.ok('installer','installer')).jobs[0];assert.deepEqual(pending.materials.items.map(i=>[i.id,i.needed,i.issued]),[['camera',4,0],['cable',200,0]]);assert.equal((await f.installCmd('installer','workStart',{})).status,409);
 good(await f.installCmd('installer','assignmentResponse',{status:'accepted'},{baseVersion:pending.versions.assignment}));assert.equal((await f.workspace('sales')).prospects[0].readyProgress,'Installer assigned');return pending.id;
}
export async function finish(f,{approve=true}={}){
 let job=()=>f.install.get('jobs/'+[...f.install.rows.values()][0].data.id);const version=async k=>({baseVersion:(await job()).versions[k]||0});
 for(const i of (await job()).materials.items)good(await f.installCmd('operations','materialIssue',{itemId:i.id,quantity:i.needed},await version('materials')));good(await f.installCmd('operations','materialConfirm',{},await version('materials')));
 good(await f.installCmd('operations','pilot',{cableMethods:'One full cable per camera.',weather:'Sealed entries.',mounting:'Correct fixings.',approvalCover:'Operations',backup:'Operations',confirmed:true},await version('pilot')));
 const photo=async(kind,cameraId='')=>good(await f.installCmd(kind==='reference'?'operations':'installer','evidence',{id:'photo-'+kind+'-'+(cameraId||'site'),kind,image:IMAGE},{cameraId}));await photo('reference');
 const location={lat:.3,lng:32.5,accuracy:10};good(await f.installCmd('installer','workStart',{location,capturedAt:f.now()}));
 for(const c of (await job()).cameras){for(const kind of ['route','mount','fixings','entry','view'])await photo(kind,c.id);good(await f.installCmd('installer','cable',{route:'NVR to camera through conduit',joins:'no'},{cameraId:c.id,baseVersion:0}));good(await f.installCmd('installer','mount',{fixings:true,secured:true,stability:true},{cameraId:c.id,baseVersion:0}));good(await f.installCmd('installer','tests',Object.fromEntries(['live','recording','playback','coverage','remote'].map(k=>[k,{result:'pass'}])),{cameraId:c.id,baseVersion:0}));}
 good(await f.installCmd('installer','materialReport',{itemId:'camera',used:4,damaged:0,missing:0},await version('materials')));good(await f.installCmd('installer','materialReport',{itemId:'cable',used:180,damaged:0,missing:0},await version('materials')));await photo('demo');
 good(await f.installCmd('installer','handover',{demonstration:'Live view, playback and phone viewing.',issues:'None',acknowledged:true,customerName:'TEST Operations'},await version('handover')));good(await f.installCmd('installer','workFinish',{location,capturedAt:f.now()}));good(await f.installCmd('installer','submit'));assert.equal((await f.workspace('sales')).prospects[0].readyProgress,'Waiting for installation approval');
 assert.equal((await f.installCmd('installer','complete',{comment:'FORGED'})).status,403);assert.equal((await f.installCmd('operations','complete',{comment:'Before returns'})).status,400);
 good(await f.installCmd('operations','materialReceive',{itemId:'cable',good:20,damaged:0},await version('materials')));if(approve)good(await f.installCmd('operations','complete',{comment:'Photos, tests and stock returns checked.'}));return job();
}
