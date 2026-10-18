import {getStore} from '@netlify/blobs';
export const config={schedule:'15 2 * * *'};
export default async()=>{
 const store=getStore({name:'verisko-applications',consistency:'strong'}),now=Date.now(),day=Math.floor(now/86400000);
 const drafts=await store.list({prefix:'draft/'});
 for(const blob of (drafts.blobs||[]).slice(0,100)){
  const draft=await store.get(blob.key,{type:'json'});if(!draft||draft.expiresAt>=now)continue;
  const complete=await store.get('record/'+draft.id,{type:'json'});
  if(!complete)for(let index=0;index<draft.video.chunks;index++)await store.delete('video/'+draft.id+'/'+index);
  await store.delete(blob.key);
 }
 const quotas=await store.list({prefix:'quota/'});
 for(const blob of quotas.blobs||[])if(Number(blob.key.split('/')[1])<day-1)await store.delete(blob.key);
 return new Response(null,{status:204});
};
