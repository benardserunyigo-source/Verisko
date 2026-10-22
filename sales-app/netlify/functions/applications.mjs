import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {createApplicationsHandler} from './lib/applications-core.mjs';
export default async request=>{
 const store=getStore({name:'verisko-applications',consistency:'strong'});
 return createApplicationsHandler({store,ip:req=>req.headers.get('x-nf-client-connection-ip')||'',authorize:async req=>{
  const data=await getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'})||{users:[]};
  const who=await identify(req,data,{authStore:getStore({name:AUTH_STORE,consistency:'strong'}),supabaseUser,now:Date.now()});
  return who.error||!who.me||idOverdue(who.me,Date.now())?null:{role:who.me.role,email:who.email};
 }})(request);
};
