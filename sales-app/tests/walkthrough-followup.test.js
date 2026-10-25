import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {journeyFixture} from './helpers/journey-fixture.mjs';import {contactToPaid} from './helpers/journey-steps.mjs';
test('quote links include this client Draft jobs for Operations only and never expose costs to Sales or Team Lead',async()=>{
 const f=await journeyFixture();await contactToPaid(f);const raw=await f.raw();raw.jobs.push({id:'draft-same',ref:'TEST-DRAFT',stage:'Draft',prospectId:'journey-client',cameraCount:4,directCost:123456},{id:'draft-other',stage:'Draft',prospectId:'other-client',directCost:654321});await f.main.setJSON('app-data',raw);
 const ops=(await f.ok('ready','operations')).items[0];assert.ok(ops.quoteJobs.some(j=>j.id==='draft-same'));assert.ok(!ops.quoteJobs.some(j=>j.id==='draft-other'));assert.doesNotMatch(JSON.stringify(ops.quoteJobs),/directCost|123456|654321/);
 for(const role of ['sales','teamlead'])assert.equal((await f.ok('ready',role)).items[0].quoteJobs,undefined);
});
test('public application describes the current approved Monday pay, completed visits and useful video prompts',()=>{
 const s=fs.readFileSync(new URL('../apply.html',import.meta.url),'utf8');assert.match(s,/UGX 15,000/);assert.match(s,/UGX 50,000/);assert.match(s,/3 different clients/);assert.match(s,/UGX 100,000/);assert.match(s,/first payment is approved/);assert.match(s,/Monday/);assert.match(s,/Bookings alone do not earn visit pay/);assert.doesNotMatch(s,/UGX 70,000|UGX 30,000|every Friday|booking above 3/);assert.match(s,/Any sales work you have done/);assert.match(s,/what you do now/);
});
