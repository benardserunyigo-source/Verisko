import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {createCallbacksHandler} from './lib/callbacks-core.mjs';
import {stockRecords} from './lib/inventory-core.mjs';
export default request=>createCallbacksHandler({store:getStore({name:'verisko-callbacks',consistency:'strong'}),loadJobs:()=>stockRecords(getStore({name:'verisko-installations',consistency:'strong'}),'jobs/'),authorize:async req=>{
 const data=await getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'})||{users:[]};const who=await identify(req,data,{authStore:getStore({name:AUTH_STORE,consistency:'strong'}),supabaseUser,now:Date.now()});if(who.error||!who.me||idOverdue(who.me,Date.now()))return {status:who.status||403};return {me:who.me,users:data.users};
}})(request);
