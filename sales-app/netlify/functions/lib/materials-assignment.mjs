import {createHash} from 'node:crypto';
import {paidWork,materialStatus} from './materials-core.mjs';
import {createJob} from '../../../installer-model.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function readyInstallationSources(data,cases){
 const out=[];for(const c of cases){const p=(data.prospects||[]).find(p=>p.id===c.contactId);if(!p)continue;const paid=paidWork(p,data.transactions,data.jobs,c);
 for(const plan of c.materialPlans||[]){if(!paid.some(w=>w.id===plan.sourceId)||materialStatus(plan)!=='All materials arrived')continue;
 const linked=(data.jobs||[]).filter(j=>j.prospectId===p.id&&!['Cancelled','Rejected'].includes(j.stage));
 const quote=linked.find(j=>j.id===plan.sourceId)||(plan.sourceId==='client-'+p.id&&linked.length===1?linked[0]:null);
 const materials=plan.items.map(i=>({id:i.id,name:i.name,unit:i.unit,quantity:i.planned}));
 const source={contactId:p.id,materialSourceId:plan.sourceId,sourceId:quote?.id||'',business:p.business,address:p.location||'',materials,scope:quote?.siteNotes||'Install and test the equipment in this materials list.',label:quote?.ref||plan.label||p.business};
 source.snapshot=hash(source);source.installationId='materials-'+hash([p.id,plan.sourceId]).slice(0,24);out.push(source);
 }}return out;
}
export async function resolveInstallationSource(source,store){
 const found=[];for await(const page of store.list({prefix:'jobs/',paginate:true})){for(const b of page.blobs){const j=await store.get(b.key,{type:'json'});if(j&&(j.readyContactId===source.contactId&&j.materialSourceId===source.materialSourceId||source.sourceId&&j.sourceId===source.sourceId))found.push(j.id);}}
 if(new Set(found).size>1)throw fail('This job has more than one installation record. Ask Admin to check it.',409);
 return {...source,installationId:found[0]||source.installationId};
}
export function offerMaterialInstallation(source,old,cmd,me,users,at){
 if(!['admin','operations'].includes(me.role))throw fail('Only Operations can assign a ready job.',403);
 if(cmd.data?.snapshot!==source.snapshot)throw fail('The client or materials changed. Refresh and assign the current list.',409);
 if(old&&((old.workLog||[]).length||old.evidence?.some(e=>(old.assignees||[]).includes(e.by))||(old.materials?.items||[]).some(i=>i.issued>0)||old.cameras?.some(c=>c.cable||c.mount||c.tests)||['Submitted','Completed'].includes(old.status)))throw fail('Work or site materials are already recorded. Open the existing installation.',409);
 if(old&&(cmd.baseVersion!==(old.versions?.plan||0)||cmd.assignmentVersion!==(old.versions?.assignment||0)))throw fail('This assignment changed. Refresh before assigning it again.',409);
 const d=cmd.data||{},installer=users.find(u=>u.id===d.installerId&&u.role==='installer'),site=users.find(u=>u.id===d.siteStaffId&&['admin','operations','teamlead'].includes(u.role));
 if(!installer)throw fail('Choose an Installer account.');if(!site)throw fail('Choose Verisko staff to be at the site.');
 const amount=Number(d.amount);if(!Number.isSafeInteger(amount)||amount<=0||amount>100000000)throw fail('Enter the agreed installer pay in whole Uganda shillings.');
 const date=String(d.scheduledDate||''),today=new Date(Date.parse(at)+10800000).toISOString().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date<today)throw fail('Choose today or a future work date.');
 const phone=String(site.phone||site.pinPhone||d.siteStaffPhone||'').trim();if(!/^\+?[\d ()-]{7,25}$/.test(phone))throw fail('Add the Verisko site staff phone number.');
 const locations=Array.isArray(d.locations)?d.locations.map(s=>String(s).trim()).filter(Boolean):[];if(new Set(locations).size!==locations.length)throw fail('Give each camera position a different name.');
 const cameras=source.materials.filter(i=>/^((4K|5MP) bullet camera|(4K|5MP) dome camera|PTZ camera|Fisheye camera)$/i.test(i.name)).reduce((n,i)=>n+i.quantity,0);if(cameras&&locations.length!==cameras)throw fail('Add one camera position for each of the '+cameras+' cameras.');
 const equipment=source.materials.map(i=>i.quantity+' × '+i.name+(i.unit==='m'?' (metres)':i.unit==='pcs'?'':' ('+i.unit+')')).join('\n');
 const fresh=createJob({id:source.installationId,sourceId:source.sourceId,business:source.business,address:source.address,scope:source.scope,equipment,siteStaff:{name:site.name,phone},scheduledDate:date,assignees:[installer.id],supervisorIds:[site.id],locations,remoteIncluded:d.remoteIncluded===true,instructions:d.instructions||''},me,at,users);
 // Arrival is not the same as sending materials to the site. Reuse quantities, with zero issued.
 fresh.materials.items=source.materials.map(i=>({id:i.id,name:i.name,unit:i.unit==='m'?'metres':i.unit==='roll'?'rolls':i.unit==='box'?'boxes':i.unit==='sets'?'sets':'pieces',kind:'material',needed:i.quantity,issued:0,used:null,damaged:null,missing:null,returnedGood:0,returnedDamaged:0,checkedIssued:null,procurementUnit:i.unit}));
 const j=old?{...fresh,createdAt:old.createdAt,createdBy:old.createdBy,requests:[...old.requests],history:[...old.history],payHistory:[...(old.payHistory||[])],installerPayments:old.installerPayments||[],installerPaymentVoids:old.installerPaymentVoids||[],pilot:old.pilot||fresh.pilot,evidence:old.evidence||[],assignmentHistory:[...(old.assignmentHistory||[])]}:fresh;
 const paid=(j.installerPayments||[]).filter(p=>p.installerId===installer.id&&!(j.installerPaymentVoids||[]).some(v=>v.paymentId===p.id)).reduce((n,p)=>n+p.amount,0);if(amount<paid)throw fail('Agreed pay cannot be below what this installer has already received.');
 j.versions={...(old?.versions||{}),plan:(old?.versions?.plan||0)+1,assignment:(old?.versions?.assignment||0)+1};j.readyContactId=source.contactId;j.materialSourceId=source.materialSourceId;j.materialSnapshot=source.snapshot;j.sourceMaterials=source.materials;
 j.installerPay={...(old?.installerPay||{}),[installer.id]:{amount,currency:'UGX',by:me.id,at}};j.payHistory.push({id:cmd.requestId,by:me.id,at,payments:j.installerPay});
 j.assignment={installerId:installer.id,status:'pending',offeredBy:me.id,offeredByName:me.name,offeredAt:at};j.assignmentHistory||=[];j.assignmentHistory.push({...j.assignment});j.requests.push(cmd.requestId);j.history.push({id:cmd.requestId,action:'offerMaterials',by:me.id,name:me.name,at});return j;
}
