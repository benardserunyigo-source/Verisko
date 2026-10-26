import test from 'node:test';import assert from 'node:assert/strict';
import {buildJobSummaries,operationsTasks,mountJobSummaries} from '../job-summary.mjs';
import {projectInstallerCash,guardInstallerCash,installerExpenses} from '../netlify/functions/lib/installer-cash.mjs';
import {requestCounts,requestCompleted} from '../visit-team-ui.mjs';
import {journeyFixture} from './helpers/journey-fixture.mjs';
const p={id:'p',installerId:'installer',amount:350000,paidOn:'2026-10-25',method:'Mobile money',reference:'DEMO-P',by:'ops',at:'2026-10-25T10:00:00Z'},j={id:'i',sourceId:'q',installerPayments:[p]},data={transactions:[]};
test('warehouse-only and mixed jobs use the held quantity and never request buying twice',()=>{
 for(const [warehouse,receipts,ordered,requested,ready,buy] of [[4,0,0,false,true,false],[2,2,2,true,true,false],[2,0,0,false,false,true],[2,0,2,true,false,false]]){
 const r=buildJobSummaries({user:{role:'operations'},data:{jobs:[{id:'q',prospectId:'c',stage:'Accepted',quotedTotal:1000}],transactions:[{id:'pay',installId:'q',amount:1000,direction:'in',status:'approved'}]},cases:[{contactId:'c',contact:{},visit:{doneAt:'2026-10-25'},materialPlans:[{sourceId:'q',requestedAt:requested?'2026-10-25':'',items:[{planned:4,warehouse,orders:ordered?[{quantity:ordered}]:[],receipts:receipts?[{quantity:receipts}]:[]}]}]}]})[0];
 assert.equal(r.steps.find(s=>s[0]==='Materials ready')[1],ready);assert.equal(r.tasks.some(t=>t.text.startsWith('Request buying')),buy);
 }
});
test('one installer payment projects one pending cash expense, reopens without duplicates and retains Admin approval',()=>{
 const out=projectInstallerCash(data,[j]);assert.equal(out.transactions.length,1);const e=out.transactions[0];assert.equal(e.status,'pending');assert.equal(e.amount,350000);assert.equal(e.installId,'q');assert.equal(projectInstallerCash(out,[j]).transactions.length,1);
 const approved={...e,status:'approved',proofId:'demo-receipt',reviewedBy:'Admin'};const reopened=projectInstallerCash({transactions:[approved]},[j]).transactions[0];assert.equal(reopened.status,'approved');assert.equal(reopened.proofId,'demo-receipt');assert.equal(reopened.installerCashReview,undefined);
 assert.deepEqual(guardInstallerCash([e],[approved],[j]),[approved]);assert.throws(()=>guardInstallerCash([e],[{...e,status:'approved'}],[j]),/receipt photo/);
});
test('cash links cannot be forged, edited, duplicated or erased by a stale save',()=>{
 const e=installerExpenses([j])[0];for(const changes of [{amount:1},{installId:'other'},{installerPaymentKey:'fake'},{direction:'in'}])assert.throws(()=>guardInstallerCash([e],[{...e,...changes}],[j]));assert.throws(()=>guardInstallerCash([e],[e,{...e,id:'other'}],[j]));assert.deepEqual(guardInstallerCash([e],[],[j]),[e]);assert.throws(()=>guardInstallerCash([e],[{...e,id:'renamed',installerPaymentKey:undefined}],[j]),/already has/);
 assert.throws(()=>guardInstallerCash([e],[e,{id:'manual',amount:e.amount,date:e.date,method:e.method,reference:e.reference,installId:e.installId,direction:'out',category:'Installer payment'}],[j]),/matching installer/);
});
test('older possible expense is flagged without auto-linking or charging twice; cancellation keeps approved cash visible',()=>{
 const old={id:'legacy',direction:'out',installId:'q',category:'Installer labour',amount:p.amount,date:p.paidOn,status:'approved'};
 const x=projectInstallerCash({transactions:[old]},[j]);assert.equal(x.transactions.length,1);assert.match(x.transactions[0].installerCashReview,/already be recorded/);assert.equal(x.transactions[0].installerPaymentKey,undefined);
 const e={...installerExpenses([j])[0],status:'approved',proofId:'demo'};const cancelled={...j,installerPaymentVoids:[{paymentId:'p'}]};assert.equal(projectInstallerCash({transactions:[e]},[cancelled]).transactions[0].status,'approved');assert.equal(projectInstallerCash({transactions:[e]},[cancelled]).transactions[0].installerPaymentVoided,true);assert.throws(()=>guardInstallerCash([],[e],[cancelled]),/cancelled/);
});
test('completed visits stay in history but do not inflate My visits count',()=>{
 const done={ownerId:'ops',installationProgress:[{stage:'Client signed off'}]},active={ownerId:'ops'},newRequest={ownerId:null};assert.equal(requestCompleted(done),true);assert.deepEqual(requestCounts([done,active,newRequest],{id:'ops'}),{new:1,mine:1});
});
test('Operations today highlights actionable jobs, not completed jobs; task buttons retain source context',async()=>{
 const html=operationsTasks([{id:'closed',tasks:[]},{id:'fix',source:{id:'fix'},business:'DEMO fix',reference:'Q',stage:'Fix needed',tasks:[{text:'Review the saved checks and photos.',action:'installation'}]}]);assert.doesNotMatch(html,/closed/);assert.match(html,/data-summary-task="fix"/);
 let selected;const b={dataset:{summaryTask:'q',taskAction:'materials'}},host={innerHTML:'',querySelector:()=>({addEventListener(){}}),querySelectorAll:s=>s==='[data-summary-task]'?[b]:[]};const ctl=mountJobSummaries({host,user:{role:'operations'},isCurrent:()=>true,tasksOnly:true,onMaterials:x=>selected=x,api:async(_m,_b,_q,route)=>route==='/api/data'?{data:{jobs:[{id:'q',prospectId:'c'}]}}:route==='/api/installer'?{jobs:[]}:{items:[]}});await new Promise(r=>setImmediate(r));b.onclick();assert.deepEqual(selected,{contactId:'c',sourceId:'q'});ctl.stop();
});
test('actual data API projects crew expenses privately and preserves Admin-only approval through save/reload',async()=>{
 const f=await journeyFixture();await f.install.setJSON('jobs/i',j);
 const office=await f.workspace('operations');const e=office.transactions[0];assert.equal(e.status,'pending');assert.equal((await f.workspace('sales')).transactions.length,0);assert.equal((await f.workspace('teamlead')).transactions.length,0);
 const result=await f.save('operations',d=>{d.transactions[0].status='approved';d.transactions[0].proofId='demo';});assert.equal(result.status,200);assert.equal((await f.workspace('operations')).transactions[0].status,'pending');
 const approve=await f.save('admin',d=>{d.transactions[0].status='approved';d.transactions[0].proofId='demo';});assert.equal(approve.status,200);assert.equal((await f.workspace('operations')).transactions.length,1);assert.equal((await f.workspace('operations')).transactions[0].status,'approved');
 assert.equal((await f.save('operations',d=>{d.transactions[0].amount=1;})).status,409);
});
test('sent-back linked expense can be corrected once; cancelled payment never silently reverses approved money',async()=>{
 const f=await journeyFixture();await f.install.setJSON('jobs/i',j);await f.save('admin',d=>{d.transactions[0].status='query';d.transactions[0].reviewNote='Receipt is not clear';});assert.equal((await f.workspace('operations')).transactions[0].status,'query');
 assert.equal((await f.save('operations',d=>{d.transactions[0].status='pending';d.transactions[0].proofId='clear-demo-proof';})).status,200);assert.equal((await f.workspace('admin')).transactions[0].status,'pending');
 await f.save('admin',d=>{d.transactions[0].status='approved';});await f.install.setJSON('jobs/i',{...j,installerPaymentVoids:[{paymentId:'p'}]});assert.equal((await f.workspace('operations')).transactions[0].status,'approved');
 await f.save('operations',d=>{d.transactions[0].status='void';d.transactions[0].cashVoidReason='Source entry wrong';});assert.equal((await f.workspace('operations')).transactions[0].status,'approved');
 assert.equal((await f.save('admin',d=>{d.transactions[0].status='void';d.transactions[0].cashVoidReason='Source entry wrong';})).status,200);const out=(await f.workspace('admin')).transactions;assert.equal(out.length,1);assert.equal(out[0].status,'void');assert.equal(out[0].proofId,'clear-demo-proof');
});
test('Admin links a matching earlier expense without another cash entry or losing proof and approval',()=>{
 const old={id:'legacy',direction:'out',installId:'q',category:'Labour',method:'MTN MoMo',amount:p.amount,date:p.paidOn,status:'approved',proofId:'earlier-proof'};
 const review=projectInstallerCash({transactions:[old]},[j]).transactions[0];const e=review.installerCashCandidates[0];const linked={...old,installerPaymentKey:e.installerPaymentKey,installerJobId:e.installerJobId,installerPaymentId:e.installerPaymentId,installerId:e.installerId};
 assert.throws(()=>guardInstallerCash([old],[linked],[j],{role:'operations'}),/Admin/);assert.equal(guardInstallerCash([old],[linked],[j],{role:'admin'}).length,1);
 const reopened=projectInstallerCash({transactions:[linked]},[j]).transactions;assert.equal(reopened.length,1);assert.equal(reopened[0].id,'legacy');assert.equal(reopened[0].status,'approved');assert.equal(reopened[0].proofId,'earlier-proof');
});

test('Today keeps unassigned contacts in the visit queue and never leads a new job with a payment task',()=>{
 const source={id:'q',prospectId:'c',stage:'Draft',quotedTotal:1000};const rows=buildJobSummaries({user:{role:'operations'},data:{jobs:[source]},cases:[{contactId:'c',contact:{business:'DEMO new quote'},ownerId:'ops'}]});const html=operationsTasks(rows);assert.ok(html.indexOf('Arrange or finish the site visit.')>=0);assert.ok(!html.includes('data-task-action="payments"'));
 const queued=buildJobSummaries({user:{role:'operations'},data:{},cases:[{contactId:'new',contact:{business:'DEMO queued'},ownerId:null}]});assert.doesNotMatch(operationsTasks(queued),/DEMO queued/);
});
