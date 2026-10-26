import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyFixture} from './helpers/journey-fixture.mjs';
import {contactToPaid,planAndAssign,finish} from './helpers/journey-steps.mjs';
import {salesPaySources,materialPaySources} from '../netlify/functions/lib/operations-cash.mjs';
import {buildOperationsSummary} from '../operations-summary.mjs';
const good=r=>{assert.equal(r.status,200,r.error);return r;};
test('regular expense correction returns the same entry to review and counts only once after approval',async()=>{
 const f=await journeyFixture();
 good(await f.save('operations',d=>d.transactions.push({id:'manual-expense',direction:'out',amount:25000,category:'Transport',date:'2026-10-26',proofId:'demo-receipt',status:'pending'})));
 good(await f.save('admin',d=>Object.assign(d.transactions[0],{status:'query',reviewNote:'Add the route and reason'})));
 good(await f.save('operations',d=>Object.assign(d.transactions[0],{status:'pending',note:'DEMO Ntinda to site, cable repair'})));
 let d=await f.workspace('admin');assert.equal(d.transactions[0].status,'pending');assert.equal(d.transactions[0].reviewNote,'Add the route and reason');assert.equal(d.transactions.length,1);
 good(await f.save('operations',d=>d.transactions[0].status='approved'));
 d=await f.workspace('admin');assert.equal(d.transactions[0].status,'approved');assert.equal(d.transactions[0].reviewNote,'');assert.equal(d.transactions.length,1);
 good(await f.save('operations',d=>{d.transactions[0].amount=1;d.transactions[0].status='pending';}));assert.equal((await f.workspace('admin')).transactions[0].amount,25000);assert.equal((await f.workspace('admin')).transactions[0].status,'approved');
});
test('cash flow journey joins funds, client money, payroll, supplier, crew and callback without duplicate accounting',async()=>{
 const f=await journeyFixture();f.setTime('2026-10-19T10:00:00Z');await contactToPaid(f);await planAndAssign(f);const installed=await finish(f);f.setTime('2026-10-26T10:00:00Z');
 good(await f.save('operations',d=>d.fundRequests=[{id:'demo-fund',amount:500000,reason:'DEMO office float',status:'requested'}]));
 const before=(await f.workspace('admin')).transactions.length;good(await f.save('admin',d=>d.fundRequests[0].status='approved'));assert.equal((await f.workspace('admin')).transactions.length,before);
 good(await f.save('operations',d=>d.transactions.push({id:'fund-receipt',financeKey:'fund-demo-fund',financeKind:'fund',fundRequestId:'demo-fund',amount:500000,direction:'in',category:'Owner funding',reference:'DEMO-FUND-REF',date:'2026-10-26',status:'pending'})));
 good(await f.save('operations',d=>d.transactions.find(t=>t.id==='fund-receipt').status='approved'));assert.equal((await f.workspace('admin')).transactions.find(t=>t.id==='fund-receipt').status,'pending');
 good(await f.save('admin',d=>d.transactions.find(t=>t.id==='fund-receipt').status='approved'));
 const ds=await f.workspace('admin'),src=salesPaySources(ds,'2026-10-19')[0];assert.equal(src.amount,115000);
 good(await f.save('operations',d=>d.transactions.push({id:'sales-pay',financeKey:src.key,financeKind:'sales',salesPayEmail:src.email,payWeek:src.week,amount:src.amount,direction:'out',category:'Sales pay',date:'2026-10-26',status:'pending',proofId:'demo-pay-proof'})));
 const cases=(await f.ok('ready','operations')).items,mat=materialPaySources(cases)[0];
 good(await f.save('operations',d=>d.transactions.push({id:'material-pay',financeKey:mat.key,financeKind:'material',installId:mat.sourceId,amount:150000,direction:'out',category:'Materials payment',date:'2026-10-26',status:'pending',proofId:'demo-mat-proof'})));
 good(await f.save('operations',d=>{for(const t of d.transactions.filter(t=>['sales-pay','material-pay'].includes(t.id)))t.status='approved';}));assert.ok((await f.workspace('admin')).transactions.filter(t=>['sales-pay','material-pay'].includes(t.id)).every(t=>t.status==='pending'));
 good(await f.save('admin',d=>Object.assign(d.transactions.find(t=>t.id==='material-pay'),{status:'query',reviewNote:'Add delivery breakdown'})));
 good(await f.save('operations',d=>Object.assign(d.transactions.find(t=>t.id==='material-pay'),{status:'pending',note:'DEMO materials100K plus delivery50K'})));
 good(await f.save('admin',d=>{for(const t of d.transactions.filter(t=>['sales-pay','material-pay'].includes(t.id)))t.status='approved';}));
 const j=await f.install.get('jobs/'+installed.id);j.installerPayments=[{id:'crew-payment',installerId:'installer',amount:350000,paidOn:'2026-10-26',method:'Cash',reference:'DEMO-CREW',by:'operations',at:f.now()}];await f.install.setJSON('jobs/'+j.id,j);
 const cb={id:'demo-callback',jobId:j.id,sourceId:j.sourceId,business:'DEMO Shop',assigneeId:'installer',status:'Closed',expenses:[{id:'demo-expense',amount:20000,date:'2026-10-26',note:'DEMO transport',proofId:'demo-cb-proof',by:'operations',at:f.now()}],photos:[{id:'demo-cb-proof',kind:'receipt'}],history:[],requests:[],version:1};await f.storeFor('verisko-callbacks').setJSON('cases/'+cb.id,cb);
 good(await f.save('operations',d=>{for(const t of d.transactions){if(t.installerPaymentKey){t.proofId='demo-crew-proof';t.status='approved';}if(t.callbackExpenseKey)t.status='approved';}}));
 let d=await f.workspace('admin');assert.equal(d.transactions.find(t=>t.installerPaymentKey).status,'pending');assert.equal(d.transactions.find(t=>t.callbackExpenseKey).status,'approved');good(await f.save('admin',d=>d.transactions.find(t=>t.installerPaymentKey).status='approved'));
 // Later client receipt never creates another first-payment commission.
 good(await f.save('operations',d=>d.transactions.push({id:'later-client',installId:'journey-quote',prospectId:'journey-client',direction:'in',category:'Customer payment',amount:1000000,date:'2026-10-26',status:'pending',reference:'DEMO-CLIENT-2'})));good(await f.save('admin',d=>d.transactions.find(t=>t.id==='later-client').status='approved'));
 for(let n=0;n<3;n++){d=await f.workspace('operations');const s=buildOperationsSummary({user:{role:'operations'},data:d,callbacks:[cb]});assert.equal(s.fundsReceived,500000);assert.equal(s.otherReceived,3000000);assert.equal(s.spent,635000);assert.equal(s.balance,2865000);assert.equal(s.rows.length,7);assert.equal(s.costs.sales,115000);assert.equal(s.costs.materials,150000);assert.equal(s.costs.installer,350000);assert.equal(s.costs.callbacks,20000);assert.equal(s.pending,0);assert.equal(salesPaySources(d,'2026-10-19')[0].amount,115000);}
 assert.equal((await f.workspace('sales')).salesPayReceipts.length,1);assert.equal((await f.workspace('other-sales')).salesPayReceipts.length,0);
 for(const role of ['sales','teamlead','installer']){const scoped=await f.workspace(role);assert.equal(scoped.transactions.some(t=>t.financeKey||t.callbackExpenseKey||t.installerPaymentKey),false);}
 const duplicate={...d.transactions.find(t=>t.id==='material-pay'),id:'duplicate-material'};assert.equal((await f.save('operations',d=>d.transactions.push(duplicate))).status,409);assert.equal((await f.workspace('admin')).transactions.length,7);
});
