import {createHash} from 'node:crypto';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const valid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function canUseVoice(p,me,cases=[]){
 if(!p||!['admin','operations','teamlead','sales'].includes(me?.role))return false;
 if(['admin','operations'].includes(me.role))return true;
 const own=!!me.email&&String(p.createdByEmail||'').toLowerCase()===me.email.toLowerCase();
 return own||me.role==='teamlead'&&(!p.leadOnly||cases.some(c=>c.contactId===p.id)||!!p.handoffAt&&['operations','manager'].includes(p.handoffTo));
}
export function voiceFollowUp(n){return {id:'voice-'+n.id,voiceNoteId:n.id,at:n.at,by:n.by,byEmail:n.byEmail,role:({admin:'Admin',operations:'Operations',teamlead:'Team lead',sales:'Sales'})[n.role]||n.role,note:n.caption||'Voice note',durationSeconds:n.durationSeconds,outcome:'Voice note'};}
export async function loadVoiceNotes(store){const out=[];for await(const page of store.list({prefix:'contacts/',paginate:true})){for(const b of page.blobs){const x=await store.get(b.key,{type:'json'});if(x?.contactId&&Array.isArray(x.notes))out.push(...x.notes.map(n=>({...n,contactId:x.contactId})));}}return out;}
export function stripVoice(data){return {...data,prospects:(data.prospects||[]).map(p=>({...p,followUps:(p.followUps||[]).filter(f=>!f.voiceNoteId&&!String(f.id||'').startsWith('voice-'))}))};}
export function projectVoice(data,notes=[]){const clean=stripVoice(data);return {...clean,prospects:clean.prospects.map(p=>({...p,followUps:[...(p.followUps||[]),...notes.filter(n=>n.contactId===p.id).map(voiceFollowUp)].sort((a,b)=>String(a.at).localeCompare(String(b.at)))}))};}
export function decodeVoice(body){
 const mime=String(body.mimeType||'').split(';')[0].toLowerCase(),seconds=body.durationSeconds,b64=body.audio;
 if(!['audio/webm','audio/ogg','audio/mp4'].includes(mime))throw fail('Use an audio recording from this app.');
 if(typeof b64!=='string'||b64.length>2800000||!b64.length||!(/^[A-Za-z0-9+/]+={0,2}$/.test(b64)))throw fail('Keep the voice note under 2 MB.');
 const bytes=Buffer.from(b64,'base64');if(bytes.length<12||bytes.length>2097152)throw fail('Keep the voice note under 2 MB.');
 if(mime==='audio/webm'&&bytes.subarray(0,4).toString('hex')!=='1a45dfa3'||mime==='audio/ogg'&&bytes.subarray(0,4).toString()!=='OggS'||mime==='audio/mp4'&&bytes.subarray(4,8).toString()!=='ftyp')throw fail('This audio file is not valid. Record it again.');
 if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<=0||seconds>120)throw fail('Keep the voice note to two minutes.');
 const caption=typeof body.caption==='string'?body.caption.trim().slice(0,300):'',durationSeconds=Math.round(seconds*10)/10;
 return {base64:b64,mimeType:mime,durationSeconds,caption,hash:createHash('sha256').update(bytes).update(JSON.stringify([mime,durationSeconds,caption])).digest('hex')};
}
export function createVoiceHandler({store,authorize,now=()=>new Date().toISOString()}){return async request=>{try{
 const auth=await authorize(request),me=auth?.me;if(!me)return json({ok:false,error:'Sign in again.'},auth?.status||401);
 if(!['admin','operations','teamlead','sales'].includes(me.role))throw fail('Client access required.',403);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)throw fail('Open this contact in the app.',403);
 const url=new URL(request.url);let body;if(request.method==='POST'){if(Number(request.headers.get('content-length'))>3000000)throw fail('Keep the voice note under 2 MB.',413);body=await request.json();}
 else if(request.method!=='GET')throw fail('Method not allowed.',405);
 const contactId=body?.contactId||url.searchParams.get('contactId');if(!valid(contactId))throw fail('Choose a saved contact.');
 const p=(auth.prospects||[]).find(p=>p.id===contactId);if(!canUseVoice(p,me,auth.cases))throw fail('Contact not found or not shared with you.',404);
 const key='contacts/'+contactId;
 if(request.method==='GET'){
 const index=await store.get(key,{type:'json'})||{notes:[]},id=url.searchParams.get('id');
 if(!id)return json({ok:true,contact:{id:p.id,business:p.business},notes:index.notes});
 if(!valid(id)||!index.notes.some(n=>n.id===id))throw fail('Voice note not found.',404);
 const clip=await store.get('clips/'+contactId+'/'+id,{type:'json'});if(!clip)throw fail('Voice note unavailable.',404);
 return new Response(Buffer.from(clip.base64,'base64'),{headers:{'Content-Type':clip.mimeType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
 }
 const id=body.requestId;if(!/^[A-Za-z0-9-]{8,100}$/.test(id||''))throw fail('A unique recording ID is required.');
 const currentIndex=await store.get(key,{type:'json'});if(currentIndex?.notes?.length>=500&&!currentIndex.notes.some(n=>n.id===id))throw fail('This contact has too many voice notes. Ask Admin for help.',409);
 const clip=decodeVoice(body),clipKey='clips/'+contactId+'/'+id;
 const put=await store.setJSON(clipKey,{...clip,byId:me.id},{onlyIfNew:true});if(!put.modified){const prior=await store.get(clipKey,{type:'json'});if(prior?.byId!==me.id||prior.hash!==clip.hash)throw fail('This recording ID is already used. Record another note.',409);}
 for(let attempt=0;attempt<4;attempt++){
 const old=await store.getWithMetadata(key,{type:'json'}),notes=old?.data.notes||[],existing=notes.find(n=>n.id===id);if(existing){if(existing.byId!==me.id)throw fail('This recording ID is already used.',409);return json({ok:true,note:existing,entry:voiceFollowUp(existing)});}
 if(notes.length>=500)throw fail('This contact has too many voice notes. Ask Admin for help.',409);
 const note={id,at:now(),byId:me.id,by:me.name||'Staff',byEmail:me.email||'',role:me.role,caption:clip.caption,durationSeconds:clip.durationSeconds,mimeType:clip.mimeType};
 const write=await store.setJSON(key,{contactId,notes:[...notes,note]},old?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(write.modified)return json({ok:true,note,entry:voiceFollowUp(note)});
 }
 throw fail('Someone saved a note at the same time. Tap Save again.',409);
 }catch(e){return json({ok:false,error:e.status?e.message:'Could not load or save this voice note.'},e.status||500);}};}
