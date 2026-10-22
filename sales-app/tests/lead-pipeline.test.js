import test from 'node:test';import assert from 'node:assert/strict';
import '../lead-pipeline.js';import {scopeForTeamLead,mergeTeamLeadWrite} from '../netlify/functions/scope.mjs';
const L=globalThis.VeriskoLeadPipeline;
const rep={email:'rep@test',role:'sales',name:'Rep'},manager={email:'lead@test',role:'teamlead',name:'Team lead'},ops={email:'ops@test',role:'operations',name:'Operations'},owner={email:'owner@test',role:'admin'};
const draft=()=>({id:'lead-1',leadOnly:true,business:'TEST Shop',phone:'+256 772 111 222',createdByEmail:rep.email,notes:'Call when ready',followUps:[{at:'2026-10-21',note:'Interested next month'}],stage:'New prospect',reviewStatus:'draft'});
const now='2026-10-22T10:00:00Z';
function send(p,target,actor=rep){return L.guard([p],[{...p,handoffTo:target,handoffAt:now,handoffNote:'Ready for a call'}],actor,[],[],now)[0];}
test('saving a contact needs no GPS, qualification or booking and cannot self-approve',()=>{const p=L.guard([],[{...draft(),reviewStatus:'approved',qualStatus:'approved',closedSale:true}],rep)[0];assert.equal(p.reviewStatus,'draft');assert.equal(p.qualStatus,'');assert.equal(p.closedSale,false);assert.equal(p.geo,undefined);assert.equal(p.handoffAt,undefined);});
test('Operations automatically sees prospecting contacts; other reps and Team leads do not',()=>{const p=draft();assert.equal(L.canSee(p,rep),true);assert.equal(L.canSee(p,owner),true);assert.equal(L.canSee(p,ops),true);assert.equal(L.canSee(p,manager),false);assert.equal(L.canSee(p,{...rep,email:'other@test'}),false);});
test('an older Operations save cannot drop other salespeople saved contacts',()=>{const p=draft();assert.deepEqual(L.guard([p],[],ops),[p]);assert.deepEqual(L.guard([p],[{...p,notes:'unauthorized'}],{...rep,email:'other@test'}),[p]);});
test('sending to Operations flags readiness on the same contact and stamps its sender',()=>{const p=send(draft(),'operations');assert.equal(p.id,'lead-1');assert.equal(L.canSee(p,ops),true);assert.equal(L.canSee(p,manager),false);assert.equal(p.handoffByEmail,rep.email);assert.deepEqual(p.followUps,draft().followUps);assert.equal(L.routed(p,ops),true);assert.equal(p.leadOnly,true);});
test('new handovers cannot be addressed to Team lead',()=>{assert.throws(()=>send(draft(),'manager'),/Operations only/);});
test('old Team lead handovers are visible to Operations and normalize without losing history or inventing a new sender',()=>{const p={...draft(),handoffTo:'manager',handoffAt:now,handoffBy:rep.name,handoffByEmail:rep.email};assert.equal(L.canSee(p,ops),true);assert.equal(L.routed(p,ops),true);const out=L.guard([p],[p],ops)[0];assert.equal(out.handoffTo,'operations');assert.equal(out.phone,p.phone);assert.deepEqual(out.followUps,p.followUps);assert.equal(out.notes,p.notes);assert.equal(out.handoffAt,p.handoffAt);assert.equal(out.handoffByEmail,rep.email);});
test('only the receiving team can explicitly move a saved contact to Prospects',()=>{const p=send(draft(),'operations'),request={...p,leadOnly:false,leadConvertedAt:now};assert.equal(L.guard([p],[request],rep)[0].leadOnly,true);const out=L.guard([p],[request],ops)[0];assert.equal(out.leadOnly,false);assert.equal(out.id,p.id);assert.equal(out.reviewStatus,'pending');assert.equal(out.phone,p.phone);});
test('a stale salesperson draft cannot undo a handover or turn an active prospect back into a saved lead',()=>{const p=send(draft(),'operations');assert.equal(L.guard([p],[draft()],rep)[0].handoffTo,'operations');const active={...p,leadOnly:false,leadConvertedAt:now,stage:'Appointment proposed',reviewStatus:'approved'};const out=L.guard([active],[draft()],rep)[0];assert.equal(out.leadOnly,false);assert.equal(out.stage,'Appointment proposed');});
test('a saved lead cannot create a site booking or quote before explicit conversion',()=>{assert.throws(()=>L.guard([draft()],[draft()],rep,[{prospectId:'lead-1'}]),/Move the saved lead/);assert.throws(()=>L.guard([draft()],[draft()],ops,[],[{prospectId:'lead-1'}]),/Move the saved lead/);});
test('duplicate phones, including other reps and two contacts in the same save, are rejected without exposing their details',()=>{const existing={...draft(),id:'other',createdByEmail:'other@test',business:'PRIVATE CLIENT'};assert.throws(()=>L.guard([existing],[draft()],rep),e=>!e.message.includes('PRIVATE')&&/already recorded/.test(e.message));assert.throws(()=>L.guard([],[draft(),{...draft(),id:'lead-2'}],rep),/already recorded/);assert.match(L.check({...draft(),phone:'0772111222'},[draft()],'new'),/already saved/);});
test('Team leads see their own saved contacts but no longer receive other reps saved-contact handovers',()=>{const a=draft(),b={...draft(),id:'old-sent',handoffTo:'manager',handoffAt:now},c={...draft(),id:'mine',createdByEmail:manager.email};const data={prospects:[a,b,c],users:[rep,manager,ops]};assert.deepEqual(scopeForTeamLead(data,manager.email).prospects.map(p=>p.id),['mine']);});
test('Operations can view and manage prospecting contacts without receiving or accepting a handover',()=>{const p=draft();assert.equal(L.canManage(p,ops),true);assert.equal(L.routed(p,ops),false);const out=L.guard([p],[{...p,leadOnly:false,leadConvertedAt:now}],ops)[0];assert.equal(out.id,p.id);assert.equal(out.leadOnly,false);});
test('existing visit-ready prospects retain their stages and review state',()=>{const p={id:'legacy',business:'TEST Existing',stage:'Quoted',reviewStatus:'approved'};assert.deepEqual(L.guard([p],[p],ops),[p]);});

test('editing a handed-over contact cannot change ownership or forge the recorded sender',()=>{const p=send(draft(),'operations');const out=L.guard([p],[{...p,createdByEmail:ops.email,handoffBy:'Someone else',handoffByEmail:ops.email}],rep)[0];assert.equal(out.createdByEmail,rep.email);assert.equal(out.handoffByEmail,rep.email);assert.equal(out.handoffBy,rep.name);});

test('last follow-up uses recorded time when an older offline note arrives later',()=>{const newest={at:'2026-10-21T09:15:00Z',by:'Rep',note:'Client asked for a call on Friday'};const p={followUps:[newest,{at:'2026-10-19T09:15:00Z',note:'Older offline note'}]};assert.equal(L.latestFollowUp(p),newest);assert.equal(p.followUps[0],newest);});
test('missing or invalid follow-up times are not displayed as a recent conversation',()=>{assert.equal(L.latestFollowUp({}),null);assert.equal(L.latestFollowUp({followUps:[{at:'invalid',note:'No valid time'}]}),null);});

test('follow-up filtering separates today, overdue, future and unscheduled contacts',()=>{const today='2026-10-22';assert.equal(L.followUpBucket({followUp:today},today),'today');assert.equal(L.followUpBucket({followUp:'2026-10-21'},today),'overdue');assert.equal(L.followUpBucket({followUp:'2026-10-23'},today),'upcoming');assert.equal(L.followUpBucket({},today),'unscheduled');assert.equal(L.matchesFilters({}, {due:'overdue',today}),false);});
test('salesperson and due filters combine without merging people with the same name',()=>{const p={createdBy:'Sam',createdByEmail:'ABRAHAM@test',followUp:'2026-10-21'},filter={owner:'abraham@test',due:'overdue',today:'2026-10-22'};assert.equal(L.matchesFilters(p,filter),true);assert.equal(L.matchesFilters({...p,createdByEmail:'other@test'},filter),false);assert.equal(L.matchesFilters({...p,followUp:'2026-10-22'},filter),false);});
test('today switches at Uganda midnight even when UTC and the viewer are still on yesterday',()=>{assert.equal(L.kampalaDay('2026-10-21T20:59:59Z'),'2026-10-21');assert.equal(L.kampalaDay('2026-10-21T21:00:00Z'),'2026-10-22');});


test('sales summary credits conversations to their actor, counts current contacts by creator and retains zero-activity salespeople',()=>{
 const other={email:'other@test',name:'Other',role:'sales'},idle={email:'idle@test',name:'Idle',role:'sales'};
 const note={at:now,byEmail:other.email,by:other.name,note:'Called'};
 const records=[{...draft(),createdBy:rep.name,followUp:'2026-10-22',followUps:[note,{...note},{at:now,byEmail:ops.email,note:'Operations called'},{at:'bad',byEmail:rep.email}]},
  {...draft(),id:'two',followUp:'2026-10-21',followUps:[{at:now,byEmail:'REP@test',note:'Followed up'}]},
  {...draft(),id:'converted',leadOnly:false,leadConvertedAt:now,followUps:[note]}];
 const rows=L.salespersonSummary(records,[rep,other,idle,ops],'2026-10-22');
 assert.deepEqual(rows.find(r=>r.key===rep.email),{key:rep.email,name:rep.name,contacts:2,followUps:1,today:1,overdue:1});
 assert.equal(rows.find(r=>r.key===other.email).followUps,1);
 assert.equal(rows.find(r=>r.key===idle.email).contacts,0);
 assert.equal(rows.some(r=>r.key===ops.email),false);
});
test('sales summary retains former creators and resolves legacy actor names without guessing between identical names',()=>{
 const records=[{...draft(),createdBy:'Former',createdByEmail:'former@test',followUps:[{at:now,by:'Former',note:'Called'}]}];
 const row=L.salespersonSummary(records,[], '2026-10-22')[0];assert.equal(row.followUps,1);assert.equal(row.contacts,1);
 const rows=L.salespersonSummary([{...draft(),followUps:[{at:now,by:'Sam',note:'Called'}]}],[{name:'Sam',email:'one@test',role:'sales'},{name:'Sam',email:'two@test',role:'sales'}]);
 assert.equal(rows.find(r=>r.key==='one@test').followUps,0);assert.equal(rows.find(r=>r.key==='two@test').followUps,0);
});
