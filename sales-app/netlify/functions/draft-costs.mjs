import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {inputs} from './lib/pricing-policy.mjs';
import {createDraftCostsHandler} from './lib/draft-costs-core.mjs';
export default async request=>{
 const loadWorkspace=()=>getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'}).then(x=>x||{jobs:[],users:[]});
 return createDraftCostsHandler({store:getStore({name:'verisko-draft-costs',consistency:'strong'}),loadWorkspace,baseline:inputs,authorize:async req=>{
  const data=await loadWorkspace(),who=await identify(req,data,{authStore:getStore({name:AUTH_STORE,consistency:'strong'}),supabaseUser,now:Date.now()});
  if(who.error||!who.me||idOverdue(who.me,Date.now()))return {status:who.status||403};return {me:who.me};
 }})(request);
};
