import {rpc} from './lib/workflow.mjs';
export async function dispatch(env=process.env,fetcher=fetch,db=(n,a)=>rpc(n,a,env,fetcher,6000)){
 if(env.WHATSAPP_ENABLED!=='true')return {disabled:true};
 if(!env.WHATSAPP_TOKEN||!/^\d+$/.test(env.WHATSAPP_PHONE_ID||'')||!/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_VERSION||''))throw Error('WhatsApp sender is not configured');
 const templates=JSON.parse(env.WHATSAPP_TEMPLATES||'{}');if(!['connected','fault','scheduled','rescheduled','completed','restored'].every(k=>/^[a-z0-9_]+$/.test(templates[k]||'')))throw Error('Approved templates must be configured');
 let processed=0;
 for(let i=0;i<1;i++){
  const m=await db('watch_claim_message',{});if(!m)break;
  let status='uncertain',provider=null;
  try{
   const r=await fetcher('https://graph.facebook.com/'+env.WHATSAPP_GRAPH_VERSION+'/'+env.WHATSAPP_PHONE_ID+'/messages',{method:'POST',headers:{Authorization:'Bearer '+env.WHATSAPP_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:m.phone.replace(/^\+/,''),type:'template',template:{name:templates[m.kind],language:{code:env.WHATSAPP_LANGUAGE||'en'},components:[{type:'body',parameters:[{type:'text',text:m.site_name},{type:'text',text:m.detail}]}]}}),signal:AbortSignal.timeout(10000)});
   if(r.ok){const b=await r.json();provider=b.messages?.[0]?.id||null;status=provider?'accepted':'uncertain'}else status=r.status>=500?'uncertain':'failed';
  }catch{/* Outcome is ambiguous. Never auto-resend and risk duplicates. */}
  await db('watch_message_result',{p_id:m.id,p_status:status,p_provider:provider});processed++;
 }
 return {processed};
}
export default async ()=>{await dispatch();return new Response(null,{status:204})};
export const config={schedule:'* * * * *'};
