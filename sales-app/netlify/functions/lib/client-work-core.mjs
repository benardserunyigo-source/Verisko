import {createHash} from 'node:crypto';
import {canUseVoice} from './voice-notes-core.mjs';
import {cleanPosition} from './field-shifts-core.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const key=id=>'people/'+createHash('sha256').update(String(id)).digest('hex');
const valid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
export function createClientWorkHandler({store,authorize,now=()=>Date.now()}){return async request=>{try{
 const auth=await authorize(request),me=auth?.me;if(!me)return json({ok:false,error:'Sign in again.'},auth?.status||401);
 if(!['admin','operations','teamlead','sales'].includes(me.role))throw fail('Client visit access required.',403);
 const url=new URL(request.url);if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)throw fail('Open this visit in the app.',403);
 const manager=['admin','operations'].includes(me.role),prospects=auth.prospects||[],can=id=>canUseVoice(prospects.find(p=>p.id===id),me,auth.cases),ownKey=key(me.id);
 if(request.method==='GET'){
 const contactId=url.searchParams.get('contactId');if(contactId&&!can(contactId))throw fail('Contact not found or not shared with you.',404);
 const mine=await store.get(ownKey,{type:'json'})||{sessions:[]},current=mine.sessions.find(s=>!s.finish)||null;let sessions=mine.sessions;
 if(manager){sessions=[];for await(const page of store.list({prefix:'people/',paginate:true}))for(const b of page.blobs){const row=await store.get(b.key,{type:'json'});sessions.push(...(row?.sessions||[]));}}
 sessions=sessions.filter(s=>(!contactId||s.contactId===contactId)&&can(s.contactId));
 return json({ok:true,current,sessions:sessions.sort((a,b)=>b.start.at.localeCompare(a.start.at)),serverAt:new Date(now()).toISOString()});
 }
 if(request.method!=='POST')throw fail('Method not allowed.',405);
 const body=await request.json(),{contactId,requestId,action}=body;if(!valid(contactId)||!/^[A-Za-z0-9-]{8,100}$/.test(requestId||'')||!['start','finish'].includes(action))throw fail('Choose a contact and Start or Finish.');
 const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 for(let attempt=0;attempt<4;attempt++){
 const old=await store.getWithMetadata(ownKey,{type:'json'}),row=structuredClone(old?.data||{sessions:[],requests:[]}),repeat=row.requests.find(r=>r.id===requestId);
 if(repeat){if(repeat.hash!==hash)throw fail('This request was already used. Refresh and try again.',409);return json({ok:true,session:row.sessions.find(s=>s.id===repeat.sessionId),repeated:true});}
 const current=row.sessions.find(s=>!s.finish),at=new Date(now()).toISOString();let session;
 if(action==='start'){
 if(!can(contactId))throw fail('Contact not found or not shared with you.',404);
 if(current)throw fail('Finish your visit at '+current.business+' before starting another.',409);
 if(row.sessions.length>=1000)throw fail('Your visit history is full. Ask Admin for help.',409);
 const position=cleanPosition(body.position,now());if(position.accuracy>150)throw fail('Move outside for a clearer GPS location, then try again.');
 const p=prospects.find(p=>p.id===contactId);session={id:requestId,contactId,business:p.business||'Client',userId:me.id,name:me.name||'Staff',role:me.role,start:{at,position}};row.sessions.push(session);
 }else{
 if(!current||current.id!==body.sessionId||current.contactId!==contactId)throw fail('This visit changed or has finished. Refresh to see it.',409);
 session=current;let position=null,locationUnavailable='';
 if(body.position)position=cleanPosition(body.position,now());else{locationUnavailable=String(body.locationUnavailable||'').trim().slice(0,180);if(locationUnavailable.length<3)throw fail('Get your finish location, or confirm that GPS is unavailable.');}
 session.finish={at,position,...(locationUnavailable?{locationUnavailable}:{})};session.durationSeconds=Math.max(0,Math.floor((Date.parse(at)-Date.parse(session.start.at))/1000));
 }
 row.requests.push({id:requestId,hash,sessionId:session.id});const write=await store.setJSON(ownKey,row,old?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(write.modified)return json({ok:true,session});
 }
 throw fail('Your visit changed. Refresh and try again.',409);
 }catch(e){return json({ok:false,error:e.status?e.message:'Could not save visit time. Check your connection and try again.'},e.status||500);}};}
