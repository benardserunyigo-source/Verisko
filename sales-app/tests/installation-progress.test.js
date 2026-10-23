import test from 'node:test';import assert from 'node:assert/strict';
import {contactInstallations,loadInstallationProgress} from '../netlify/functions/lib/installation-progress.mjs';
import {FieldMemoryStore} from './helpers/field-fixture.mjs';
const jobs=[{id:'quote',prospectId:'client',ref:'TEST-Q-1'}],base={id:'site',sourceId:'quote',contactId:'client',status:'In progress',assignmentStatus:'accepted',scheduledDate:'2026-10-23',updatedAt:'2026-10-23T10:00:00Z'};
test('every installation stage gives Sales a small, accurate status without private details',async()=>{
 const states=[[{assignmentStatus:'pending'},'Waiting for installer reply'],[{assignmentStatus:'declined'},'Installer declined'],[{},'Installer assigned'],[{workStarted:true},'Installation in progress'],[{status:'Submitted'},'Waiting for installation approval'],[{status:'Needs correction'},'Installation needs fixing'],[{status:'Completed'},'Installation approved']];
 for(const [patch,label]of states){const out=contactInstallations('client',jobs,[{...base,...patch,installerPay:'PRIVATE PAY',evidence:'PRIVATE PHOTOS',location:'PRIVATE GPS'}]);assert.equal(out[0].stage,label);assert.ok(!JSON.stringify(out).includes('PRIVATE'));assert.equal(contactInstallations('other',jobs,[{...base,...patch}]).length,0);}
 const store=new FieldMemoryStore();await store.setJSON('jobs/site',{...base,readyContactId:'client',assignment:{status:'accepted'},workLog:[{location:'PRIVATE GPS'}],installerPay:'PRIVATE PAY'});const loaded=await loadInstallationProgress(store);assert.equal(loaded[0].workStarted,true);assert.ok(!JSON.stringify(loaded).includes('PRIVATE'));
});
test('legacy source-linked installations work; several jobs keep distinct status rows',()=>{
 const legacy={...base,contactId:'',status:'Completed'};assert.equal(contactInstallations('client',jobs,[legacy])[0].label,'TEST-Q-1');assert.equal(contactInstallations('other',jobs,[legacy]).length,0);
 assert.equal(contactInstallations('client',jobs,[base,{...base,id:'second',status:'Submitted'}]).length,2);
});
