import {createHmac,timingSafeEqual} from 'node:crypto';import {rpc} from './lib/workflow.mjs';
export async function webhook(request,env=process.env,db=(n,a)=>rpc(n,a,env)){
 const url=new URL(request.url);
 if(request.method==='GET'){if(env.WHATSAPP_VERIFY_TOKEN&&url.searchParams.get('hub.mode')==='subscribe'&&url.searchParams.get('hub.verify_token')===env.WHATSAPP_VERIFY_TOKEN)return new Response(url.searchParams.get('hub.challenge'));return new Response('Refused',{status:403})}
 if(request.method!=='POST')return new Response(null,{status:405});
 if(!env.WHATSAPP_APP_SECRET)return new Response('Not configured',{status:503});
 const raw=await request.text();if(raw.length>1000000)return new Response(null,{status:413});const sig=request.headers.get('x-hub-signature-256')||'';const expected='sha256='+createHmac('sha256',env.WHATSAPP_APP_SECRET).update(raw).digest('hex');
 if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return new Response('Refused',{status:403});
 try{const b=JSON.parse(raw);for(const e of b.entry||[])for(const c of e.changes||[]){for(const s of c.value?.statuses||[]){if(typeof s.id==='string'&&['sent','delivered','read','failed'].includes(s.status))await db('watch_delivery',{p_provider:s.id,p_status:s.status})}for(const m of c.value?.messages||[]){if(/^stop$/i.test(m.text?.body?.trim()||'')&&/^\d{8,15}$/.test(m.from||''))await db('watch_optout',{p_phone:'+'+m.from})}}return new Response('OK')}catch{return new Response('Retry',{status:500})}
}
export default request=>webhook(request);
