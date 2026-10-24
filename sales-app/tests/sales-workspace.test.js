import test from 'node:test';import assert from 'node:assert/strict';
import '../sales-workspace.js';
const S=globalThis.VeriskoSalesWorkspace,user={id:'sales',role:'sales',email:'sales@test'},contact={id:'one',business:'TEST Shop',phone:'0772000001',createdByEmail:'sales@test',leadOnly:true,nextAction:'Call before going'};
test('a saved contact sends in one request using the same ID and saved note, with no extra form',async()=>{
 const calls=[];const item=await S.sendContact({api:async(method,body)=>{calls.push({method,body});return {item:{contactId:body.contactId,state:'queued'}};},user,contact,requestId:'once-only-id'});
 assert.equal(item.contactId,contact.id);assert.deepEqual(calls,[{method:'POST',body:{action:'request',contactId:'one',baseVersion:0,requestId:'once-only-id',note:'Call before going'}}]);
});
test('only own unsent or returned contacts offer send; returned converted contacts reuse the current version',async()=>{
 assert.equal(S.canSend(contact,{state:'queued'},user),false);assert.equal(S.canSend(contact,null,{email:'other@test'}),false);
 const converted={...contact,leadOnly:false};assert.equal(S.canSend(converted,null,user),false);assert.equal(S.canSend(converted,{state:'returned'},user),true);
 let body;await S.sendContact({api:async(m,b)=>{body=b;return {item:b};},user,contact:converted,item:{state:'returned',version:6},requestId:'same-contact-again'});assert.equal(body.baseVersion,6);assert.equal(body.contactId,'one');
});
test('returned reason overrides earlier visit/quote labels without deleting progress',()=>{
 const c={state:'returned',visit:{doneAt:'date'},quoteSent:{},history:[{type:'returned_to_sales',note:'Please call next month'}]};assert.equal(S.progress(c),'Needs your follow-up');assert.equal(S.returnReason(c),'Please call next month');assert.equal(S.returnReason({...c,state:'queued'}),'');
});
test('contact card keeps send visible outside details, safely escapes notes and prevents duplicate tapping',()=>{
 const esc=s=>String(s||'').replaceAll('<','&lt;').replaceAll('>','&gt;');const html=S.contactCard({p:contact,c:{state:'returned',history:[{type:'returned_to_sales',note:'<script>bad</script>'}]},user,esc,call:'',voice:'',dateLabel:s=>s,sending:true});
 assert.ok(html.indexOf('data-lead-send')<html.indexOf('<details>'));assert.match(html,/Sending…/);assert.match(html,/disabled/);assert.ok(!html.includes('<script>'));assert.match(html,/Why it came back/);
});
test('account changes and already-sent contacts never start a new request',async()=>{
 let calls=0;const api=()=>{calls++;};await assert.rejects(S.sendContact({api,user,contact,isCurrent:()=>false}),/Sign in/);await assert.rejects(S.sendContact({api,user,contact,item:{state:'assigned'}}),/already sent/);assert.equal(calls,0);
});
