import test from 'node:test';import assert from 'node:assert/strict';
import {journeyFixture} from './helpers/journey-fixture.mjs';import {contactToPaid} from './helpers/journey-steps.mjs';
import {buildJobSummaries} from '../job-summary.mjs';import {starterMaterials} from '../materials-starter.mjs';import {latestAssessmentTime} from '../visit-assessment.mjs';import {paidWork} from '../netlify/functions/lib/materials-core.mjs';
test('pending or queried first receipt cannot advertise materials; approved job can',()=>{
 for(const status of ['pending','query','approved']){const rows=buildJobSummaries({user:{role:'operations'},data:{jobs:[{id:'q',prospectId:'c',stage:'Sent',quotedTotal:100}],prospects:[{id:'c'}],transactions:[{id:'pay',direction:'in',prospectId:'c',installId:'q',amount:40,status}]},cases:[{contactId:'c',visit:{doneAt:'2026-10-25'},quoteSent:{sourceId:'q'}}]});assert.equal(rows[0].tasks.some(t=>t.text.startsWith('Plan materials')),status==='approved');}
});
test('confirming a sent app draft links it once and projects Sent without changing price',async()=>{
 const f=await journeyFixture();await contactToPaid(f);let c=await f.ready.get('cases/journey-client');delete c.quoteSent;delete c.firstPayment;await f.ready.setJSON('cases/journey-client',c);const d=await f.raw();d.jobs[0].stage='Draft';await f.main.setJSON('app-data',d);
 let r=await f.readyCmd('operations','quote_sent',{date:f.day(),requestId:'draft-sent-once'});assert.equal(r.status,200);assert.equal(r.item.quoteSent.sourceId,'journey-quote');assert.equal(r.item.availableQuotes.length,1);
 const before=r.item.version;r=await f.readyCmd('operations','quote_sent',{date:f.day(),requestId:'draft-sent-once',baseVersion:c.version});assert.equal(r.status,200);assert.equal(r.item.version,before);assert.equal((await f.workspace('operations')).jobs[0].stage,'Sent');assert.deepEqual((await f.raw()).jobs[0],d.jobs[0]);
});
test('legacy blank quote link can be corrected explicitly; linked and other-client quotes stay protected',async()=>{
 const f=await journeyFixture();await contactToPaid(f);const c=await f.ready.get('cases/journey-client');c.quoteSent.sourceId='';c.quoteSent.reference='External';await f.ready.setJSON('cases/journey-client',c);const money=structuredClone(c.firstPayment);
 let r=await f.readyCmd('operations','quote_sent',{date:f.day(),quoteId:'someone-elses-quote'});assert.equal(r.status,400);
 r=await f.readyCmd('operations','quote_sent',{date:f.day(),quoteId:'journey-quote'});assert.equal(r.status,200);assert.equal(r.item.quoteSent.sourceId,'journey-quote');assert.equal(r.item.quoteSent.at,c.quoteSent.at);assert.deepEqual((await f.ready.get('cases/journey-client')).firstPayment,money);
 assert.equal((await f.readyCmd('operations','quote_sent',{date:f.day(),quoteId:'journey-quote'})).status,409);
});
test('paid work passes quote quantities to a reviewable starter without inventing camera models',()=>{
 const w=paidWork({id:'c'},[{id:'p',prospectId:'c',installId:'q',direction:'in',status:'approved',amount:40}],[{id:'q',prospectId:'c',cameraCount:6,quoteSnapshot:{cableMetres:320}}])[0];assert.equal(w.cameraCount,6);const rows=starterMaterials(w);assert.equal(rows[0].planned,6);assert.equal(rows[0].name,undefined);assert.equal(rows[1].planned,320);assert.equal(rows[1].source,'Uganda');for(const n of[4,6,8,12])assert.equal(starterMaterials({cameraCount:n})[1].planned,n*50);assert.deepEqual(starterMaterials({}),[{}]);
});
test('assessment defaults reuse only this staff member’s latest saved finish on this contact',()=>{
 const sessions=[{userId:'ops',contactId:'c',finish:{at:'2026-10-25T22:15:00Z'}},{userId:'other',contactId:'c',finish:{at:'2026-10-26T00:00:00Z'}},{userId:'ops',contactId:'different',finish:{at:'2026-10-26T00:00:00Z'}}];assert.deepEqual(latestAssessmentTime(sessions,'ops','c'),{date:'2026-10-26',time:'01:15'});assert.equal(latestAssessmentTime(sessions,'sales','c'),null);
});
