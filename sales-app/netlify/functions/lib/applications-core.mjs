import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {validateAnswers,videoInfo,validVideoHeader,CHUNK_SIZE,STATUSES} from '../../../application-model.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const UUID=/^[a-f0-9-]{36}$/;
const DAY=86400000;
export function createApplicationsHandler({store,authorize,now=Date.now,ip=()=>''}){
 return async request=>{
  const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Content-Type':'application/json'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  try{
   const url=new URL(request.url),action=url.searchParams.get('action')||'create';
   if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return reply({error:'This request must come from the Verisko app.'},403);
   if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed.'},405);
   if(['list','record','video','review','delete'].includes(action)){
    const who=await authorize(request);
    if(!who||!['admin','operations'].includes(who.role))return reply({error:'Sign in as Operations or Admin to view applications.'},403);
    if(action==='list'&&request.method==='GET'){
     const cursor=url.searchParams.get('cursor')||'';
     const result=await store.list({prefix:'record/'}),keys=(result.blobs||[]).filter(b=>b.key>cursor).sort((a,b)=>a.key.localeCompare(b.key));
     const page=keys.slice(0,40);
     const rows=await Promise.all(page.map(async blob=>{const rec=await store.get(blob.key,{type:'json'});if(!rec)return null;const review=await store.get('review/'+rec.id,{type:'json'});return {...rec,review:review||{status:'New'}}}));
     return reply({ok:true,applications:rows.filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),cursor:keys.length>40?page.at(-1).key:null});
    }
    const body=request.method==='POST'?await request.json():{},id=String(body.id||url.searchParams.get('id')||'');
    if(!UUID.test(id))return reply({error:'Invalid application reference.'},400);
    const rec=await store.get('record/'+id,{type:'json'});if(!rec)return reply({error:'Application not found.'},404);
    if(action==='record'&&request.method==='GET')return reply({ok:true,application:rec,review:await store.get('review/'+id,{type:'json'})||{status:'New'}});
    if(action==='video'&&request.method==='GET'){
     const index=Number(url.searchParams.get('index'));if(!Number.isInteger(index)||index<0||index>=rec.video.chunks)return reply({error:'Invalid video part.'},400);
     const bytes=await store.get('video/'+id+'/'+index,{type:'arrayBuffer'});if(!bytes)return reply({error:'Video part missing. Contact the owner.'},404);
     return new Response(bytes,{headers:{...headers,'Content-Type':'application/octet-stream'}});
    }
    if(action==='review'&&request.method==='POST'){
     if(!STATUSES.includes(body.status))return reply({error:'Choose a valid review status.'},400);
     await store.setJSON('review/'+id,{status:body.status,note:String(body.note||'').slice(0,2000),by:who.email,at:new Date(now()).toISOString()});return reply({ok:true});
    }
    if(action==='delete'&&request.method==='POST'){
     if(who.role!=='admin')return reply({error:'Only Admin can delete an application.'},403);
     // Explicit owner removal, including the private video. No effect on team accounts.
     for(let i=0;i<rec.video.chunks;i++)await store.delete('video/'+id+'/'+i);
     await store.delete('review/'+id);await store.delete('record/'+id);await store.delete('draft/'+id);return reply({ok:true});
    }
    return reply({error:'Method not allowed.'},405);
   }
   if(request.method!=='POST')return reply({error:'Sign in to view applications.'},401);
   if(action==='create'){
    if(Number(request.headers.get('content-length')||0)>12000)return reply({error:'Application text is too long.'},413);
    const body=await request.json();if(JSON.stringify(body).length>12000)return reply({error:'Application text is too long.'},413);
    if(body.website||body.consent!==true)return reply({error:'Please agree to the application privacy notice.'},400);
    const answers=validateAnswers(body.answers),video=videoInfo(body.video);
    const day=Math.floor(now()/DAY),client=ip(request);
    if(!client)return reply({error:'We could not check this connection. Please try again.'},503);
    const key='quota/'+day+'/'+hash(client);let allowed=false;
    for(let i=0;i<10;i++){const result=await store.set(key+'/'+i,'1',{onlyIfNew:true});if(result?.modified){allowed=true;break}}
    if(!allowed)return reply({error:'Too many attempts from this connection today. Please try tomorrow.'},429);
    const id=randomUUID(),token=randomBytes(32).toString('hex'),createdAt=new Date(now()).toISOString();
    await store.setJSON('draft/'+id,{id,answers,video,createdAt,consentAt:createdAt,termsVersion:'field-sales-2026-10-18-v2',tokenHash:hash(token),expiresAt:now()+DAY});
    return reply({ok:true,id,token});
   }
   const id=url.searchParams.get('id')||'';if(!UUID.test(id))return reply({error:'Invalid upload reference.'},400);
   const draft=await store.get('draft/'+id,{type:'json'}),token=request.headers.get('x-upload-token')||'';
   if(!draft||token.length!==64||!timingSafeEqual(Buffer.from(hash(token)),Buffer.from(draft.tokenHash)))return reply({error:'Your upload session has expired. Please start again.'},401);
   const complete=await store.get('record/'+id,{type:'json'});
   if(complete)return action==='complete'?reply({ok:true,id,reference:'VSG-APP-'+id.slice(0,8).toUpperCase()}):reply({error:'This application has already been sent.'},409);
   if(draft.expiresAt<now())return reply({error:'Your upload session has expired. Please start again.'},410);
   if(action==='chunk'){
    const index=Number(url.searchParams.get('index'));if(!Number.isInteger(index)||index<0||index>=draft.video.chunks)return reply({error:'Invalid video part.'},400);
    const expected=Math.min(CHUNK_SIZE,draft.video.size-index*CHUNK_SIZE);
    const raw=await request.arrayBuffer();if(raw.byteLength!==expected)return reply({error:'The video part is incomplete. Please retry.'},400);
    if(index===0&&!validVideoHeader(new Uint8Array(raw),draft.video.mime))return reply({error:'Please record or choose a valid MP4 or WebM video.'},400);
    await store.set('video/'+id+'/'+index,raw,{onlyIfNew:true});return reply({ok:true});
   }
   if(action==='complete'){
    for(let i=0;i<draft.video.chunks;i++){const part=await store.get('video/'+id+'/'+i,{type:'arrayBuffer'});if(!part||part.byteLength!==Math.min(CHUNK_SIZE,draft.video.size-i*CHUNK_SIZE))return reply({error:'Some video parts are missing. Please retry the upload.'},409)}
    const {tokenHash,expiresAt,...record}=draft;await store.setJSON('record/'+id,record,{onlyIfNew:true});
    return reply({ok:true,id,reference:'VSG-APP-'+id.slice(0,8).toUpperCase()});
   }
   return reply({error:'Unknown request.'},400);
  }catch(e){return reply({error:e.message?.startsWith('What ')||e.message?.startsWith('Choose ')||e.message?.startsWith('Enter ')||e.message?.startsWith('Use a video')?e.message:'Could not save your application. Keep this page open and try again.'},400)}
 };
}
