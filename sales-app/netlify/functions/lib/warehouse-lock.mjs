import {randomUUID} from 'node:crypto';
const fail=()=>Object.assign(Error('Stock is being updated. Refresh and try again shortly.'),{status:409});
// All stock writers share this lease. Guard every protected write, and release by
// ETag, so a timed-out request cannot clear a newer owner's lease.
export function warehouseCoordinator(store,{now=()=>Date.now(),uuid=randomUUID}={}){
 let lease=null;const key='write-lock';
 async function check(){if(!lease)throw fail();const current=await store.get(key,{type:'json'});if(current?.token!==lease.token||current.expiresAt<=now())throw fail();}
 return {
  guard(target){return new Proxy(target,{get(t,p){if(p==='setJSON')return async(...args)=>{await check();return t.setJSON(...args);};const value=t[p];return typeof value==='function'?value.bind(t):value;}});},
  async run(method,fn){if(method!=='POST')return fn();const old=await store.getWithMetadata(key,{type:'json'});if(old?.data?.token&&old.data.expiresAt>now())throw fail();
   const next={token:uuid(),expiresAt:now()+2*60000},put=await store.setJSON(key,next,old?.etag?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(!put.modified)throw fail();lease=next;
   try{return await fn();}finally{lease=null;const current=await store.getWithMetadata(key,{type:'json'});if(current?.data?.token===next.token)await store.setJSON(key,{token:'',expiresAt:0},{onlyIfMatch:current.etag});}
  }
 };
}
