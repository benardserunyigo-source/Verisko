import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {createFieldShiftsHandler} from './lib/field-shifts-core.mjs';
export default async request=>createFieldShiftsHandler({
 store:getStore({name:'verisko-field-shifts',consistency:'strong'}),
 authorize:async req=>{
  const data=await getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'})||{users:[]};
  const who=await identify(req,data,{authStore:getStore(AUTH_STORE),supabaseUser,now:Date.now()});
  if(who.error||!who.me||idOverdue(who.me,Date.now()))return {status:who.status||403};
  return {me:who.me,users:data.users};
 }
})(request);
