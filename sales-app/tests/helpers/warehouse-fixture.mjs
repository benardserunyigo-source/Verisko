import {journeyFixture} from './journey-fixture.mjs';
import {createInventoryHandler,inventoryView,stockRecords} from '../../netlify/functions/lib/inventory-core.mjs';
import {warehouseCoordinator} from '../../netlify/functions/lib/warehouse-lock.mjs';
import {projectWarehouseCases,checkWarehouseIssue} from '../../netlify/functions/lib/warehouse-stock.mjs';
import {createReadyHandler} from '../../netlify/functions/lib/ready-leads-core.mjs';
import {createInstallerHandler} from '../../netlify/functions/lib/installer-core.mjs';
import {readyInstallationSources} from '../../netlify/functions/lib/materials-assignment.mjs';
import {loadInstallationProgress} from '../../netlify/functions/lib/installation-progress.mjs';
export async function warehouseFixture(){
 const f=await journeyFixture(),inventory=f.storeFor('verisko-inventory');f.setTime('2026-10-25T12:00:00Z');
 const movements=async()=>({cases:await stockRecords(f.ready,'cases/'),jobs:await stockRecords(f.install,'jobs/')});
 const authorize=async r=>{const data=await f.raw(),me=data.users.find(u=>u.id===r.headers.get('authorization')?.replace(/^Bearer /,''));if(!me)return {status:401};const m=await movements(),warehouse=await inventory.get('current')||{};return {...data,me,warehouse,installationProgress:await loadInstallationProgress(f.install),readySources:readyInstallationSources(data,projectWarehouseCases(m.cases,warehouse)),sourceJobs:data.jobs,materialLocks:m.jobs.filter(j=>j.readyContactId&&j.assignment?.status!=='declined').map(j=>({contactId:j.readyContactId,sourceId:j.materialSourceId}))};};
 f.handlers.inventory=async r=>{const c=warehouseCoordinator(inventory);return createInventoryHandler({store:c.guard(inventory),authorize,coordinate:c.run,loadMovements:movements,now:()=>Date.parse(f.now())})(r);};
 f.handlers.ready=async r=>{const c=warehouseCoordinator(inventory);return createReadyHandler({store:c.guard(f.ready),authorize,coordinate:c.run,now:f.now})(r);};
 f.handlers.installer=async r=>{const c=warehouseCoordinator(inventory);return createInstallerHandler({store:c.guard(f.install),authorize,coordinate:c.run,now:f.now,beforeCommand:args=>checkWarehouseIssue({...args,store:inventory,loadMovements:movements,inventoryView})})(r);};
 let n=0;f.stock=async(body,role='operations')=>{const old=await inventory.get('current');const req=new Request('https://test.local/api/inventory',{method:body?'POST':'GET',headers:{authorization:role,'content-type':'application/json'},...(body?{body:JSON.stringify({version:old?.version||0,requestId:'warehouse-request-'+(++n),...body})}:{})});const res=await f.handlers.inventory(req);return {status:res.status,...await res.json()};};
 f.count=async(name,quantity)=>{const item=(await f.stock()).items.find(i=>i.name===name);return f.stock({action:'count',itemId:item.id,quantity,basis:item.basis,note:'TEST physical warehouse count'});};
 f.allocate=async(contactId,sourceId,materialItemId,quantity,extra={})=>{const c=await f.ready.get('cases/'+contactId),item=c.materialPlans.find(p=>p.sourceId===sourceId).items.find(i=>i.id===materialItemId),row=(await f.stock()).items.find(r=>r.name===item.name&&r.unit===item.unit);return f.stock({action:'allocate',contactId,sourceId,materialItemId,itemId:row.id,quantity,caseVersion:c.version,...extra});};
 f.inventory=inventory;return f;
}
