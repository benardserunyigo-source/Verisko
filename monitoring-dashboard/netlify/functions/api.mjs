import {workflow} from './lib/workflow.mjs';
const cookieName='__Host-verisko_watch';
const json=(status,body,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
export function staffMap(env){try{const v=JSON.parse(env.STAFF_ACCESS||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch{return {}}}
export async function handle(request,env=process.env,fetcher=fetch){
 const path=new URL(request.url).pathname.split('/').pop();if(request.method!=='POST')return json(405,{error:'POST only'});
 const origin=request.headers.get('Origin');let siteOrigin;try{siteOrigin=new URL(env.SITE_URL).origin}catch{return json(503,{error:'Staff access is not configured yet. You can explore the demo.'})}
 if(origin!==siteOrigin)return json(403,{error:'Request origin refused'});
 if(!request.headers.get('Content-Type')?.includes('application/json'))return json(415,{error:'JSON required'});
 if(Number(request.headers.get('Content-Length')||0)>12000)return json(413,{error:'Request too large'});
 const raw=await request.text();if(raw.length>12000)return json(413,{error:'Request too large'});let body;try{body=JSON.parse(raw)}catch{return json(400,{error:'Invalid request'})}if(!body||typeof body!=='object')return json(400,{error:'Invalid request'});
 const clear={'Set-Cookie':cookieName+'=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'};
 if(path==='logout')return json(200,{ok:true},clear);
 if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return json(503,{error:'Staff access is not configured yet.'});
 let base;try{const u=new URL(env.SUPABASE_URL);if(u.protocol!=='https:')throw Error();base=u.origin}catch{return json(503,{error:'Invalid server configuration'})}
 const staff=staffMap(env);const role=email=>staff[String(email||'').toLowerCase()];const allowed=email=>['technical','operations','admin'].includes(role(email));
 const call=(url,opts)=>fetcher(url,{...opts,signal:AbortSignal.timeout(12000),redirect:'error'});
 try{
  if(path==='login') {const email=String(body.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(400,{error:'Enter a valid email address'});if(allowed(email)){const r=await call(base+'/auth/v1/otp?redirect_to='+encodeURIComponent(siteOrigin+'/'),{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,create_user:false})});if(!r.ok)return json(429,{error:'Could not send a sign-in link. Wait a minute and try again.'})}return json(200,{ok:true})}
  const token=path==='session'?body.token:(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(typeof token!=='string'||!token||token.length>9000||/[\s;\r\n]/.test(token))return json(401,{error:'Please sign in'});
  const who=await call(base+'/auth/v1/user',{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token}});if(!who.ok)return json(401,{error:'Your session expired. Please sign in again.'},clear);const person=await who.json();if(!person.email_confirmed_at||!allowed(person.email))return json(403,{error:'This account is not approved for monitoring.'},clear);
  const user={email:person.email,role:role(person.email)};
  if(path==='session')return json(200,{ok:true,user},{'Set-Cookie':cookieName+'='+token+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600'});
  if(path==='me')return json(200,{ok:true,user});
  if(['onboard','workflow','schedule','complete','rotate-box'].includes(path)){
   try{return json(200,{ok:true,...await workflow(path,body,user,env,fetcher)})}catch(e){return json(400,{error:e.message})}
  }
  if(!['summary','detail','incident'].includes(path))return json(404,{error:'Not found'});
  if(!env.MONITORING_API_KEY)return json(503,{error:'Monitoring feed is not connected. Ask the owner to finish setup.'});
  const payload=path==='summary'?{action:'summary'}:path==='detail'?{action:'detail',siteId:body.siteId}:{action:body.action,incidentId:body.incidentId,by:person.email};
  if(path==='detail'&&(typeof body.siteId!=='string'||body.siteId.length>100))return json(400,{error:'Invalid site'});
  if(path==='incident'&&(!['acknowledge','fix'].includes(body.action)||typeof body.incidentId!=='string'||body.incidentId.length>100))return json(400,{error:'Invalid action'});
  if(path==='incident'&&body.action==='fix')return json(400,{error:'Use Verify repair to record the repair and queue client updates.'});
  const r=await call(base+'/functions/v1/'+(path==='incident'?'incident-update':'sites-read'),{method:'POST',headers:{Authorization:'Bearer '+env.MONITORING_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)return json(r.status===404?404:502,{error:'Monitoring service could not complete the request.'});const result=await r.json();
  if(path==='summary'&&Array.isArray(result.sites)){if(result.sites.length>=1000||result.sites.reduce((n,s)=>n+(s.devices?.length||0),0)>=1000||result.sites.reduce((n,s)=>n+(s.incidents?.length||0),0)>=1000)return json(503,{error:'Monitoring list may be incomplete. Backend pagination is required.'});result.unknown=(result.unknown||[]).map(e=>({id:e.id,siteId:e.site_id}));}
  return json(200,result);
 }catch{return json(502,{error:'Connection unavailable. Try again shortly.'})}
}
export default request=>handle(request);
