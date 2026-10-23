import {loadInstallationProgress} from '../../netlify/functions/lib/installation-progress.mjs';
// Fictional workspace using the real HTTP handlers and in-memory stores only.
import {FieldMemoryStore} from './field-fixture.mjs';
import {createDataHandler} from '../../netlify/functions/data.mjs';
import {createReadyHandler} from '../../netlify/functions/lib/ready-leads-core.mjs';
import {createInstallerHandler} from '../../netlify/functions/lib/installer-core.mjs';
import {loadReadyCases} from '../../netlify/functions/lib/ready-progress.mjs';
import {readyInstallationSources} from '../../netlify/functions/lib/materials-assignment.mjs';
export const IMAGE='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
export async function journeyFixture(){
 const users=['admin','operations','teamlead','sales','installer'].map(role=>({id:role,name:'TEST '+role,role,email:role+'@test.invalid',phone:'0772000000'}));users.push({id:'other-sales',name:'TEST Other sales',role:'sales',email:'other@test.invalid'},{id:'other-installer',name:'TEST Other installer',role:'installer',email:'other-installer@test.invalid'});
 const stores=new Map(),storeFor=arg=>{const name=typeof arg==='string'?arg:arg.name;if(!stores.has(name))stores.set(name,new FieldMemoryStore());return stores.get(name);};
 const main=storeFor('verisko-sales'),ready=storeFor('verisko-ready-cases'),install=storeFor('verisko-installations');
 await main.setJSON('app-data',{users,prospects:[],appointments:[],jobs:[],transactions:[],technicians:[],quotes:[],installations:[],training:{},config:{payScheme:4,schemeStart:'2026-10-19',perVisit:15000,commissionPerSale:100000,floatAmount:50000,floatMinBookings:3,exportKey:'PRIVATE EXPORT KEY'}});
 const raw=()=>main.get('app-data');let clock=new Date().toISOString();const now=()=>clock;
 const identifyRequest=async req=>{const d=await raw(),me=d.users.find(u=>u.id===req.headers.get('authorization')?.replace(/^Bearer /,''));return me?{me,email:me.email}:{error:'Not signed in',status:401};};
 const authorize=async req=>{const who=await identifyRequest(req);if(who.error)return {status:who.status};const d=await raw(),cases=await loadReadyCases(ready),linked=[...install.rows.values()].map(v=>v.data);
 return {installationProgress:await loadInstallationProgress(install),me:who.me,users:d.users,prospects:d.prospects,appointments:d.appointments,transactions:d.transactions,jobs:d.jobs,sourceJobs:d.jobs,readySources:readyInstallationSources(d,cases),materialLocks:linked.filter(j=>j.readyContactId&&j.assignment?.status!=='declined').map(j=>({contactId:j.readyContactId,sourceId:j.materialSourceId}))};};
 const handlers={data:createDataHandler({storeFor,identifyRequest}),ready:createReadyHandler({store:ready,authorize,now}),installer:createInstallerHandler({store:install,authorize,now})};let n=0;
 async function api(route,role='sales',body,query=''){const r=await handlers[route](new Request('https://test.local/api/'+route+query,{method:body?'POST':'GET',headers:{authorization:role},...(body?{body:JSON.stringify(body)}:{})}));let value=await r.json();return {status:r.status,...value};}
 async function ok(...args){const r=await api(...args);if(r.status!==200)throw new Error(JSON.stringify(r));return r;}
 async function workspace(role){return (await ok('data',role)).data;}
 async function save(role,change){const d=await workspace(role);change(d);return api('data',role,{data:d});}
 async function readyCmd(role,action,extra={}){const c=await ready.get('cases/journey-client');return api('ready',role,{contactId:'journey-client',baseVersion:c?.version||0,requestId:'journey-ready-'+(++n),action,...extra});}
 async function installCmd(role,action,data={},extra={}){const jobs=[...install.rows.values()].map(v=>v.data).filter(j=>j.readyContactId==='journey-client'),j=jobs[0];return api('installer',role,{jobId:j?.id||extra.jobId,command:{action,requestId:'journey-install-'+(++n),data,...extra}});}
 return {handlers,users,stores,storeFor,raw,main,ready,install,api,ok,workspace,save,readyCmd,installCmd,now,day:()=>new Date(Date.parse(clock)+10800000).toISOString().slice(0,10),setTime:at=>clock=at};
}
