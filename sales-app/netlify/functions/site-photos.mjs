import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {loadReadyCases} from './lib/ready-progress.mjs';
import {createSitePhotosHandler} from './lib/site-photos-core.mjs';
export default async request=>createSitePhotosHandler({store:getStore({name:'verisko-site-photos',consistency:'strong'}),authorize:async req=>{
 const data=await getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'})||{users:[]};
 const who=await identify(req,data,{authStore:getStore({name:AUTH_STORE,consistency:'strong'}),supabaseUser,now:Date.now()});if(who.error||!who.me||idOverdue(who.me,Date.now()))return {status:who.status||403};
 const jobs=[],store=getStore({name:'verisko-installations',consistency:'strong'});
 for await(const page of store.list({prefix:'jobs/',paginate:true}))for(const b of page.blobs){const j=await store.get(b.key,{type:'json'});if(j)jobs.push(j);}
 return {me:who.me,prospects:data.prospects||[],sourceJobs:data.jobs||[],cases:await loadReadyCases(getStore({name:'verisko-ready-cases',consistency:'strong'})),jobs};
}})(request);
