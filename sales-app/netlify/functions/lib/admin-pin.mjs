import {createHmac,randomInt} from 'node:crypto';
import {getSecret,newPinRecord,pinMatches} from '../pin-auth.mjs';
import {ROLES,canManageMember} from '../access.mjs';
const WINDOW=15*60*1000,LIMIT=20;
const digest=(secret,purpose,value)=>createHmac('sha256',secret).update(purpose+'\0'+value).digest('hex');
const result=(status,body)=>({status,body});
// Count every attempt, including unknown PINs. CAS prevents parallel requests
// from bypassing the limit. Only the platform's connection IP is trusted.
async function takeAttempt(auth,secret,request,now){
 const ip=request.headers.get('x-nf-client-connection-ip')||'unknown';
 const key='admin-pin-rate/'+digest(secret,'rate',ip);
 for(let n=0;n<8;n++){
  const old=await auth.getWithMetadata(key,{type:'json'});
  const prev=old?.data?.until>now?old.data:{count:0,until:now+WINDOW};
  if(prev.count>=LIMIT)return false;
  const save=await auth.setJSON(key,{count:prev.count+1,until:prev.until},old?{onlyIfMatch:old.etag}:{onlyIfNew:true});
  if(save.modified)return true;
 }
 return false;
}
export async function adminPinCommand({action,body,request,auth,users,me,now}){
 if(!['loginAdminPin','createAdminPin','disableAdminPin'].includes(action))return null;
 if(action!=='loginAdminPin'&&me?.role!=='admin')return result(403,{ok:false,error:'Only Admin can create or replace a sign-in PIN.'});
 const secret=await getSecret(auth);
 if(action==='loginAdminPin'){
  if(!await takeAttempt(auth,secret,request,now))return result(429,{ok:false,error:'Too many tries. Wait 15 minutes, then try again.'});
  const pin=String(body.pin||''),wrong=()=>result(401,{ok:false,error:'That PIN is not right. Check it or ask Admin for a new one.'});
  if(!/^\d{8}$/.test(pin))return wrong();
  const lookup=digest(secret,'pin',pin),uid=await auth.get('admin-pin-key/'+lookup,{type:'text'});
  const rec=uid?await auth.get('admin-pin/'+uid,{type:'json'}):null;
  const user=users.find(u=>u.id===uid&&ROLES.includes(u.role));
  if(!rec||!user||rec.lookup!==lookup||!rec.active||!pinMatches(pin,rec))return wrong();
  return result(200,{ok:true,user,version:rec.v});
 }
 const uid=String(body.userId||''),user=users.find(u=>u.id===uid&&ROLES.includes(u.role));
 if(!user)return result(404,{ok:false,error:'This person is no longer on the team.'});
 if(user.id!==me.id&&!canManageMember(me,user,users[0]?.id))return result(403,{ok:false,error:'You cannot change this person’s sign-in PIN.'});
 const key='admin-pin/'+uid,old=await auth.getWithMetadata(key,{type:'json'});
 const version=(old?.data?.v||0)+1;
 if(action==='disableAdminPin'){
  if(!old)return result(200,{ok:true});
  const saved=await auth.setJSON(key,{...old.data,active:false,hash:'',v:version,changedBy:me.id,changedAt:new Date(now).toISOString()},{onlyIfMatch:old.etag});
  if(!saved.modified)return result(409,{ok:false,error:'This PIN changed. Open the person and try again.'});
  if(old.data.lookup)await auth.delete('admin-pin-key/'+old.data.lookup);
  return result(200,{ok:true});
 }
 let pin,lookup;
 for(let n=0;n<10;n++){
  pin=String(randomInt(10000000,100000000));lookup=digest(secret,'pin',pin);
  if((await auth.set('admin-pin-key/'+lookup,uid,{onlyIfNew:true})).modified)break;
  pin='';
 }
 if(!pin)return result(503,{ok:false,error:'Could not create a PIN. Try again.'});
 const rec={...newPinRecord(pin,version),lookup,active:true,changedBy:me.id,changedAt:new Date(now).toISOString()};
 const saved=await auth.setJSON(key,rec,old?{onlyIfMatch:old.etag}:{onlyIfNew:true});
 if(!saved.modified){await auth.delete('admin-pin-key/'+lookup);return result(409,{ok:false,error:'This PIN changed. Open the person and try again.'});}
 if(old?.data?.lookup)await auth.delete('admin-pin-key/'+old.data.lookup);
 // Plain PIN is returned once to the creating Admin, never saved in shared data.
 return result(200,{ok:true,pin,name:user.name,userId:uid});
}
