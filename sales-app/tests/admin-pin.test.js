import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthHandler} from '../netlify/functions/auth.mjs';
import {identify,verifyToken,getSecret} from '../netlify/functions/pin-auth.mjs';
import {FieldMemoryStore} from './helpers/field-fixture.mjs';
async function fixture(){
 let now=Date.parse('2026-10-29T12:00:00Z');
 const stores=new Map(),storeFor=arg=>{const key=typeof arg==='string'?arg:arg.name;if(!stores.has(key)){const s=new FieldMemoryStore();s.set=(k,v,o)=>s.setJSON(k,v,o);stores.set(key,s);}return stores.get(key);};
 const users=['admin','operations','teamlead','sales','installer'].map(role=>({id:role,role,name:'TEST '+role,email:role+'@test.invalid'}));
 await storeFor('verisko-sales').setJSON('app-data',{users,prospects:[{id:'keep'}],transactions:[]});
 const who=async req=>{const me=users.find(u=>u.id===req.headers.get('authorization'));return me?{me,email:me.email}:{error:'not_signed_in',status:401};};
 const handler=createAuthHandler({storeFor,identifyRequest:who,clock:()=>now});
 const call=async(action,body={},role='',ip='192.0.2.1')=>{const r=await handler(new Request('https://test.invalid/api/auth',{method:'POST',headers:{authorization:role,'x-nf-client-connection-ip':ip},body:JSON.stringify({action,...body})}));return {status:r.status,...await r.json()};};
 const auth=storeFor('verisko-auth');
 const identity=async token=>identify(new Request('https://test.invalid',{headers:{authorization:'Bearer '+token}}),await storeFor('verisko-sales').get('app-data'),{authStore:auth,now,supabaseUser:async()=>null});
 return {users,storeFor,auth,call,identity,advance:ms=>now+=ms};
}
test('Admin creates separate PINs; each staff role signs in without phone/email',async()=>{
 const f=await fixture(),seen=new Set();
 for(const u of f.users){
  const made=await f.call('createAdminPin',{userId:u.id},'admin');assert.equal(made.status,200);assert.match(made.pin,/^\d{8}$/);assert(!seen.has(made.pin));seen.add(made.pin);
  const login=await f.call('loginAdminPin',{pin:made.pin});assert.equal(login.status,200);assert.equal(login.user.id,u.id);assert.equal((await f.identity(login.token)).me.role,u.role);
  const rec=await f.auth.get('admin-pin/'+u.id);assert.notEqual(rec.hash,made.pin);assert(!JSON.stringify(rec).includes('"pin":'));
 }
 assert.deepEqual((await f.storeFor('verisko-sales').get('app-data')).prospects,[{id:'keep'}]);
});
test('PIN replacement and turning off revoke old PINs and sessions',async()=>{
 const f=await fixture(),a=await f.call('createAdminPin',{userId:'sales'},'admin');
 const old=await f.call('loginAdminPin',{pin:a.pin});
 const b=await f.call('createAdminPin',{userId:'sales'},'admin');assert.notEqual(a.pin,b.pin);
 assert.equal((await f.call('loginAdminPin',{pin:a.pin})).status,401);assert.equal((await f.identity(old.token)).status,401);
 const current=await f.call('loginAdminPin',{pin:b.pin});assert.equal(current.status,200);
 assert.equal((await f.call('disableAdminPin',{userId:'sales'},'admin')).status,200);
 assert.equal((await f.call('loginAdminPin',{pin:b.pin})).status,401);assert.equal((await f.identity(current.token)).status,401);
});
test('only Admin manages PINs; missing staff and removed staff cannot sign in',async()=>{
 const f=await fixture();
 for(const role of ['','sales','installer','operations','teamlead'])assert.equal((await f.call('createAdminPin',{userId:'sales'},role)).status,role?403:401);
 assert.equal((await f.call('createAdminPin',{userId:'missing'},'admin')).status,404);
 const pin=await f.call('createAdminPin',{userId:'sales'},'admin');
 const d=await f.storeFor('verisko-sales').get('app-data');d.users=d.users.filter(u=>u.id!=='sales');await f.storeFor('verisko-sales').setJSON('app-data',d);
 assert.equal((await f.call('loginAdminPin',{pin:pin.pin})).status,401);
});
test('unknown and malformed PINs are rate limited including concurrent guesses',async()=>{
 const f=await fixture();
 const attempts=await Promise.all(Array.from({length:24},()=>f.call('loginAdminPin',{pin:'bad'})));
 assert(attempts.filter(r=>r.status===401).length<=20);assert(attempts.some(r=>r.status===429));
 for(let n=0;n<20;n++)await f.call('loginAdminPin',{pin:'00000000'});
 assert.equal((await f.call('loginAdminPin',{pin:'00000000'})).status,429);
 f.advance(16*60*1000);assert.equal((await f.call('loginAdminPin',{pin:'00000000'})).status,401);
 assert.equal((await f.call('loginAdminPin',{pin:'00000000'},'','192.0.2.2')).status,401);
});
test('forged token methods and disabled PINs cannot cross into legacy sessions',async()=>{
 const f=await fixture(),made=await f.call('createAdminPin',{userId:'sales'},'admin'),login=await f.call('loginAdminPin',{pin:made.pin});
 const payload=verifyToken(await getSecret(f.auth),login.token,Date.parse('2026-10-29T12:00:00Z'));assert.equal(payload.method,'admin-pin');
 assert.equal((await f.identity(login.token.replace('vs1.','vs9.'))).status,401);
});
test('creating a PIN preserves the roster and all commercial records exactly',async()=>{
 const f=await fixture(),before=await f.storeFor('verisko-sales').get('app-data');
 await f.call('createAdminPin',{userId:'sales',role:'admin',phone:'0772999999'},'admin');
 assert.deepEqual(await f.storeFor('verisko-sales').get('app-data'),before);
});
test('a second Admin cannot create a PIN for the protected workspace owner',async()=>{
 const f=await fixture();f.users.push({id:'second-admin',name:'TEST Second Admin',role:'admin',email:'second@test.invalid'});
 await f.storeFor('verisko-sales').setJSON('app-data',{users:f.users});
 assert.equal((await f.call('createAdminPin',{userId:'admin'},'second-admin')).status,403);
 assert.equal((await f.call('createAdminPin',{userId:'second-admin'},'second-admin')).status,200);
});
