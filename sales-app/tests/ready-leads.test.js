import test from 'node:test';import assert from 'node:assert/strict';
import {createReadyHandler} from '../netlify/functions/lib/ready-leads-core.mjs';
import {FieldMemoryStore} from './helpers/field-fixture.mjs';
function fixture(){
 const users=[{id:'sales',name:'Test Sales',email:'sales@test',role:'sales'},{id:'other',name:'Other Sales',email:'other@test',role:'sales'},{id:'lead',name:'Test Lead',email:'lead@test',role:'teamlead'},{id:'ops',name:'Test Operations',email:'ops@test',role:'operations'},{id:'admin',name:'Test Admin',email:'admin@test',role:'admin'},{id:'installer',name:'Test Installer',email:'installer@test',role:'installer'}];
 const prospects=[{id:'contact',business:'Test Shop',phone:'0772000111',createdBy:'Test Sales',createdByEmail:'sales@test',leadOnly:true},{id:'private',business:'PRIVATE UNSENT CONTACT',createdByEmail:'other@test',leadOnly:true}];
 const transactions=[],jobs=[],appointments=[],store=new FieldMemoryStore();let serial=0;
 const handler=createReadyHandler({store,authorize:async req=>({me:users.find(u=>u.id===req.headers.get('authorization')),users,prospects,appointments,transactions,jobs}),now:()=> '2026-10-22T12:00:00.000Z'});
 const call=async(user,action,extra={})=>{const response=await handler(new Request('https://test.local/api/ready-leads',{method:action?'POST':'GET',headers:{authorization:user,'Content-Type':'application/json'},...(action?{body:JSON.stringify({contactId:'contact',baseVersion:0,requestId:'request-'+(++serial),action,...extra})}:{})}));return {status:response.status,...await response.json()};};
 return {users,prospects,appointments,transactions,jobs,store,handler,call};
}
test('one saved contact enters a shared queue visible to Sales, Team Lead and Operations only',async()=>{const f=fixture();assert.equal((await f.call('sales','request',{note:'Call before visiting'})).status,200);for(const role of ['sales','lead','ops','admin']){const r=await f.call(role);assert.equal(r.items.length,1);assert.equal(r.items[0].contact.id,'contact');assert.equal(r.items[0].ownerId,null);assert.ok(!JSON.stringify(r).includes('PRIVATE UNSENT'));}assert.equal((await f.call('other')).items.length,0);assert.equal((await f.call('installer')).status,403);assert.equal((await f.call('missing')).status,403);});
test('ready submission is idempotent and cannot create duplicates or change the original salesperson',async()=>{const f=fixture(),body={requestId:'same-request',note:'First context'};const a=await f.call('sales','request',body),b=await f.call('sales','request',body);assert.equal(b.item.version,a.item.version);assert.equal(b.item.history.length,1);assert.equal((await f.call('sales','request')).status,409);assert.equal(f.prospects[0].createdByEmail,'sales@test');});
test('two simultaneous takes produce one owner; stale writes cannot steal it',async()=>{const f=fixture();await f.call('sales','request');const [a,b]=await Promise.all([f.call('ops','take',{baseVersion:1}),f.call('lead','take',{baseVersion:1})]);assert.deepEqual([a.status,b.status].sort(),[200,409]);const item=(await f.call('sales')).items[0];assert.ok(['ops','lead'].includes(item.ownerId));assert.equal(item.history.length,2);assert.equal((await f.call(item.ownerId==='ops'?'lead':'ops','take',{baseVersion:item.version})).status,409);});
test('assignment is limited to the current owner or Admin; previous owner requires Send back with reason',async()=>{const f=fixture();await f.call('sales','request');await f.call('ops','take',{baseVersion:1});assert.equal((await f.call('lead','assign',{baseVersion:2,toId:'lead'})).status,403);let r=await f.call('ops','assign',{baseVersion:2,toId:'lead'});assert.equal(r.item.ownerId,'lead');assert.equal((await f.call('lead','assign',{baseVersion:3,toId:'ops'})).status,400);assert.equal((await f.call('lead','return',{baseVersion:3,note:' '})).status,400);r=await f.call('lead','return',{baseVersion:3,note:'Please confirm the preferred date'});assert.equal(r.item.ownerId,'ops');assert.equal(r.item.state,'assigned');assert.equal(r.item.history.at(-1).note,'Please confirm the preferred date');assert.equal(r.item.history.at(-1).by,'lead');});
test('a claimed lead can return to its original salesperson with reason and be sent again',async()=>{const f=fixture();await f.call('sales','request');await f.call('lead','take',{baseVersion:1});let r=await f.call('lead','return',{baseVersion:2,note:'Client asked us to call next week'});assert.equal(r.item.state,'returned');assert.equal(r.item.ownerId,'sales');assert.equal((await f.call('ops','take',{baseVersion:3})).status,409);r=await f.call('sales','request',{baseVersion:3,note:'Client is now ready'});assert.equal(r.item.state,'queued');assert.equal(r.item.ownerId,null);assert.equal(r.item.history.length,4);assert.equal(r.item.contact.createdBy,'Test Sales');});
test('Sales cannot take or assign, other reps cannot request, and invalid targets are rejected',async()=>{const f=fixture();assert.equal((await f.call('other','request')).status,404);assert.equal((await f.call('lead','take',{contactId:'private'})).status,404);await f.call('sales','request');assert.equal((await f.call('sales','take',{baseVersion:1})).status,403);assert.equal((await f.call('ops','assign',{baseVersion:1,toId:'sales'})).status,400);assert.equal((await f.call('ops','assign',{baseVersion:1,toId:'installer'})).status,400);});
test('legacy Operations handovers are included for both receiving roles without a write on GET',async()=>{const f=fixture();Object.assign(f.prospects[0],{handoffAt:'2026-10-20T10:00:00Z',handoffTo:'operations',handoffNote:'Legacy context'});assert.equal((await f.call('lead')).items[0].version,0);assert.equal(f.store.rows.size,0);const r=await f.call('lead','take');assert.equal(r.item.ownerId,'lead');assert.equal(r.item.history.length,2);});
test('a client cannot spoof actor names, request IDs, ownership or return history',async()=>{const f=fixture();const r=await f.call('sales','request',{by:'ops',ownerId:'ops',history:[{type:'taken'}]});assert.equal(r.item.history[0].by,'sales');assert.equal(r.item.ownerId,null);assert.equal((await f.call('ops','take',{baseVersion:1,requestId:r.item.history[0].id})).status,409);});
test('cross-origin writes and malformed request data are rejected',async()=>{const f=fixture();const r=await f.handler(new Request('https://test.local/api/ready-leads',{method:'POST',headers:{authorization:'sales',origin:'https://other.local'},body:JSON.stringify({})}));assert.equal(r.status,403);assert.equal((await f.call('sales','request',{baseVersion:-1})).status,409);assert.equal((await f.call('sales','request',{contactId:'../private'})).status,400);});

test('Team Lead can confirm, complete and record quote sent; Sales sees progress without quote reference',async()=>{
 const f=fixture();await f.call('sales','request');await f.call('lead','take',{baseVersion:1});
 let r=await f.call('lead','confirm_visit',{baseVersion:2,date:'2026-10-22',time:'14:30'});assert.equal(r.status,200);assert.equal(r.item.visit.date,'2026-10-22');assert.equal(r.item.visit.byName,'Test Lead');
 r=await f.call('lead','complete_visit',{baseVersion:3,date:'2026-10-22'});assert.equal(r.status,200);assert.equal(r.item.visit.doneByName,'Test Lead');
 r=await f.call('lead','quote_sent',{baseVersion:4,date:'2026-10-22',reference:'PRIVATE-QUOTE-021'});assert.equal(r.status,200);assert.equal(r.item.quoteSent.reference,'PRIVATE-QUOTE-021');
 const sales=(await f.call('sales')).items[0];assert.equal(sales.visit.doneAt,'2026-10-22T12:00:00+03:00');assert.equal(sales.quoteSent.at,'2026-10-22T12:00:00+03:00');assert.ok(!JSON.stringify(sales).includes('PRIVATE-QUOTE'));assert.equal(sales.quoteSent.byEmail,undefined);assert.equal(sales.contact.createdBy,'Test Sales');assert.equal((await f.call('other')).items.length,0);
});
test('progress requires an owner, the correct order and valid dates; duplicate updates do not earn twice',async()=>{
 const f=fixture();await f.call('sales','request');assert.equal((await f.call('ops','confirm_visit',{baseVersion:1,date:'2026-10-22',time:'10:00'})).status,409);await f.call('ops','take',{baseVersion:1});
 for(const action of ['complete_visit','quote_sent'])assert.equal((await f.call('ops',action,{baseVersion:2,date:'2026-10-22'})).status,409);
 for(const [date,time] of [['2026-02-30','10:00'],['2026-10-21','10:00'],['2026-10-22','25:10']])assert.equal((await f.call('ops','confirm_visit',{baseVersion:2,date,time})).status,400);
 await f.call('ops','confirm_visit',{baseVersion:2,date:'2026-10-22',time:'10:00'});
 assert.equal((await f.call('ops','complete_visit',{baseVersion:3,date:'2026-10-23'})).status,400);
 const a=await f.call('ops','complete_visit',{baseVersion:3,date:'2026-10-22',requestId:'done-once-only'}),b=await f.call('ops','complete_visit',{baseVersion:3,date:'2026-10-22',requestId:'done-once-only'});assert.equal(a.item.version,b.item.version);assert.equal((await f.call('ops','complete_visit',{baseVersion:4,date:'2026-10-22'})).status,409);
 assert.equal((await f.call('ops','quote_sent',{baseVersion:4,date:'2026-10-21'})).status,400);
});
test('Sales and a non-owner cannot change progress; converted contacts keep their existing queue progress',async()=>{
 const f=fixture();await f.call('sales','request');await f.call('ops','take',{baseVersion:1});
 for(const action of ['confirm_visit','complete_visit','quote_sent'])for(const user of ['sales','lead'])assert.equal((await f.call(user,action,{baseVersion:2,date:'2026-10-22',time:'10:00'})).status,403);
 await f.call('ops','confirm_visit',{baseVersion:2,date:'2026-10-22',time:'10:00'});f.prospects[0].leadOnly=false;assert.equal((await f.call('ops','complete_visit',{baseVersion:3,date:'2026-10-22'})).status,200);
 assert.equal((await f.call('ops','return',{baseVersion:4,note:'Back to Sales'})).status,409);
});
test('simultaneous confirmations create only one visit',async()=>{
 const f=fixture();await f.call('sales','request');await f.call('ops','take',{baseVersion:1});const results=await Promise.all(['ops','admin'].map(user=>f.call(user,'confirm_visit',{baseVersion:2,date:'2026-10-22',time:'10:00'})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await f.call('sales')).items[0].history.filter(h=>h.type==='visit_confirmed').length,1);
});
test('confirmation reuses a single existing booking and refuses ambiguous or completed legacy visits',async()=>{
 for(const scenario of ['single','multiple','completed']){const f=fixture();await f.call('sales','request');await f.call('ops','take',{baseVersion:1});f.prospects[0].leadOnly=false;f.appointments.push({id:'existing-visit',prospectId:'contact',status:'Proposed',...(scenario==='completed'?{visitResult:'real'}:{})});if(scenario==='multiple')f.appointments.push({id:'second-visit',prospectId:'contact',status:'Proposed'});
 const r=await f.call('ops','confirm_visit',{baseVersion:2,date:'2026-10-22',time:'10:00'});assert.equal(r.status,scenario==='single'?200:409);if(r.item)assert.equal(r.item.visit.id,'existing-visit');}
});

async function paymentFixture(owner='ops') {const f=fixture();await f.call('sales','request');await f.call(owner,'take',{baseVersion:1});await f.call(owner,'confirm_visit',{baseVersion:2,date:'2026-10-22',time:'10:00'});return f;}
const pay={baseVersion:3,amount:2000000,date:'2026-10-22',method:'MTN MoMo',reference:'PRIVATE-MOMO-REF'};
test('Operations and Team Lead record pending first payments, only Admin approves, Sales sees approval and eligibility',async()=>{
 for(const owner of ['ops','lead']){const f=await paymentFixture(owner);let r=await f.call(owner,'record_payment',pay);assert.equal(r.status,200);assert.equal(r.item.firstPayment.status,'pending');assert.equal(r.item.firstPayment.amount,2000000);let sales=(await f.call('sales')).items[0];assert.equal(sales.firstPayment.status,'pending');assert.equal(sales.firstPayment.commissionEligible,true);assert.equal(sales.firstPayment.amount,undefined);assert.ok(!JSON.stringify(sales).includes('PRIVATE-MOMO-REF'));
 for(const user of ['sales','ops','lead'])assert.equal((await f.call(user,'approve_payment',{baseVersion:4})).status,403);
 r=await f.call('admin','approve_payment',{baseVersion:4,approvedAt:'2020-01-01'});assert.equal(r.item.firstPayment.status,'approved');assert.equal(r.item.firstPayment.approvedAt,'2026-10-22T12:00:00.000Z');sales=(await f.call('sales')).items[0];assert.equal(sales.firstPayment.status,'approved');assert.equal((await f.call('other')).items.length,0);}
});
test('duplicate and concurrent first payments produce one record, and approval retries stay idempotent',async()=>{
 const f=await paymentFixture();const r=await Promise.all([f.call('ops','record_payment',pay),f.call('admin','record_payment',pay)]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);assert.equal((await f.call('ops','record_payment',{...pay,baseVersion:4})).status,409);
 const a=await f.call('admin','approve_payment',{baseVersion:4,requestId:'approve-just-once'}),b=await f.call('admin','approve_payment',{baseVersion:4,requestId:'approve-just-once'});assert.equal(a.item.version,b.item.version);assert.equal(a.item.history.filter(h=>h.type==='payment_approved').length,1);assert.equal((await f.call('admin','approve_payment',{baseVersion:5})).status,409);
});
test('payments require valid amounts and dates, no forged approval, and only the owner can record',async()=>{
 const f=await paymentFixture();for(const user of ['sales','lead'])assert.equal((await f.call(user,'record_payment',pay)).status,403);
 for(const amount of [0,-1,1.2,'bad',1e20])assert.equal((await f.call('ops','record_payment',{...pay,amount})).status,400);
 for(const date of ['2026-02-30','2026-10-23','bad'])assert.equal((await f.call('ops','record_payment',{...pay,date})).status,400);
 assert.equal((await f.call('ops','record_payment',{...pay,method:'Crypto'})).status,400);const r=await f.call('ops','record_payment',{...pay,status:'approved',approvedAt:'2026-10-01',createdByEmail:'other@test'});assert.equal(r.item.firstPayment.status,'pending');assert.equal(r.item.firstPayment.approvedAt,'');const stored=await f.store.get('cases/contact');assert.equal(stored.firstPayment.createdByEmail,'ops@test');
});
test('Admin sends a payment back with a reason; owner corrects the same record and requests approval again',async()=>{
 const f=await paymentFixture('lead');await f.call('lead','record_payment',pay);assert.equal((await f.call('admin','payment_query',{baseVersion:4,note:''})).status,400);
 let r=await f.call('admin','payment_query',{baseVersion:4,note:'PRIVATE REVIEW REASON'});assert.equal(r.item.firstPayment.status,'query');assert.ok(!JSON.stringify((await f.call('sales')).items[0]).includes('PRIVATE REVIEW REASON'));
 assert.equal((await f.call('admin','approve_payment',{baseVersion:5})).status,409);const id=r.item.firstPayment.id;r=await f.call('lead','record_payment',{...pay,baseVersion:5,amount:1500000});assert.equal(r.item.firstPayment.id,id);assert.equal(r.item.firstPayment.status,'pending');assert.equal(r.item.firstPayment.amount,1500000);assert.equal((await f.call('admin','approve_payment',{baseVersion:6})).status,200);
});
test('existing direct and job-linked payments are shown instead of recorded twice; imported contacts stay ineligible',async()=>{
 for(const linked of [false,true]){const f=await paymentFixture();f.jobs.push({id:'job',prospectId:'contact'});f.transactions.push({id:'existing-payment',direction:'in',amount:500000,status:'pending',date:'2026-10-22',...(linked?{installId:'job'}:{prospectId:'contact'})});const r=await f.call('ops','record_payment',pay);assert.equal(r.status,409);assert.equal((await f.call('sales')).items[0].firstPayment.legacy,true);f.transactions[0].status='approved';f.transactions[0].approvedAt='2026-10-22T12:00:00Z';assert.equal((await f.call('sales')).items[0].firstPayment.status,'approved');}
 const f=await paymentFixture();f.prospects[0].imported=true;await f.call('ops','record_payment',pay);await f.call('admin','approve_payment',{baseVersion:4});assert.equal((await f.call('sales')).items[0].firstPayment.commissionEligible,false);
});
test('quote tracking reuses the saved quote and never links another client’s quote',async()=>{
 const f=fixture();await f.call('sales','request');await f.call('ops','take',{baseVersion:1});await f.call('ops','confirm_visit',{baseVersion:2,date:'2026-10-22',time:'10:00'});await f.call('ops','complete_visit',{baseVersion:3,date:'2026-10-22'});
 f.jobs.push({id:'q1',prospectId:'contact',ref:'TEST-001',stage:'Sent'},{id:'q2',prospectId:'contact',ref:'TEST-002',stage:'Sent'},{id:'foreign',prospectId:'private',ref:'PRIVATE',stage:'Sent'});
 assert.equal((await f.call('ops','quote_sent',{baseVersion:4,date:'2026-10-22'})).status,400);assert.equal((await f.call('ops','quote_sent',{baseVersion:4,date:'2026-10-22',quoteId:'foreign'})).status,400);
 const r=await f.call('ops','quote_sent',{baseVersion:4,date:'2026-10-22',quoteId:'q2',reference:'FORGED'});assert.equal(r.item.quoteSent.sourceId,'q2');assert.equal(r.item.quoteSent.reference,'TEST-002');assert.equal((await f.call('sales')).items[0].availableQuotes,undefined);
});

test('explicit Send back to Sales bypasses office pass-back, requires reason and preserves the same contact for resend',async()=>{
 const f=fixture();await f.call('sales','request');await f.call('ops','take',{baseVersion:1});await f.call('ops','assign',{baseVersion:2,toId:'lead'});
 assert.equal((await f.call('lead','return_sales',{baseVersion:3,note:''})).status,400);
 assert.equal((await f.call('ops','return_sales',{baseVersion:3,note:'Not ready'})).status,403);
 assert.equal((await f.call('sales','return_sales',{baseVersion:3,note:'Not ready'})).status,403);
 let r=await f.call('lead','return_sales',{baseVersion:3,note:'Client asked for a call next month'});assert.equal(r.status,200);assert.equal(r.item.ownerId,'sales');assert.equal(r.item.state,'returned');assert.equal(r.item.history.at(-1).type,'returned_to_sales');
 r=await f.call('sales','request',{baseVersion:r.item.version});assert.equal(r.status,200);assert.equal(r.item.contactId,'contact');assert.equal(r.item.state,'queued');assert.equal(r.item.history.length,5);assert.equal(f.prospects[0].createdByEmail,'sales@test');
});
test('a completed visit can return to Sales and resume without losing or repeating the completed visit',async()=>{
 const f=fixture();await f.call('sales','request');await f.call('ops','take',{baseVersion:1});await f.call('ops','confirm_visit',{baseVersion:2,date:'2026-10-22',time:'10:00'});let r=await f.call('ops','complete_visit',{baseVersion:3,date:'2026-10-22'});const visit=structuredClone(r.item.visit);
 f.prospects[0].leadOnly=false;r=await f.call('ops','return_sales',{baseVersion:4,note:'Not ready to buy until next month'});assert.equal(r.status,200);assert.deepEqual(r.item.visit,visit);
 r=await f.call('sales','request',{baseVersion:5,note:'Client called and is now ready'});assert.equal(r.status,200);assert.equal(r.item.visit.id,visit.id);assert.equal(r.item.visit.doneAt,visit.doneAt);assert.deepEqual((await f.call('ops')).items[0].visit,visit);
 r=await f.call('lead','take',{baseVersion:6});assert.equal(r.status,200);assert.equal((await f.call('lead','complete_visit',{baseVersion:7,date:'2026-10-22'})).status,409);
 assert.equal((await f.call('lead','quote_sent',{baseVersion:7,date:'2026-10-22'})).status,200);
});
test('a client with received money cannot be sent back into Sales prospecting',async()=>{
 const f=fixture();await f.call('sales','request');await f.call('ops','take',{baseVersion:1});f.transactions.push({id:'paid',direction:'in',prospectId:'contact',status:'approved',amount:100});
 const r=await f.call('ops','return_sales',{baseVersion:2,note:'Not ready'});assert.equal(r.status,409);assert.match(r.error,/payment or installation/);assert.equal((await f.call('sales')).items[0].state,'assigned');
});

test('returning an upcoming visit stops it, and the same visit must be confirmed again after resend',async()=>{
 const f=fixture();await f.call('sales','request');await f.call('ops','take',{baseVersion:1});let r=await f.call('ops','confirm_visit',{baseVersion:2,date:'2026-10-22',time:'10:00'});const id=r.item.visit.id;
 r=await f.call('ops','return_sales',{baseVersion:3,note:'Client wants us to wait'});assert.equal(r.status,200);assert.ok(r.item.visit.onHoldAt);
 f.prospects[0].leadOnly=false;r=await f.call('sales','request',{baseVersion:4});assert.equal(r.status,200);await f.call('lead','take',{baseVersion:5});
 assert.equal((await f.call('lead','complete_visit',{baseVersion:6,date:'2026-10-22'})).status,409);
 r=await f.call('lead','confirm_visit',{baseVersion:6,date:'2026-10-22',time:'15:00'});assert.equal(r.status,200);assert.equal(r.item.visit.id,id);assert.equal(r.item.visit.time,'15:00');assert.equal(r.item.visit.onHoldAt,undefined);
});

test('visit completion saves the stated Uganda time and actual record time, rejecting future or malformed times',async()=>{
 const f=fixture();await f.call('sales','request');await f.call('ops','take',{baseVersion:1});await f.call('ops','confirm_visit',{baseVersion:2,date:'2026-10-22',time:'10:00'});
 for(const time of ['25:00','12:65','junk','15:01'])assert.equal((await f.call('ops','complete_visit',{baseVersion:3,date:'2026-10-22',time})).status,400);
 const r=await f.call('ops','complete_visit',{baseVersion:3,date:'2026-10-22',time:'14:45'});assert.equal(r.status,200);assert.equal(r.item.visit.doneAt,'2026-10-22T14:45:00+03:00');assert.equal(r.item.visit.doneTime,'14:45');assert.equal(r.item.visit.doneRecordedAt,'2026-10-22T12:00:00.000Z');assert.equal(r.item.history.at(-1).time,'14:45');assert.equal((await f.call('sales')).items[0].visit.doneTime,'14:45');
});

test('a deferred contact must resume before entering the queue, keeping one original contact',async()=>{
 const f=fixture();Object.assign(f.prospects[0],{leadStatus:'Not ready',deferredReason:'Budget next term',followUp:'2026-11-10'});
 assert.equal((await f.call('sales','request')).status,409);assert.equal((await f.call('ops','request')).status,409);assert.equal((await f.call('sales')).items.length,0);
 f.prospects[0].leadStatus='Following up';assert.equal((await f.call('sales','request')).status,200);assert.equal((await f.call('sales')).items[0].contactId,'contact');assert.equal(f.prospects.filter(p=>p.id==='contact').length,1);
});
