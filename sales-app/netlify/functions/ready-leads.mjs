import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {createReadyHandler} from './lib/ready-leads-core.mjs';
export default async request=>createReadyHandler({store:getStore({name:'verisko-ready-cases',consistency:'strong'}),authorize:async req=>{
 const data=await getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'})||{users:[]};
 const who=await identify(req,data,{authStore:getStore({name:AUTH_STORE,consistency:'strong'}),supabaseUser,now:Date.now()});
 if(who.error||!who.me||idOverdue(who.me,Date.now()))return {status:who.status||403};
 const materialLocks=[];if(['admin','operations'].includes(who.me.role)){const store=getStore({name:'verisko-installations',consistency:'strong'});for await(const page of store.list({prefix:'jobs/',paginate:true})){for(const b of page.blobs){const j=await store.get(b.key,{type:'json'});if(j?.readyContactId&&j.assignment&&j.assignment.status!=='declined')materialLocks.push({contactId:j.readyContactId,sourceId:j.materialSourceId});}}}
 return {materialLocks,me:who.me,users:data.users,prospects:data.prospects||[],appointments:data.appointments||[],transactions:data.transactions||[],jobs:data.jobs||[]};
}})(request);
