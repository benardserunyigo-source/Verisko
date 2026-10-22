import '../../../lead-pipeline.js';
import {ROLES} from '../access.mjs';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
export function canReadReceipt(data,me,id,owner){
 if(!me||!ROLES.includes(me.role)||['installer'].includes(me.role))return false;
 if(me.role==='admin')return true;
 if(owner?.userId===me.id&&(me.role==='operations'||['sales','teamlead'].includes(owner.role)))return true;
 const prospects=(data.prospects||[]).filter(p=>me.role==='sales'?String(p.createdByEmail||'').toLowerCase()===String(me.email||'').toLowerCase():globalThis.VeriskoLeadPipeline.canSee(p,me));
 if(prospects.some(p=>p.photoId===id))return true;
 return me.role==='operations'&&(data.transactions||[]).some(t=>t.proofId===id);
}
export function createReceiptHandler({store,authorize}){
 return async request=>{try{
  const auth=await authorize(request),me=auth?.me;
  if(!me||!ROLES.includes(me.role)||['installer'].includes(me.role))return json({ok:false,error:'not_authorized'},403);
  if(request.method==='POST'){
   const body=await request.json(),image=body?.image||'';
   if(typeof image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>3000000)return json({ok:false,error:'Use a JPEG, PNG or WebP image under 2 MB.'},400);
   const id=crypto.randomUUID();await store.set(id,image);await store.setJSON('owner/'+id,{userId:me.id,role:me.role,at:new Date().toISOString()});return json({ok:true,id});
  }
  if(request.method==='GET'){
   const id=new URL(request.url).searchParams.get('id');if(!/^[a-zA-Z0-9-]{1,100}$/.test(id||''))return json({ok:false,error:'not_found'},404);
   const owner=await store.get('owner/'+id,{type:'json'});
   if(!canReadReceipt(auth.data,me,id,owner))return json({ok:false,error:'not_found'},404);
   const image=await store.get(id,{type:'text'});return image?json({ok:true,image}):json({ok:false,error:'not_found'},404);
  }
  return json({ok:false,error:'method_not_allowed'},405);
 }catch{return json({ok:false,error:'Could not load or save this photo.'},500);}};
}
