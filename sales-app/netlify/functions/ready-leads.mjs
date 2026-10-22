import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {createReadyHandler} from './lib/ready-leads-core.mjs';
export default async request=>createReadyHandler({store:getStore({name:'verisko-ready-cases',consistency:'strong'}),authorize:async req=>{
 const data=await getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'})||{users:[]};
 const who=await identify(req,data,{authStore:getStore({name:AUTH_STORE,consistency:'strong'}),supabaseUser,now:Date.now()});
 if(who.error||!who.me||idOverdue(who.me,Date.now()))return {status:who.status||403};
 return {me:who.me,users:data.users,prospects:data.prospects||[],appointments:data.appointments||[],transactions:data.transactions||[],jobs:data.jobs||[]};
}})(request);
