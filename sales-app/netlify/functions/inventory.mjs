import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {createInventoryHandler,stockRecords} from './lib/inventory-core.mjs';
export default async request=>createInventoryHandler({store:getStore({name:'verisko-inventory',consistency:'strong'}),authorize:async req=>{
 const data=await getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'})||{users:[]};
 const who=await identify(req,data,{authStore:getStore({name:AUTH_STORE,consistency:'strong'}),supabaseUser,now:Date.now()});
 if(who.error||!who.me||idOverdue(who.me,Date.now()))return {status:who.status||403};return {me:who.me};
},loadMovements:async()=>({cases:await stockRecords(getStore({name:'verisko-ready-cases',consistency:'strong'}),'cases/'),jobs:await stockRecords(getStore({name:'verisko-installations',consistency:'strong'}),'jobs/')})})(request);
