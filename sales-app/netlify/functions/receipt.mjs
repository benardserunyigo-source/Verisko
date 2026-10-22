import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {createReceiptHandler} from './lib/receipt-core.mjs';
export default async request=>createReceiptHandler({store:getStore({name:'verisko-receipts',consistency:'strong'}),authorize:async req=>{
 const data=await getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'})||{users:[]};
 const who=await identify(req,data,{authStore:getStore({name:AUTH_STORE,consistency:'strong'}),now:Date.now(),supabaseUser});
 return who.error||!who.me||idOverdue(who.me,Date.now())?null:{me:who.me,data};
}})(request);
