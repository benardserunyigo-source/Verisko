// Server-side role policy. Identity comes from the current roster, never a client claim.
export const ROLES=['admin','operations','teamlead','sales','installer','supervisor'];
export const managedRoles=['sales','teamlead','installer'];
export const canManageMember=(actor,target,ownerId)=>!!actor&&!!target&&target.id!==ownerId&&target.id!==actor.id&&(actor.role==='admin'||actor.role==='operations'&&managedRoles.includes(target.role));
export const canAssignRole=(actor,role)=>actor?.role==='admin'?ROLES.includes(role):actor?.role==='operations'&&managedRoles.includes(role);
const userFields=['id','name','email','role','created','authMethod','phone','pinPhone','idStatus','idDueAt','idNote','idSubmittedAt'];
export const safeUser=u=>Object.fromEntries(userFields.filter(k=>u?.[k]!==undefined).map(k=>[k,u[k]]));
export function visibleRoster(users,actor){
 return (users||[]).map(u=>actor.role==='admin'||u.id===actor.id||actor.role==='operations'&&managedRoles.includes(u.role)?safeUser(u):{id:u.id,name:u.name,role:u.role});
}
export function guardRoster(stored,incoming,actor){
 const inc=Array.isArray(incoming)?incoming:[],byId=new Map(inc.filter(u=>u&&u.id).map(u=>[u.id,u])),ownerId=stored[0]?.id,out=[];
 for(const old of stored){
  if(!canManageMember(actor,old,ownerId)){out.push(old);continue;}
  const next=byId.get(old.id);if(!next){if(old.authMethod==='pin')out.push(old);continue;}
  // A roster save cannot alter login identity, ID checks or profile credentials.
  const role=canAssignRole(actor,next.role)&&!(old.authMethod==='pin'&&next.role==='admin')?next.role:old.role;
  out.push({...old,name:typeof next.name==='string'?next.name.trim().slice(0,100)||old.name:old.name,role});
 }
 const emails=new Set(out.map(u=>String(u.email||'').toLowerCase())),ids=new Set(stored.map(u=>u.id));
 for(const next of inc){
  if(!next||ids.has(next.id)||out.some(u=>u.id===next.id)||next.authMethod==='pin'||!canAssignRole(actor,next.role))continue;
  const email=String(next.email||'').trim().toLowerCase();if(!email||emails.has(email)||!/^\S+@\S+\.\S+$/.test(email))continue;
  if(typeof next.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(next.id))continue;
  out.push({id:next.id,name:String(next.name||'').trim().slice(0,100),email,role:next.role,created:next.created});emails.add(email);
 }
 return out;
}
export function guardCash(stored,incoming,actor){
 if(actor?.role==='admin')return incoming;
 if(actor?.role!=='operations')return stored;
 const byId=new Map(stored.map(t=>[t.id,t])),seen=new Set();const out=[];
 for(const t of incoming){if(!t?.id||seen.has(t.id))continue;seen.add(t.id);const old=byId.get(t.id);
  if(old?.status==='approved'){out.push(old);continue;}
  out.push({...t,status:old?.status||'pending',reviewedBy:old?.reviewedBy||'',reviewedAt:old?.reviewedAt||'',reviewNote:old?.reviewNote||'',approvedAt:old?.approvedAt||'',preapproved:old?.preapproved===true,createdBy:old?.createdBy||actor.name||'',createdByEmail:old?.createdByEmail||actor.email||''});
 }
 for(const old of stored)if(old.status==='approved'&&!seen.has(old.id))out.push(old);
 return out;
}
export async function checkPhotoLinks(stored,incoming,actor,receiptStore){
 const oldById=new Map((stored.prospects||[]).map(p=>[p.id,p]));
 if(!['sales','teamlead'].includes(actor?.role))return;
 for(const p of incoming.prospects||[]){const prior=oldById.get(p.id);if(!p?.photoId||p.photoId===prior?.photoId)continue;
  const owner=await receiptStore.get('owner/'+p.photoId,{type:'json'});
  if(owner?.userId!==actor.id||!['sales','teamlead'].includes(owner?.role))throw Object.assign(new Error('Use a business photo uploaded by your own account.'),{status:403});
 }
}
