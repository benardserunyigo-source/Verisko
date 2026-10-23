import {getStore} from '@netlify/blobs';
import {AUTH_STORE,identify,idOverdue} from './pin-auth.mjs';
import {supabaseUser} from './auth.mjs';
import {loadReadyCases} from './lib/ready-progress.mjs';
import {createVoiceHandler} from './lib/voice-notes-core.mjs';
export default async request=>createVoiceHandler({store:getStore({name:'verisko-voice-notes',consistency:'strong'}),authorize:async req=>{
 const data=await getStore({name:'verisko-sales',consistency:'strong'}).get('app-data',{type:'json'})||{users:[]};
 const who=await identify(req,data,{authStore:getStore({name:AUTH_STORE,consistency:'strong'}),supabaseUser,now:Date.now()});
 if(who.error||!who.me||idOverdue(who.me,Date.now()))return {status:who.status||403};
 return {me:who.me,prospects:data.prospects||[],cases:await loadReadyCases(getStore({name:'verisko-ready-cases',consistency:'strong'}))};
}})(request);
