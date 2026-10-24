import test from 'node:test';import assert from 'node:assert/strict';
import {buildJobSummaries,summaryCard,mountJobSummaries} from '../job-summary.mjs';
import {journeyFixture} from './helpers/journey-fixture.mjs';import {contactToPaid,planAndAssign,finish} from './helpers/journey-steps.mjs';
const user={id:'operations',role:'operations'},contact={id:'c',business:'TEST Shop',location:'Kampala'};
const source={id:'q',prospectId:'c',ref:'TEST-Q',stage:'Sent',quotedTotal:4000000};
const c={contactId:'c',contact,ownerName:'TEST Operations',visit:{doneAt:'2026-10-24'},quoteSent:{sourceId:'q'},paidWork:[{id:'q'}]};
const tx={id:'p',direction:'in',status:'approved',installId:'q',prospectId:'c',amount:2000000};
const job={id:'i',sourceId:'q',readyContactId:'c',business:'TEST Shop',status:'Completed',assignment:{status:'accepted'},assignees:['a','b'],installerPay:{a:{amount:200000},b:{amount:150000}},installerPayments:[{id:'old',installerId:'a',amount:200000},{id:'new',installerId:'a',amount:100000},{id:'bp',installerId:'b',amount:150000}],installerPaymentVoids:[{paymentId:'old'}],materials:{items:[]},clientReview:{outcome:'accepted',care:{monitoringCommissioned:true}}};
const build=(x={})=>buildJobSummaries({user,data:{jobs:[source],prospects:[contact],transactions:[tx]},cases:[c],installations:[job],...x});
test('one job joins the same client, quote, plan and installation; cash is not counted twice',()=>{
 const [r]=build({cases:[{...c,firstPayment:{...tx},materialPlans:[{sourceId:'q',items:[{planned:1,receipts:[{quantity:1}]}]}]}]});assert.equal(build().length,1);assert.equal(r.paid,2000000);assert.equal(r.balance,2000000);assert.equal(r.crewPaid,250000);assert.equal(r.crewBalance,100000);assert.equal(r.signed,true);assert.equal(r.steps.every(x=>x[1]),true);assert.ok(r.tasks.some(t=>t.text.includes('100,000')));
});
test('multiple jobs never receive the same unlinked client deposit',()=>{
 const rows=build({data:{jobs:[source,{...source,id:'q2',ref:'TEST-Q2'}],prospects:[contact],transactions:[{...tx,installId:''}]},cases:[{...c,paidWork:[{id:'q'},{id:'q2'}],firstPayment:tx}]});assert.equal(rows.length,2);assert.ok(rows.every(r=>r.paid===0&&r.unassignedClientMoney===2000000));assert.equal(new Set(rows.map(r=>r.id)).size,2);
});
test('unknown external quote total never becomes zero balance or fully settled client',()=>{
 const r=build({data:{jobs:[],prospects:[contact],transactions:[{...tx,installId:''}]},cases:[{...c,quoteSent:{reference:'EXTERNAL'},paidWork:[{id:'client-c'}]}],installations:[{...job,sourceId:'',materialSourceId:'client-c'}]})[0];assert.equal(r.total,null);assert.equal(r.balance,null);assert.equal(r.paid,2000000);assert.match(summaryCard(r),/Not yet known/);assert.ok(r.tasks.some(t=>/full quote total/.test(t.text)));
});
test('pending/query receipts and partial returns remain outstanding after client signs',()=>{
 const j={...job,materials:{items:[{id:'cable',name:'Cable',unit:'metres',kind:'material',issued:200,used:180,damaged:0,missing:0,checkedIssued:200,returnedGood:10,returnedDamaged:0}]}};
 const r=build({installations:[j],data:{jobs:[source],prospects:[contact],transactions:[tx,{...tx,id:'pending',status:'pending',amount:500000},{...tx,id:'query',status:'query',amount:200000}]}})[0];assert.equal(r.paid,2000000);assert.equal(r.pending,500000);assert.equal(r.returns[0].leftGood,10);assert.ok(r.tasks.some(t=>/leftover stock/.test(t.text)));assert.ok(r.tasks.some(t=>/sent back/.test(t.text)));
});
test('no care setup is invented; fixes and overdue agreed dates stay visible',()=>{
 const r=build({data:{jobs:[{...source,paymentSchedule:[{label:'First',amount:4000000,due:'2026-10-01'}]}],transactions:[tx]},installations:[{...job,status:'Needs correction',clientReview:{outcome:'fixes',issue:'Rear view blocked',nextAction:'Move camera'}}],today:'2026-10-24'})[0];assert.equal(r.signed,false);assert.equal(r.stage,'Fix needed');assert.ok(r.tasks.some(t=>t.text.includes('Move camera')));assert.ok(r.tasks.some(t=>t.text.includes('Monitoring')));assert.ok(r.schedule[0].overdue);assert.ok(r.tasks.some(t=>t.text.includes('date has passed')));
});
test('all office source jobs remain separate including standalone and cancelled jobs',()=>{
 const rows=build({data:{jobs:[source,{id:'standalone',business:'TEST School',stage:'Cancelled'}]},cases:[],installations:[]});assert.equal(rows.length,2);assert.equal(rows.find(r=>r.id==='standalone').stage,'Cancelled');assert.match(summaryCard(rows[1]),/cancelled/);
});
test('role guard denies Sales, Installer and Team Lead before reading or rendering finance',()=>{
 for(const role of ['sales','installer','teamlead',undefined]){assert.deepEqual(build({user:{role}}),[]);let fetches=0;const host={innerHTML:''};mountJobSummaries({host,user:{role},api:()=>{fetches++},isCurrent:()=>true});assert.equal(fetches,0);assert.match(host.innerHTML,/Operations access/);assert.doesNotMatch(host.innerHTML,/350,000/);}
});
test('untrusted client and fix text is escaped in rendered summaries',()=>{
 const r=build({data:{jobs:[{...source,business:'<script>alert(1)</script>'}]},cases:[],installations:[]})[0];const html=summaryCard(r);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
test('real handlers reconcile contact to approved installation without new records or privilege changes',async()=>{
 const f=await journeyFixture();await contactToPaid(f);await planAndAssign(f);await finish(f);
 const data=await f.workspace('operations'),cases=(await f.ok('ready','operations')).items,inst=(await f.ok('installer','operations')).jobs;
 const rows=buildJobSummaries({user,data,cases,installations:inst});assert.equal(rows.length,1);assert.equal(rows[0].paid,2000000);assert.equal(rows[0].approved,true);assert.equal(rows[0].returnsDue,false);assert.equal(rows[0].signed,false);assert.ok(rows[0].tasks.some(t=>t.text.includes('sign off together')));
 assert.equal((await f.api('installer','sales')).status,403);for(const role of ['teamlead','installer']){const safe=await f.ok('installer',role);assert.ok((safe.jobs||[]).every(j=>role==='installer'||!Object.keys(j.installerPay||{}).length));}
});

test('summary material link keeps its selected client while the material list loads',async()=>{
 const {mountMaterials}=await import('../materials-ui.mjs');const host={innerHTML:'',querySelector:()=>({addEventListener(){},disabled:false}),querySelectorAll:()=>[]};let resolve;const pending=new Promise(r=>resolve=r);
 const ctl=mountMaterials({host,initialSelected:{contactId:'c',sourceId:'q'},api:()=>pending,installerApi:async()=>({jobs:[]}),esc:s=>String(s||''),isCurrent:()=>true});
 resolve({items:[{contactId:'c',version:1,contact:{business:'TEST linked shop'},paidWork:[{id:'q',label:'TEST-Q'}],materialPlans:[{sourceId:'q',status:'All materials arrived',items:[]}]}]});await new Promise(r=>setImmediate(r));assert.match(host.innerHTML,/Back to paid jobs/);assert.match(host.innerHTML,/TEST linked shop/);assert.doesNotMatch(host.innerHTML,/Only clients with approved payments/);const previous=globalThis.document;globalThis.document={getElementById:()=>null};try{ctl.stop();}finally{globalThis.document=previous;}
});

test('one overpaid installer cannot hide another installer still owed money',()=>{const r=build({installations:[{...job,installerPayments:[{id:'a',installerId:'a',amount:250000},{id:'b',installerId:'b',amount:100000}],installerPaymentVoids:[]}]})[0];assert.equal(r.crewPaid,r.crewAgreed);assert.equal(r.crewBalance,50000);assert.equal(r.crewOverpaid,50000);assert.ok(r.tasks.some(t=>/above their agreed pay/.test(t.text)));assert.ok(r.tasks.some(t=>/left to pay/.test(t.text)));});
