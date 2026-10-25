import {inputs,pricing} from './lib/pricing-policy.mjs';
import {createDraftCostsHandler} from './lib/draft-costs-core.mjs';
import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {createClientPlanHandler} from './lib/client-plan-core.mjs';
export default async request=>{
 const loadWorkspace=()=>getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'}).then(x=>x||{jobs:[],users:[]});
 const authorize=async req=>{
  const data=await loadWorkspace(),who=await identify(req,data,{authStore:getStore({name:AUTH_STORE,consistency:'strong'}),supabaseUser,now:Date.now()});
  if(who.error||!who.me||idOverdue(who.me,Date.now()))return {status:who.status||403};return {me:who.me};
 };
 const drafts=createDraftCostsHandler({store:getStore({name:'verisko-draft-costs',consistency:'strong'}),loadWorkspace,baseline:inputs,authorize});
 return createClientPlanHandler({store:getStore({name:'verisko-client-plans',consistency:'strong'}),loadWorkspace,authorize,pricing,loadMarket:()=>getStore({name:'verisko-sales-prices',consistency:'strong'}).get('current',{type:'json'}),loadDraft:async(req,id)=>{const url=new URL('/api/draft-costs',req.url);url.searchParams.set('jobId',id);const res=await drafts(new Request(url,{headers:req.headers})),body=await res.json();if(!res.ok)throw Object.assign(Error(body.error),{status:res.status});return body;}})(request);
};
