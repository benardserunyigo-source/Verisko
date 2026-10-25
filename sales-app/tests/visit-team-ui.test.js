import test from 'node:test';import assert from 'node:assert/strict';
import {requestCounts,requestActions,requestLabel,teamRequestCard} from '../visit-team-ui.mjs';
const ops={id:'ops',role:'operations'},lead={id:'lead',role:'teamlead'},base={contactId:'contact',state:'queued',ownerId:null,creatorId:'sales',contact:{business:'TEST Shop',contact:'TEST Sarah',phone:'0772111999',location:'Ntinda',createdBy:'TEST Sales'},history:[]},people=[{id:'ops'},{id:'lead'}];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
test('both visit-team roles get the same clear take, confirm and return steps',()=>{
 for(const user of [ops,lead]){assert.deepEqual(requestActions(base,user,people).primary,['take','Take contact']);const own={...base,ownerId:user.id};assert.deepEqual(requestActions(own,user,people).primary,['confirm_visit','Confirm visit']);assert.equal(requestActions(own,user,people).returnSales,true);assert.equal(requestActions({...own,state:'returned'},user,people).primary,null);}
});
test('a contact handled by someone else has no take, confirm or return action; Sales has none',()=>{
 for(const user of [ops,lead]){const c={...base,ownerId:user.id==='ops'?'lead':'ops'};assert.deepEqual(requestActions(c,user,people),{primary:null,returnSales:false,extra:[]});}
 assert.equal(requestActions(base,{id:'sales',role:'sales'}).primary,null);
});
test('later quote and payment steps remain available after the visit; received money prevents return to Sales',()=>{
 const c={...base,ownerId:'ops',visit:{date:'2026-10-26',time:'10:00'}};assert.equal(requestActions(c,ops,people).primary[0],'complete_visit');assert.ok(requestActions(c,ops,people).extra.some(a=>a[0]==='reschedule_visit'));
 c.visit.doneAt='date';assert.equal(requestActions(c,ops,people).primary[0],'quote_sent');c.quoteSent={};assert.equal(requestActions(c,ops,people).primary[0],'record_payment');c.firstPayment={status:'pending'};assert.equal(requestActions(c,ops,people).returnSales,false);
 c.firstPayment={status:'query'};assert.equal(requestActions(c,ops,people).primary[0],'record_payment');
});
test('count cards exclude returned contacts from new requests and With me, without claiming someone else’s contacts',()=>{
 assert.deepEqual(requestCounts([base,{...base,ownerId:'ops'},{...base,ownerId:'lead'},{...base,ownerId:null,state:'returned'},{...base,ownerId:'ops',state:'returned'}],ops),{new:1,mine:1});
});
test('a held visit clearly needs confirmation; closed handover status is retained',()=>{
 assert.equal(requestLabel({...base,ownerId:'ops',visit:{onHoldAt:'date'}}),'Arrange a visit');assert.equal(requestActions({...base,ownerId:'ops',visit:{onHoldAt:'date'}},ops,people).primary[0],'confirm_visit');assert.equal(requestLabel({...base,installationProgress:[{stage:'Client signed off'}]}),'Client signed off');
});
test('the next action is visible; later steps and private-office detail are collapsed and contact notes are escaped',()=>{
 const html=teamRequestCard({c:{...base,ownerId:'ops',ownerName:'TEST Ops',context:'<script>bad</script>'},user:ops,people,esc,progressHtml:'TEST_PROGRESS',paymentHtml:'TEST_PAYMENT'});
 assert.ok(html.indexOf('Confirm visit')<html.indexOf('<details'));assert.ok(html.indexOf('Send back to Sales')<html.indexOf('<details'));assert.ok(html.indexOf('TEST_PROGRESS')>html.indexOf('<details'));assert.ok(html.indexOf('Give to someone else')>html.indexOf('<details'));assert.ok(!html.includes('<script>'));assert.match(html,/TEST Sales/);assert.match(html,/Ntinda/);
});

test('completed visits link to the same client quote without opening pricing to other roles',async()=>{
 const {readyQuoteAction}=await import('../visit-team-ui.mjs');const c={...base,ownerId:ops.id,visit:{doneAt:'2026-10-25T10:00:00Z'},quoteJobs:[]};
 assert.equal(readyQuoteAction(c,ops).label,'Create quote');
 c.quoteJobs=[{id:'same-client-quote',ref:'TEST-001',stage:'Draft'}];assert.equal(readyQuoteAction(c,ops).label,'Open quote');assert.equal(readyQuoteAction(c,ops).jobs[0].id,'same-client-quote');
 c.quoteJobs.push({id:'revised-quote',stage:'Sent'});assert.equal(readyQuoteAction(c,ops).label,'Choose quote');
 for(const role of ['sales','teamlead','installer'])assert.equal(readyQuoteAction(c,{id:ops.id,role}),null);
 assert.equal(readyQuoteAction({...c,ownerId:'another'},ops),null);assert.equal(readyQuoteAction({...c,state:'returned'},ops),null);assert.equal(readyQuoteAction({...c,visit:{}},ops),null);
});
