import test from 'node:test';import assert from 'node:assert/strict';
import {projectReady} from '../netlify/functions/lib/ready-progress.mjs';
import '../commission.js';import '../sales-pay-policy.js';
const visit={id:'ready-visit-contact',date:'2026-10-22',time:'10:00',confirmedAt:'2026-10-22T07:00:00Z',byName:'Ops',byEmail:'ops@test'};
const base=()=>({prospects:[{id:'contact',business:'TEST',leadOnly:true,createdBy:'Test Sales',createdByEmail:'sales@test',stage:'New prospect'}],appointments:[],transactions:[],jobs:[],users:[{email:'sales@test',role:'sales',name:'Test Sales'}]});
const c={contactId:'contact',visit};
test('confirmation creates one linked visit without re-entering the contact; no visit pay before completion',()=>{
 const b=base(),d=projectReady(b,[c]),again=projectReady(d,[c]);assert.equal(d.prospects.length,1);assert.equal(d.prospects[0].leadOnly,false);assert.equal(d.prospects[0].createdByEmail,'sales@test');assert.equal(d.appointments[0].status,'Confirmed');assert.equal(again.appointments.length,1);assert.equal(b.appointments.length,0);assert.equal(globalThis.VeriskoSalesPay.calculate(d,globalThis.VeriskoSalesPay.period('2026-10-22T10:00:00Z')).total,0);
});
test('completion feeds existing pay once and projection restores visit fields after a stale save',()=>{
 const completed={...c,visit:{...visit,doneAt:'2026-10-22T12:00:00+03:00',doneByName:'Lead',doneByEmail:'lead@test'}},d=projectReady(base(),[completed]);d.appointments[0].visitResult='';d.appointments[0].date='2020-01-01';const restored=projectReady(d,[completed]);assert.equal(restored.appointments[0].date,'2026-10-22');assert.equal(restored.appointments[0].visitResult,'real');assert.equal(globalThis.VeriskoSalesPay.calculate(restored,globalThis.VeriskoSalesPay.period('2026-10-22T10:00:00Z')).total,15000);assert.equal(projectReady(restored,[completed]).appointments.length,1);
});
test('quote progress does not downgrade accepted jobs or create payment commission',()=>{
 const b=base();b.prospects[0].stage='Won';const d=projectReady(b,[{...c,quoteSent:{at:'2026-10-22T12:00:00+03:00'}}]);assert.equal(d.prospects[0].stage,'Won');assert.equal(d.prospects[0].readyProgress,'Quote sent');assert.equal(d.transactions.length,0);
});
