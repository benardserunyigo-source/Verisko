import './client-handover.js?v=151';
import './care-policy.js?v=151';
export const REVIEW_VERSION='2026-10-24-joint';
export const canReviewClient=(j,u)=>['admin','operations','teamlead'].includes(u?.role)&&(j.supervisorIds||[]).includes(u.id);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const text=(v,max=1000)=>typeof v==='string'?v.trim().slice(0,max):'';
export function clientSignature(input,name){
 if(input?.type==='typed'){
  const value=text(input.name,100);if(!value||value.toLocaleLowerCase()!==name.toLocaleLowerCase())throw fail('The client must type their full name to sign.');
  return {type:'typed',name:value};
 }
 if(input?.type!=='drawn'||!Array.isArray(input.strokes)||input.strokes.length>30)throw fail('Ask the client to sign, or choose Type name to sign.');
 let count=0;const strokes=input.strokes.map(s=>{if(!Array.isArray(s)||s.length>500)throw fail('Signature is too large. Clear it and sign again.');return s.map(p=>{count++;if(!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))throw fail('Invalid signature. Clear it and sign again.');return p.map(n=>Math.round(n*10000)/10000);});});
 const points=strokes.flat();if(count<6||count>2500||Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]))<.03)throw fail('Ask the client to add a full signature.');
 return {type:'drawn',strokes};
}
export function makeClientReview(job,data,user,at,source={}){
 if(!canReviewClient(job,user))throw fail('Only an assigned site supervisor can record client sign-off.',403);
 if(job.status!=='Completed')throw fail('Approve the installation checks before meeting the client.',409);
 if(job.clientReview?.outcome==='accepted')throw fail('This client handover is already signed.',409);
 if(!['accepted','fixes','unavailable'].includes(data.outcome))throw fail('Choose what the client said.');
 const base={version:REVIEW_VERSION,outcome:data.outcome,by:user.id,byName:user.name,byEmail:user.email||'',at,supervisorConfirmed:data.supervisorConfirmed===true};
 if(!base.supervisorConfirmed)throw fail('The site supervisor must confirm this handover.');
 if(data.outcome!=='accepted'){
  const issue=text(data.issue),nextAction=text(data.nextAction);if(!issue||!nextAction)throw fail('Record the problem or reason and the next action.');
  return {...base,issue,nextAction};
 }
 const name=text(data.name,100),role=text(data.role,100),date=text(data.date,10),today=new Date(Date.parse(at)+10800000).toISOString().slice(0,10);
 const checklist=Object.fromEntries(globalThis.VeriskoHandover.CHECKS.map(k=>[k,data.checklist?.[k]===true]));
 const acceptance={name,role,date,method:'In person',reference:'Joint site handover',confirmed:data.clientConfirmed===true};
 const errors=globalThis.VeriskoHandover.errors({checklist,clientHandover:acceptance},today);if(errors.length)throw fail(errors.join(' '));
 const signature=clientSignature(data.signature,name);
 const care={};for(const k of ['serviceStartDate','monitoringMiniPcRef','monitoringTestEvidence'])care[k]=text(data.care?.[k]??source[k]);care.monitoringCommissioned=data.care?.monitoringCommissioned===true||(data.care?.monitoringCommissioned===undefined&&source.monitoringCommissioned===true);
 const careErrors=globalThis.VeriskoCare.handoverErrors({...source,...care});if(careErrors.length)throw fail(careErrors.join(' '));
 if(care.serviceStartDate>today||care.serviceStartDate&&date<care.serviceStartDate)throw fail('Client sign-off must be on or after installation, and not in the future.');
 return {...base,name,role,date,checklist,clientConfirmed:true,signature,care};
}
export function publicClientReview(review){
 if(!review)return undefined;const out={...review};delete out.signature;delete out.evidenceBefore;delete out.workBefore;out.signatureRecorded=!!review.signature;return out;
}
