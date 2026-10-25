import {loadClientPlans,projectClientPlans} from './lib/client-plan-job.mjs';
import {loadInstallationProgress} from './lib/installation-progress.mjs';
import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {createReadyHandler} from './lib/ready-leads-core.mjs';
export default async request=>createReadyHandler({store:getStore({name:'verisko-ready-cases',consistency:'strong'}),authorize:async req=>{
 const raw=await getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'})||{users:[]};
 const data=projectClientPlans(raw,await loadClientPlans(getStore({name:'verisko-client-plans',consistency:'strong'})));
 const who=await identify(req,data,{authStore:getStore({name:AUTH_STORE,consistency:'strong'}),supabaseUser,now:Date.now()});
 if(who.error||!who.me||idOverdue(who.me,Date.now()))return {status:who.status||403};
 const installationProgress=await loadInstallationProgress(getStore({name:'verisko-installations',consistency:'strong'}));
 const materialLocks=installationProgress.filter(j=>j.contactId&&j.assignmentStatus&&j.assignmentStatus!=='declined').map(j=>({contactId:j.contactId,sourceId:j.materialSourceId}));
 return {installationProgress,materialLocks,me:who.me,users:data.users,prospects:data.prospects||[],appointments:data.appointments||[],transactions:data.transactions||[],jobs:data.jobs||[]};
}})(request);
