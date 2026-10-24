import test from 'node:test';import assert from 'node:assert/strict';
import {contactInstallations,loadInstallationProgress,projectApprovedJobs} from '../netlify/functions/lib/installation-progress.mjs';
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
test('approved installation updates only its source job and preserves every commercial field',()=>{
 const original={id:'quote',prospectId:'client',stage:'Sent',quotedTotal:5280000,paymentPlan:'installments',paymentSchedule:[],fundingConfirmed:false,fundingApprovedBy:'',notes:'Keep this'};
 const approved={...base,status:'Completed'};
 const result=projectApprovedJobs([original,{...original,id:'other-quote'}],[approved]);
 assert.deepEqual(result[0],{...original,stage:'Installed'});assert.equal(original.stage,'Sent');assert.equal(result[1].stage,'Sent');
 assert.equal(projectApprovedJobs([original],[{...approved,contactId:'other-client'}])[0].stage,'Sent');
 assert.equal(projectApprovedJobs([original],[{...approved,sourceId:'',contactId:'client'}])[0].stage,'Sent');
});
test('pending or partly approved installations do not finish a job, and later/cancelled stages stay intact',()=>{
 for(const status of ['In progress','Submitted','Needs correction'])assert.equal(projectApprovedJobs([{id:'quote',stage:'Sent'}],[{...base,contactId:'',status}])[0].stage,'Sent');
 assert.equal(projectApprovedJobs([{id:'quote',stage:'Sent'}],[{...base,contactId:'',status:'Completed'},{...base,id:'second',contactId:'',status:'Submitted'}])[0].stage,'Sent');
 for(const stage of ['Handed over','Cancelled','Rejected'])assert.equal(projectApprovedJobs([{id:'quote',stage}],[{...base,contactId:'',status:'Completed'}])[0].stage,stage);
});
