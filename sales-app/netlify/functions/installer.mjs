import {loadClientPlans,projectClientPlans} from './lib/client-plan-job.mjs';
import {loadReadyCases} from './lib/ready-progress.mjs';
import {readyInstallationSources} from './lib/materials-assignment.mjs';
import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {createInstallerHandler} from './lib/installer-core.mjs';
export default async request=>createInstallerHandler({
 store:getStore({name:'verisko-installations',consistency:'strong'}),
 authorize:async req=>{
  const raw=await getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'})||{users:[]};
 const data=projectClientPlans(raw,await loadClientPlans(getStore({name:'verisko-client-plans',consistency:'strong'})));
  const who=await identify(req,data,{authStore:getStore({name:AUTH_STORE,consistency:'strong'}),supabaseUser,now:Date.now()});
  if(who.error||!who.me||idOverdue(who.me,Date.now()))return {status:who.status||403};
  const ops=['admin','operations'].includes(who.me.role);
  const readySources=ops?readyInstallationSources(data,await loadReadyCases(getStore({name:'verisko-ready-cases',consistency:'strong'}))):[];
  return {me:who.me,users:data.users,readySources,sourceJobs:(data.jobs||[]).map(j=>{const p=(data.prospects||[]).find(p=>p.id===j.prospectId)||j;return {id:j.id,ref:j.ref||'',business:p.business||'',clientName:p.contact||'',address:p.location||'',cameraCount:j.cameraCount||0,scheduledDate:j.scheduledDate||'',instructions:j.siteNotes||'',servicePolicyVersion:j.servicePolicyVersion||'',serviceStartDate:j.serviceStartDate||'',monitoringMiniPcRef:j.monitoringMiniPcRef||'',monitoringTestEvidence:j.monitoringTestEvidence||'',monitoringCommissioned:!!j.monitoringCommissioned};})};
 }
})(request);
