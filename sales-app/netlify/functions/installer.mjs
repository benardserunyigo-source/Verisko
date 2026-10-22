import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {createInstallerHandler} from './lib/installer-core.mjs';
export default async request=>createInstallerHandler({
 store:getStore({name:'verisko-installations',consistency:'strong'}),
 authorize:async req=>{
  const data=await getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'})||{users:[]};
  const who=await identify(req,data,{authStore:getStore(AUTH_STORE),supabaseUser,now:Date.now()});
  if(who.error||!who.me||idOverdue(who.me,Date.now()))return {status:who.status||403};
  return {me:who.me,users:data.users,sourceJobs:(data.jobs||[]).map(j=>{const p=(data.prospects||[]).find(p=>p.id===j.prospectId)||j;return {id:j.id,ref:j.ref||'',business:p.business||'',contact:p.contact||'',phone:p.phone||'',address:p.location||'',cameraCount:j.cameraCount||0,scheduledDate:j.scheduledDate||'',instructions:j.siteNotes||''};})};
 }
})(request);
