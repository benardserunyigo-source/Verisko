import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthHandler} from '../netlify/functions/auth.mjs';
import {identify} from '../netlify/functions/pin-auth.mjs';
import {createDataHandler} from '../netlify/functions/data.mjs';
import {createInstallerHandler} from '../netlify/functions/lib/installer-core.mjs';
import {createJob} from '../installer-model.mjs';
import {FieldMemoryStore} from './helpers/field-fixture.mjs';

// Real authentication, data and installation handlers. Only email-provider
// verification and storage are replaced; no emails or production writes occur.
async function fixture(){
 const now=Date.now(),stores=new Map();
 const storeFor=arg=>{const name=typeof arg==='string'?arg:arg.name;if(!stores.has(name)){const s=new FieldMemoryStore();s.set=(k,v,o)=>s.setJSON(k,v,o);stores.set(name,s);}return stores.get(name)};
 const users=['admin','operations','teamlead','sales','installer','other-installer'].map(role=>({id:role,role:role==='other-installer'?'installer':role,name:'TEST '+role,email:role+'@test.invalid'}));
 const initial={users,prospects:[{id:'own',business:'TEST Sales contact',createdByEmail:'sales@test.invalid',photoId:'own-photo'},{id:'other',business:'TEST Other contact',createdByEmail:'operations@test.invalid'},{id:'office',business:'TEST Office prospect',createdByEmail:'operations@test.invalid',leadOnly:true}],appointments:[],jobs:[],transactions:[{id:'private-expense',direction:'out',amount:10000,status:'approved',note:'PRIVATE FINANCE'},{id:'own-deposit',direction:'in',amount:200000,status:'approved',prospectId:'own'}],technicians:[],quotes:[],installations:[],training:{},config:{exportKey:'PRIVATE EXPORT KEY'}};
 await storeFor('verisko-sales').setJSON('app-data',initial);
 const verified=new Map(users.map(u=>['verified-email-'+u.id,u.email]));
 const authenticate=(request,data,deps={})=>identify(request,data,{...deps,authStore:storeFor('verisko-auth'),now,supabaseUser:async token=>verified.get(token)||null});
 const auth=createAuthHandler({storeFor,identifyRequest:authenticate,clock:()=>now});
 const data=createDataHandler({storeFor,identifyRequest:authenticate});
 const install=storeFor('verisko-installations');
 const makeJob=(id,assignees,supervisorIds=[])=>createJob({id,business:'TEST '+id,address:'TEST Site',scope:'TEST cameras',equipment:'TEST cable',locations:['TEST Entrance'],assignees,supervisorIds,siteStaff:{name:'TEST Site staff',phone:'0772000000'},scheduledDate:new Date(now).toISOString().slice(0,10)},users[0],new Date(now).toISOString(),users);
 const mine=makeJob('assigned',['installer','other-installer'],['teamlead']);mine.installerPay={installer:{amount:350000},'other-installer':{amount:900000}};
 await install.setJSON('jobs/assigned',mine);await install.setJSON('jobs/other-job',makeJob('other-job',['other-installer']));
 const installer=createInstallerHandler({store:install,authorize:async request=>{const raw=await storeFor('verisko-sales').get('app-data');const who=await authenticate(request,raw);return who.error?{status:who.status}:{me:who.me,users:raw.users};}});
 const request=(route,token,body)=>new Request('https://test.invalid/api/'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'x-nf-client-connection-ip':'192.0.2.12'},...(body?{body:JSON.stringify(body)}:{})});
 const callAuth=async(action,body={},token='verified-email-admin')=>{const r=await auth(request('auth',token,{action,...body}));return {status:r.status,...await r.json()}};
 const pinToken=async role=>{const issued=await callAuth('createAdminPin',{userId:role});assert.equal(issued.status,200);const login=await callAuth('loginAdminPin',{pin:issued.pin},'');assert.equal(login.status,200);assert.equal(login.user.id,role);return login.token};
 return {users,initial,storeFor,request,data,installer,pinToken,callAuth};
}

test('Admin email and actual issued-PIN sign-in reach the same protected workspace',async()=>{
 const f=await fixture(),pin=await f.pinToken('admin');
 const responses=await Promise.all(['verified-email-admin',pin].map(t=>f.data(f.request('data',t))));
 for(const r of responses)assert.equal(r.status,200);
 const [emailView,pinView]=await Promise.all(responses.map(r=>r.json()));
 assert.deepEqual(pinView,emailView);assert.equal(pinView.data.config.exportKey,'PRIVATE EXPORT KEY');
 assert.deepEqual(await f.storeFor('verisko-sales').get('app-data'),f.initial);
});

test('each non-Admin email is denied; real PIN sessions enforce contact, money and installation scope',async()=>{
 const f=await fixture();
 for(const role of ['operations','teamlead','sales','installer']){
  assert.equal((await f.data(f.request('data','verified-email-'+role))).status,403);
  assert.equal((await f.installer(f.request('installer','verified-email-'+role))).status,403);
  const token=await f.pinToken(role),response=await f.data(f.request('data',token));assert.equal(response.status,200);const b=await response.json();
  assert.equal(b.data.config.exportKey,undefined);
  if(role==='sales'){assert.deepEqual(b.data.prospects.map(p=>p.id),['own']);assert(!JSON.stringify(b).includes('PRIVATE FINANCE'));assert.equal((await f.installer(f.request('installer',token))).status,403);}
  if(role==='teamlead'){assert.deepEqual(b.data.prospects.map(p=>p.id),['own','other']);assert(!JSON.stringify(b).includes('PRIVATE FINANCE'));}
  if(role==='operations'){assert.equal(b.data.prospects.length,3);assert.equal(b.data.transactions.length,2);}
  if(role==='installer'){assert.deepEqual(b.data.prospects,[]);assert.deepEqual(b.data.transactions,[]);}
  if(role!=='sales'){
   const r=await f.installer(f.request('installer',token));assert.equal(r.status,200);const jobs=(await r.json()).jobs;
   assert.deepEqual(jobs.map(j=>j.id).sort(),role==='operations'?['assigned','other-job']:['assigned']);
   if(role==='installer'){assert.deepEqual(Object.keys(jobs[0].installerPay),['installer']);assert(!JSON.stringify(jobs).includes('900000'));assert.equal((await f.installer(f.request('installer?jobId=other-job',token))).status,404);}
   if(role==='teamlead')assert.deepEqual(jobs[0].installerPay,{});
  }
  assert.equal((await f.callAuth('createAdminPin',{userId:'sales'},token)).status,403);
 }
 assert.deepEqual(await f.storeFor('verisko-sales').get('app-data'),f.initial);
});

test('removal or demotion immediately rejects a previously valid Admin email session',async()=>{
 const f=await fixture();assert.equal((await f.data(f.request('data','verified-email-admin'))).status,200);
 await f.storeFor('verisko-sales').setJSON('app-data',{...f.initial,users:f.users.map(u=>u.id==='admin'?{...u,role:'operations'}:u)});
 assert.equal((await f.data(f.request('data','verified-email-admin'))).status,403);
 await f.storeFor('verisko-sales').setJSON('app-data',{...f.initial,users:f.users.filter(u=>u.id!=='admin')});
 assert.equal((await f.data(f.request('data','verified-email-admin'))).status,403);
});
