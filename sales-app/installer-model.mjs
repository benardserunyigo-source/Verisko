import {canReviewClient,makeClientReview} from './client-review.mjs?v=131';
import {initialMaterials,applyMaterialCommand,materialProblems,updateMaterialPlan} from './installer-materials.mjs?v=131';
export {materialBalance,materialProblems,stockManager,UNITS,initialMaterials} from './installer-materials.mjs?v=131';
// Shared installation workflow. Server applies commands, never client snapshots.
export const TESTS=['live','recording','playback','coverage','remote'];
export const PARTS=['cable','mount','tests'];
export const manager=u=>['admin','operations','teamlead'].includes(u?.role);
export const allowed=u=>manager(u)||u?.role==='installer';
// Site supervision is a job duty. Operations, Team Leads and Admin keep their normal role.
export const canSuperviseSite=u=>['admin','operations','teamlead'].includes(u?.role);
export const canRead=(j,u)=>['admin','operations'].includes(u?.role)||(['teamlead'].includes(u?.role)&&(j.supervisorIds||[]).includes(u.id))||(u?.role==='installer'&&j.assignees.includes(u.id));
export const reasons=['Obstruction','Damaged cable','Insufficient cable length','Changed route','Other'];
export const JOB_NEEDS=['Outside view','Inside view','Gate view','Parking view','Video recording','Phone viewing'];
export const MATERIALS=['4K bullet camera','4K dome camera','PTZ camera','NVR','Hard drive','Cat6 cable (metres)','RJ45 plug','Cable trunking (metres)','Junction box','Wall plugs and screws','UPS'];
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const text=(v,max=2000)=>String(v||'').trim().slice(0,max);
const requireText=(v,label)=>{const out=text(v);if(!out)throw fail(label+' is required.');return out;};
export const payReady=j=>j.assignees.length>0&&j.assignees.every(id=>Number.isSafeInteger(j.installerPay?.[id]?.amount)&&j.installerPay[id].amount>0);
export const crewPay=j=>j.assignees.reduce((sum,id)=>sum+(j.installerPay?.[id]?.amount||0),0);
export const PAYMENT_METHODS=['Mobile money','Cash','Bank transfer'];
export function installerPaymentSummary(j,id){
 const voided=new Set((j.installerPaymentVoids||[]).map(v=>v.paymentId));
 const paid=(j.installerPayments||[]).filter(p=>p.installerId===id&&!voided.has(p.id)).reduce((sum,p)=>sum+p.amount,0);
 const agreed=j.installerPay?.[id]?.amount||0;return {agreed,paid,balance:agreed-paid};
}
// Use the same projection for list, single-job and mutation responses.
export function installerJobView(j,user){
 const out=structuredClone(j);
 if(!canReviewClient(j,user)){
  if(out.clientReview)out.clientReview={outcome:out.clientReview.outcome,issue:out.clientReview.issue||'',nextAction:out.clientReview.nextAction||'',at:out.clientReview.at,byName:out.clientReview.byName,evidenceBefore:out.clientReview.evidenceBefore||[],workBefore:out.clientReview.workBefore||[]};
  delete out.clientReviewHistory;
 }
 delete out.contact;delete out.phone;out.payReady=payReady(j);
 if(!['admin','operations'].includes(user.role)){
  out.installerPay=user.role==='installer'&&out.installerPay?.[user.id]?{[user.id]:out.installerPay[user.id]}:{};
  out.installerPayments=(out.installerPayments||[]).filter(p=>user.role==='installer'&&p.installerId===user.id);
  const visibleIds=new Set(out.installerPayments.map(p=>p.id));out.installerPaymentVoids=(out.installerPaymentVoids||[]).filter(v=>visibleIds.has(v.paymentId));
  out.payHistory=(out.payHistory||[]).flatMap(h=>user.role==='installer'&&h.payments[user.id]?[{...h,payments:{[user.id]:h.payments[user.id]}}]:[]);
 }
 return out;
}
const has=(j,id,kind,cameraId)=>j.evidence.some(e=>e.id===id&&e.kind===kind&&e.cameraId===(cameraId||''));
const evidence=(j,ids,kind,cameraId)=>Array.isArray(ids)&&ids.length>0&&ids.every(id=>has(j,id,kind,cameraId));
export function readiness(j){
 const missing=materialProblems(j);
 if(j.clientReview?.outcome==='fixes'&&j.clientFix?.reviewAt!==j.clientReview.at)missing.push('Save the client fix and a new photo before sending the job back.');
 if(j.readyContactId&&(j.materials?.items||[]).some(i=>i.needed>0&&i.issued===0))missing.push('Operations must record what was taken to the site for each planned item.');
 if(j.assignment&&j.assignment.status!=='accepted')missing.push('The installer must accept this job before work can be submitted.');
 if(j.payRequired&&!(typeof j.payReady==='boolean'?j.payReady:payReady(j)))missing.push('Operations must set the agreed pay for each installer.');
 if(!j.pilot?.confirmed||!j.pilot.cableMethods||!j.pilot.weather||!j.pilot.mounting||!j.pilot.approvalCover||!j.pilot.backup)missing.push('Operations must confirm the work rules and who can approve changes.');
 if(!j.evidence.some(e=>e.kind==='reference'))missing.push('Operations must add a photo showing good mounting and cable work.');
 if(j.workLogRequired&&(!j.siteStaff?.name||!j.siteStaff?.phone))missing.push('Operations must add the Verisko staff name and phone for this site.');
 if(j.workLogRequired){for(const id of j.assignees){const logs=(j.workLog||[]).filter(x=>x.by===id);if(!logs.some(x=>x.finish)||logs.some(x=>!x.finish))missing.push('Installer '+id+': start work and finish work at the site.');}}
 if(!j.assignees.length||!j.scheduledDate)missing.push('Assign installers and a scheduled date.');
 j.cameras.forEach(c=>{
  const pre=c.name+': ';
  if(!c.cable?.route||!['yes','no'].includes(c.cable?.joins)||!j.evidence.some(e=>e.kind==='route'&&e.cameraId===c.id))missing.push(pre+'save the cable route, say if it has joins, and add photos before covering it.');
  const exceptions=j.exceptions.filter(e=>e.cameraId===c.id);
  if(c.cable?.joins==='yes'&&!exceptions.some(e=>e.type==='join'))missing.push(pre+'request approval for every join.');
  if(exceptions.some(e=>e.status!=='resolved'))missing.push(pre+'resolve cable exceptions with supervisor approval and evidence.');
  if(!c.mount?.fixings||!c.mount?.secured||!c.mount?.stability||!['mount','fixings','entry'].every(kind=>j.evidence.some(e=>e.kind===kind&&e.cameraId===c.id))||!j.evidence.some(e=>e.kind==='view'&&e.cameraId===c.id))missing.push(pre+'finish mounting checks and add close-up photos and the camera view.');
  TESTS.forEach(k=>{const t=c.tests?.[k];if(!t||!['pass','na'].includes(t.result)||(t.result==='na'&&(k!=='remote'||j.remoteIncluded||!t.note)))missing.push(pre+'complete '+k+' test'+(t?.result==='fail'?' and corrective action':'')+'.');});
  Object.values(c.corrections||{}).forEach(v=>{if(v.status==='open')missing.push(pre+'address returned item: '+v.comment);});
 });
 if(!j.handover?.demonstration||!j.evidence.some(e=>e.kind==='demo'&&!e.cameraId))missing.push('Show the Verisko site staff how it works and add a photo.');
 if(!j.handover?.issues)missing.push('List any problems left, or choose None.');
 if(!j.handover?.acknowledged&&!j.handover?.reason)missing.push('Record who checked the work, or say why no one could check it.');
 return missing;
}
// A small shared summary for the phone workflow and Operations review.
export function installationProgress(j){
 const missing=readiness(j),items=(j.materials?.items||[]).filter(i=>i.issued>0);
 return {missing,camerasDone:j.cameras.filter(c=>!missing.some(m=>m.startsWith(c.name+':'))).length,camerasTotal:j.cameras.length,materialsDone:items.filter(i=>materialProblems({...j,materials:{...j.materials,confirmed:true,items:[i]}}).length===0).length,materialsTotal:items.length};
}
export function createJob(input,user,now,staff=[]){
 if(!['admin','operations'].includes(user?.role))throw fail('Only Operations can create a job.',403);
 const locations=Array.isArray(input.locations)?input.locations.map(x=>text(x,100)).filter(Boolean):[];
 if(locations.some(x=>/^Camera \d+ · name location$/.test(x)))throw fail('Replace each placeholder with the actual camera location.');
 if(!locations.length||locations.length>64)throw fail('Name between 1 and 64 camera locations.');
 const supervisorIds=Array.isArray(input.supervisorIds)?[...new Set(input.supervisorIds)]:[];
 if(supervisorIds.some(id=>!staff.some(u=>u.id===id&&canSuperviseSite(u))))throw fail('Choose Operations, a Team Lead or Admin for this site.');
 const assignees=Array.isArray(input.assignees)?[...new Set(input.assignees)]:[];
 if(!assignees.length||assignees.some(id=>!staff.some(u=>u.id===id&&u.role==='installer')))throw fail('Assign at least one Installer account.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate||''))throw fail('Choose a scheduled date.');
 return {id:input.id,sourceId:text(input.sourceId,100),business:requireText(input.business,'Customer'),siteStaff:{name:requireText(input.siteStaff?.name,'Verisko staff name'),phone:requireText(input.siteStaff?.phone,'Verisko staff phone')},workLogRequired:true,workLog:[],payRequired:true,installerPay:{},payHistory:[],installerPayments:[],installerPaymentVoids:[],address:requireText(input.address,'Site address'),scope:requireText(input.scope,'Scope'),equipment:requireText(input.equipment,'Equipment list'),materials:initialMaterials(input.equipment),instructions:text(input.instructions),remoteIncluded:input.remoteIncluded===true,assignees,supervisorIds,scheduledDate:input.scheduledDate,status:'In progress',createdAt:now,createdBy:user.id,updatedAt:now,pilot:{approvalCover:'Operations'},cameras:[...new Set(locations)].map((name,i)=>({id:'camera-'+(i+1),name,versions:{},corrections:{}})),exceptions:[],evidence:[],handover:{},versions:{},history:[],requests:[],metrics:[]};
}
export function applyCommand(previous,cmd,user,now,source={}){
 if(cmd.action==='clientReview'&&!canReviewClient(previous,user))throw fail('Only an assigned site supervisor can record client sign-off.',403);
 const selfAssign=cmd.action==='superviseSelf'&&['admin','operations','teamlead'].includes(user?.role);
 if(!canRead(previous,user)&&!selfAssign)throw fail('This installation is not assigned to you.',403);
 if(!/^[a-zA-Z0-9-]{8,100}$/.test(cmd.requestId||''))throw fail('A unique request ID is required.');
 if(previous.requests.includes(cmd.requestId)){if(selfAssign&&(!(previous.supervisorIds||[]).includes(user.id)||!previous.history.some(h=>h.id===cmd.requestId&&h.by===user.id&&h.action==='superviseSelf')))throw fail('This request ID is already in use. Refresh and try again.',409);return previous;}
 const j=structuredClone(previous),supervisor=manager(user),c=j.cameras.find(x=>x.id===cmd.cameraId),data=cmd.data||{};
 if(['plan','pilot'].includes(cmd.action)&&!['admin','operations'].includes(user.role))throw fail('Supervisor access does not include job setup. Only Operations can change it.',403);
 if(['cable','mount','tests','exception','revise','resolve','handover','submit','clientFix'].includes(cmd.action)&&user.role!=='installer')throw fail('Only an assigned installer can save work checks.',403);
 const supervisorActions=['plan','pilot','decision','return','complete','metric'];
 if(supervisorActions.includes(cmd.action)&&!supervisor)throw fail('Supervisor access required.',403);
 if(j.status==='Completed'&&!['metric','workFinish','installerPayment','installerPaymentVoid','clientReview','handoverSupervisor'].includes(cmd.action))throw fail('Completed installation records are read-only.',409);
 if(j.status==='Submitted'&&!['superviseSelf','return','complete','metric','decision','workFinish','materialReceive','materialReturn','installerPay','installerPayment','installerPaymentVoid'].includes(cmd.action))throw fail('Supervisor review is pending. Return an item before editing.',409);
 if(user.role==='installer'&&j.assignment&&j.assignment.status!=='accepted'&&cmd.action!=='assignmentResponse')throw fail('Accept this job before recording work.',409);
 const checkVersion=(obj,key)=>{if(cmd.baseVersion!==(obj.versions?.[key]||0))throw fail('This item changed on another device. Review the latest record before retrying.',409);obj.versions[key]=(obj.versions[key]||0)+1;};
 if(cmd.action==='clientReview'){
  checkVersion(j,'clientReview');const review=makeClientReview(j,data,user,now,source);
  if(review.outcome==='fixes'){review.evidenceBefore=j.evidence.map(e=>e.id);review.workBefore=(j.workLog||[]).map(w=>w.id);}
  j.clientReviewHistory||=[];j.clientReviewHistory.push(review);j.clientReview=review;
  if(review.outcome==='fixes')j.status='Needs correction';
 }else if(cmd.action==='handoverSupervisor'){
  if(!['admin','operations'].includes(user.role))throw fail('Only Operations can assign the site supervisor.',403);
  if(j.clientReview?.outcome==='accepted')throw fail('This client handover is already signed.',409);
  checkVersion(j,'plan');if(!data.supervisorId)throw fail('Choose the site supervisor.');
  j.supervisorIds=[...new Set([...(j.supervisorIds||[]),data.supervisorId])];
 }else if(cmd.action==='clientFix'){
  if(j.status!=='Needs correction'||j.clientReview?.outcome!=='fixes')throw fail('There is no open client fix.',409);
  checkVersion(j,'clientFix');
  if(!evidence(j,data.photos,'demo')||data.photos.some(id=>(j.clientReview.evidenceBefore||[]).includes(id)||j.evidence.find(e=>e.id===id)?.at<j.clientReview.at))throw fail('Add a new photo of the client fix.');
  if(j.workLogRequired&&!(j.workLog||[]).some(w=>w.by===user.id&&w.finish&&!(j.clientReview.workBefore||[]).includes(w.id)))throw fail('Start and finish the fix visit before saving the client fix.');
  j.clientFix={note:requireText(data.note,'What you fixed'),photos:data.photos,reviewAt:j.clientReview.at,by:user.id,at:now};
 }else if(cmd.action==='assignmentResponse'){
  if(user.role!=='installer'||j.assignment?.installerId!==user.id)throw fail('Only the offered installer can reply.',403);
  if(j.assignment.status!=='pending')throw fail('You have already replied to this job.',409);
  if(!['accepted','declined'].includes(data.status))throw fail('Choose Accept or Decline.');
  const note=data.status==='declined'?requireText(data.note,'Reason for declining'):'';checkVersion(j,'assignment');
  j.assignment={...j.assignment,status:data.status,note,respondedBy:user.id,respondedAt:now};j.assignmentHistory=[...(j.assignmentHistory||[]),{...j.assignment}];
 }else if(cmd.action==='superviseSelf'){
  if(!selfAssign)throw fail('Only Operations, Admin or a Team Lead can assign themselves as site supervisor.',403);
  checkVersion(j,'plan');j.supervisorIds=[...new Set([...(j.supervisorIds||[]),user.id])];
 }else if(cmd.action==='installerPayment'||cmd.action==='installerPaymentVoid'){
  if(!['admin','operations'].includes(user.role))throw fail('Only Operations can record installer payments.',403);
  checkVersion(j,'installerPay');j.installerPayments||=[];j.installerPaymentVoids||=[];
  if(cmd.action==='installerPayment'){
   if(!j.installerPay?.[data.installerId])throw fail('Set the agreed pay for this installer first.');
   const amount=data.amount;if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<=0)throw fail('Enter a whole UGX payment above zero.');
   if(amount>installerPaymentSummary(j,data.installerId).balance)throw fail('Payment is more than the balance left. Check the agreed pay and earlier payments.');
   const paidOn=String(data.paidOn||''),date=new Date(paidOn+'T00:00:00Z'),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Kampala',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
   if(!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==paidOn||paidOn<'2000-01-01'||paidOn>today)throw fail('Choose the date you paid. It cannot be in the future.');
   if(!PAYMENT_METHODS.includes(data.method))throw fail('Choose how you paid.');
   const reference=text(data.reference,120);if(data.method!=='Cash'&&!reference)throw fail('Add the mobile money or bank payment reference.');
   const voided=new Set(j.installerPaymentVoids.map(v=>v.paymentId));
   if(reference&&j.installerPayments.some(p=>p.installerId===data.installerId&&p.method===data.method&&p.reference.toLowerCase()===reference.toLowerCase()&&!voided.has(p.id)))throw fail('This payment reference is already recorded. Check the payment history.',409);
   j.installerPayments.push({id:cmd.requestId,installerId:data.installerId,amount,currency:'UGX',paidOn,method:data.method,reference,note:text(data.note),by:user.id,at:now});
  }else{
   const payment=j.installerPayments.find(p=>p.id===data.paymentId);if(!payment)throw fail('Payment record not found.');
   if(j.installerPaymentVoids.some(v=>v.paymentId===payment.id))throw fail('This payment entry has already been cancelled.',409);
   j.installerPaymentVoids.push({id:cmd.requestId,paymentId:payment.id,reason:requireText(data.reason,'Reason for correcting this entry'),by:user.id,at:now});
  }
 }else if(cmd.action==='installerPay'){
  if(!['admin','operations'].includes(user.role))throw fail('Only Operations can set installer pay.',403);
  if(j.readyContactId&&!(j.workLog||[]).length)throw fail('Use Materials & buying to change the offered pay.',409);
  checkVersion(j,'installerPay');
  if(!Array.isArray(data.payments)||!data.payments.length)throw fail('Enter the agreed pay for the installer.');
  const payments={};for(const p of data.payments){
   if(!j.assignees.includes(p.installerId)||Object.hasOwn(payments,p.installerId))throw fail('Choose each assigned installer once.');
   if(typeof p.amount!=='number'||!Number.isSafeInteger(p.amount)||p.amount<=0||p.amount>100000000)throw fail('Enter a whole UGX amount above zero, up to 100,000,000.');
   if(p.amount<installerPaymentSummary(j,p.installerId).paid)throw fail('Agreed pay cannot be less than the payments already recorded.');
   payments[p.installerId]={amount:p.amount,currency:'UGX',note:text(p.note),by:user.id,at:now};
  }
  j.installerPay={...(j.installerPay||{}),...payments};j.payHistory=[...(j.payHistory||[]),{id:cmd.requestId,by:user.id,at:now,payments}];j.payRequired=true;delete j.payReady;
 }else if(String(cmd.action||'').startsWith('material')){
  if(cmd.action==='materialIssue'&&j.assignment&&j.assignment.status!=='accepted')throw fail('Wait for the installer to accept before sending site materials.',409);
  checkVersion(j,'materials');applyMaterialCommand(j,cmd,user,now);
 }else if(cmd.action==='workStart'||cmd.action==='workFinish'){
  if(user.role!=='installer'||!j.assignees.includes(user.id))throw fail('Only an assigned installer can start or finish work.',403);
  const point=data.location||{},at=Date.parse(data.capturedAt),received=Date.parse(now);
  if(typeof point.lat!=='number'||!Number.isFinite(point.lat)||Math.abs(point.lat)>90||typeof point.lng!=='number'||!Number.isFinite(point.lng)||Math.abs(point.lng)>180||typeof point.accuracy!=='number'||!Number.isFinite(point.accuracy)||point.accuracy<0||point.accuracy>1000||!Number.isFinite(at)||at>received+300000||received-at>30*86400000)throw fail('Get a fresh location. Move outside if the GPS signal is weak.');
  j.workLog||=[];const open=j.workLog.find(x=>x.by===user.id&&!x.finish);
  const mark={location:{lat:point.lat,lng:point.lng,accuracy:point.accuracy},capturedAt:new Date(at).toISOString(),receivedAt:now};
  if(cmd.action==='workStart'){if(!j.installerPay?.[user.id]?.amount)throw fail('Operations must set your agreed pay before you start work.');if(open)throw fail('You have already started work.',409);j.workLog.push({id:cmd.requestId,by:user.id,name:user.name,start:mark});}
  else {if(!open)throw fail('Start work before you finish.',409);if(at<Date.parse(open.start.capturedAt))throw fail('Finish time must be after start time.');open.finish=mark;}
  j.workLogRequired=true;
 }else if(cmd.action==='pilot'){
  checkVersion(j,'pilot');j.pilot={cableMethods:requireText(data.cableMethods,'Acceptable cable methods'),weather:requireText(data.weather,'Weather protection'),mounting:requireText(data.mounting,'Mounting guidance'),approvalCover:requireText(data.approvalCover,'Approval cover'),backup:requireText(data.backup,'Backup approval cover'),confirmed:data.confirmed===true,by:user.id,at:now};
 }else if(cmd.action==='plan'){
  if(j.readyContactId&&(JSON.stringify(data.assignees)!==JSON.stringify(j.assignees)||data.scheduledDate!==j.scheduledDate||data.equipment!==undefined&&data.equipment!==j.equipment))throw fail('Use Materials & buying to offer this job to another installer.',409);
  if(j.assignment&&data.scheduledDate!==j.scheduledDate&&!(j.workLog||[]).length){j.assignment={...j.assignment,status:'pending',offeredAt:now,offeredBy:user.id,offeredByName:user.name};j.versions.assignment=(j.versions.assignment||0)+1;}
  checkVersion(j,'plan');if(!Array.isArray(data.assignees)||!data.assignees.length)throw fail('Assign installers.');if(!/^\d{4}-\d{2}-\d{2}$/.test(data.scheduledDate||''))throw fail('Choose a scheduled date.');if((j.workLog||[]).some(x=>!x.finish&&!data.assignees.includes(x.by)))throw fail('Let the installer finish work before removing them from this job.',409);j.assignees=[...new Set(data.assignees)];j.scheduledDate=requireText(data.scheduledDate,'Scheduled date');j.instructions=text(data.instructions);if(data.supervisorIds!==undefined){if(!Array.isArray(data.supervisorIds))throw fail('Choose supervisors.');j.supervisorIds=[...new Set(data.supervisorIds)];}if(data.siteStaff)j.siteStaff={name:requireText(data.siteStaff.name,'Verisko staff name'),phone:requireText(data.siteStaff.phone,'Verisko staff phone')};if(data.scope!==undefined)j.scope=requireText(data.scope,'Job needs');if(data.equipment!==undefined){j.equipment=requireText(data.equipment,'Materials');updateMaterialPlan(j,j.equipment);}j.workLogRequired=true;j.payRequired=true;
 }else if(cmd.action==='evidence'){
  // The endpoint validates and stores bytes first. Photos are append-only.
  const e={...data,cameraId:cmd.cameraId||''};if(!['route','mount','fixings','entry','view','exception','resolution','reference','demo','ack'].includes(e.kind)||!e.id||!e.hash)throw fail('Invalid evidence.');
  if(e.cameraId&&!c)throw fail('Camera location not found.');
  if(e.kind==='reference'&&!supervisor)throw fail('Only supervisors approve reference examples.',403);
  if(j.evidence.some(x=>x.id===e.id&&x.hash!==e.hash))throw fail('Evidence ID collision.',409);
  if(!j.evidence.some(x=>x.id===e.id))j.evidence.push({id:e.id,hash:e.hash,kind:e.kind,cameraId:e.cameraId||'',caption:text(e.caption,300),by:user.id,at:now});
 }else if(['cable','mount','tests'].includes(cmd.action)){
  if(!c)throw fail('Camera location not found.');checkVersion(c,cmd.action);
  if(cmd.action==='cable'){
   if(!['yes','no'].includes(data.joins))throw fail('Declare whether cable joins exist.');
   if(data.joins==='no'&&j.exceptions.some(e=>e.cameraId===c.id&&e.type==='join'&&(e.status!=='resolved'||e.resolution?.joinInstalled!==false)))throw fail('A declared join cannot be removed. Ask the supervisor to review it.');
   c.cable={route:requireText(data.route,'Planned cable route'),joins:data.joins,photos:data.photos||[]};
  }else if(cmd.action==='mount')c.mount={fixings:data.fixings===true,secured:data.secured===true,stability:data.stability===true,photos:data.photos||[],views:data.views||[]};
  else {const tests={};TESTS.forEach(k=>{const t=data[k]||{};if(!['pass','fail','na'].includes(t.result))throw fail('Record a result for '+k+'.');if(t.result==='na'&&(k!=='remote'||j.remoteIncluded))throw fail('Only remote access outside scope can be not applicable.');if(t.result!=='pass'&&!text(t.note))throw fail('Add a description for '+k+'.');if(t.result==='fail'&&!text(t.action))throw fail('Add corrective action for '+k+'.');tests[k]={result:t.result,note:text(t.note),action:text(t.action)};});c.tests=tests;}
  if(c.corrections[cmd.action]){
   const correction=c.corrections[cmd.action];const note=requireText(data.correctionNote,'How the returned item was corrected');
   if(['cable','mount'].includes(cmd.action)&&!j.evidence.some(e=>e.cameraId===c.id&&!correction.evidenceBefore.includes(e.id)&&(cmd.action==='cable'?e.kind==='route':['mount','fixings','entry','view'].includes(e.kind))))throw fail('Add new evidence of the corrected work.');
   c.corrections[cmd.action]={...correction,status:'addressed',resolution:note,addressedBy:user.id,addressedAt:now};
  }
  if(j.status==='Needs correction')j.status='In progress';
 }else if(cmd.action==='exception'){
  if(!c)throw fail('Camera location not found.');
  if(!['join','problem'].includes(data.type)||!reasons.includes(data.reason))throw fail('Choose the exception type and reason.');
  if(!evidence(j,data.photos,'exception',c.id))throw fail('Upload an exception photo first.');
  const e={id:cmd.requestId,cameraId:c.id,type:data.type,reason:data.reason,description:requireText(data.description,'Reason detail'),location:requireText(data.location,'Connection/problem location'),proposal:requireText(data.proposal,'Proposed solution'),photos:data.photos,status:'pending',requestedBy:user.id,requestedAt:now,decisions:[]};j.exceptions.push(e);
  if(data.type==='join')c.cable={...(c.cable||{}),joins:'yes'};
 }else if(cmd.action==='revise'){
  const e=j.exceptions.find(x=>x.id===cmd.exceptionId);if(!e||e.status!=='correction')throw fail('Only a returned exception can be revised.');
  if(!evidence(j,data.photos,'exception',e.cameraId))throw fail('Upload evidence of the revised proposal.');
  const previousPhotos=[...e.photos,...(e.revisions||[]).flatMap(x=>x.photos)];if(!data.photos.some(id=>!previousPhotos.includes(id)))throw fail('Add a new photo showing the revised proposal.');
  e.revisions=[...(e.revisions||[]),{proposal:requireText(data.proposal,'Revised proposal'),photos:data.photos,by:user.id,at:now}];e.status='pending';e.waitingSince=now;
 }else if(cmd.action==='decision'){
  const e=j.exceptions.find(x=>x.id===cmd.exceptionId);if(!e)throw fail('Exception not found.');
  if(!['approved','correction'].includes(data.decision))throw fail('Choose a decision.');
  const comment=requireText(data.comment,'Approval method or correction instructions');
  e.status=data.decision;e.decisions.push({decision:data.decision,comment,by:user.id,at:now});
 }else if(cmd.action==='resolve'){
  const e=j.exceptions.find(x=>x.id===cmd.exceptionId);if(!e||e.status!=='approved')throw fail('Supervisor approval is required before resolving this exception.');
  if(!evidence(j,data.photos,'resolution',e.cameraId))throw fail('Upload the approved work evidence first.');
  if(data.photos.some(id=>j.evidence.find(p=>p.id===id)?.at<e.decisions.at(-1).at)||j.exceptions.some(x=>x.id!==e.id&&x.resolution?.photos.some(id=>data.photos.includes(id))))throw fail('Capture new evidence of this approved work.');
  e.resolution={note:requireText(data.note,'Work performed'),photos:data.photos,joinInstalled:e.type==='join'?data.joinInstalled!==false:false,by:user.id,at:now};e.status='resolved';
  if(e.type==='join'){const camera=j.cameras.find(c=>c.id===e.cameraId);camera.cable={...camera.cable,joins:j.exceptions.some(x=>x.cameraId===e.cameraId&&x.type==='join'&&(x.status!=='resolved'||x.resolution?.joinInstalled!==false))?'yes':'no'};}

 }else if(cmd.action==='handover'){
  checkVersion(j,'handover');j.handover={demonstration:requireText(data.demonstration,'Site staff demonstration'),photos:data.photos||[],issues:requireText(data.issues,'Problems left, or None'),acknowledged:data.acknowledged===true,customerName:text(data.customerName,100),reason:text(data.reason),at:now,by:user.id};
  if(j.handover.acknowledged&&!j.handover.customerName)throw fail('Record who acknowledged the handover.');
 }else if(cmd.action==='submit'||cmd.action==='complete'){
  const missing=[...readiness(j),...(cmd.action==='complete'?materialProblems(j,true):[])];if(missing.length)throw fail(missing.join('\n'));
  if(cmd.action==='complete'&&j.status!=='Submitted')throw fail('The job must be submitted for technical review first.');
  j.status=cmd.action==='submit'?'Submitted':'Completed';j[cmd.action==='submit'?'submittedAt':'completedAt']=now;
  if(cmd.action==='complete')j.approval={by:user.id,at:now,comment:requireText(data.comment,'Technical review comment')};
 }else if(cmd.action==='return'){
  const part=cmd.part;if(!c||!PARTS.includes(part))throw fail('Choose the camera item to return.');
  c.corrections[part]={status:'open',comment:requireText(data.comment,'Correction instructions'),by:user.id,at:now,evidenceBefore:j.evidence.map(e=>e.id)};
  c.versions[part]=(c.versions[part]||0)+1;j.status='Needs correction';
 }else if(cmd.action==='metric'){
  if(!['Return visit','Cable replacement','On-site inspection','Completion time (minutes)'].includes(data.type))throw fail('Choose a pilot metric.');
  const value=Number(data.value);if(!Number.isFinite(value)||value<0)throw fail('Enter a valid quantity or time.');j.metrics.push({id:cmd.requestId,type:data.type,value,note:requireText(data.note,'Pilot note'),by:user.id,at:now});
 }else throw fail('Unknown installation action.');
 j.updatedAt=now;j.history.push({id:cmd.requestId,action:cmd.action,cameraId:cmd.cameraId||'',exceptionId:cmd.exceptionId||'',part:cmd.part||'',decision:cmd.action==='decision'?data.decision:'',by:user.id,name:user.name,at:now,detail:['return','decision','complete'].includes(cmd.action)?text(data.comment):''});j.requests.push(cmd.requestId);return j;
}
