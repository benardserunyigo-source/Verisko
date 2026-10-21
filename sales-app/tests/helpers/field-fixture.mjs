import {createFieldShiftsHandler} from '../../netlify/functions/lib/field-shifts-core.mjs';
export class FieldMemoryStore {
 rows=new Map();serial=0;
 async get(k){return structuredClone(this.rows.get(k)?.data||null);}
 async getWithMetadata(k){return structuredClone(this.rows.get(k)||null);}
 async setJSON(k,v,opts={}){const old=this.rows.get(k);if(opts.onlyIfNew&&old||opts.onlyIfMatch&&old?.etag!==opts.onlyIfMatch)return {modified:false};const etag=String(++this.serial);this.rows.set(k,{data:structuredClone(v),etag});return {modified:true,etag};}
 list({prefix='',paginate=false}={}){const page={blobs:[...this.rows.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};return paginate?(async function*(){yield page;})():Promise.resolve(page);}
 async delete(k){this.rows.delete(k);}
}
export function fieldFixture(){
 let clock=Date.parse('2026-10-21T06:00:00Z'),serial=0;
 const users=[{id:'rep-a',name:'TEST Rep A',role:'sales'},{id:'rep-b',name:'TEST Rep B',role:'sales'},{id:'lead',name:'TEST Lead',role:'teamlead'},{id:'ops',name:'TEST Operations',role:'operations'},{id:'owner',name:'TEST Owner',role:'admin'}],store=new FieldMemoryStore();
 const handler=createFieldShiftsHandler({store,now:()=>clock,uuid:()=>`uuid-${++serial}`,authorize:async req=>({me:users.find(u=>u.id===req.headers.get('authorization')?.replace('Bearer ','')),users})});
 const position=(lat=.3476,lng=32.5825,accuracy=12)=>({lat,lng,accuracy,at:new Date(clock).toISOString()});
 let n=0;
 const call=async(action,body={},person='rep-a',query='')=>handler(new Request('https://test.local/api/field-shifts'+query,{method:action?'POST':'GET',headers:{Authorization:'Bearer '+person,'Content-Type':'application/json'},...(action?{body:JSON.stringify({action,requestId:`request-${++n}`, ...body})}:{})}));
 return {store,users,handler,position,call,now:()=>clock,advance:ms=>clock+=ms};
}
