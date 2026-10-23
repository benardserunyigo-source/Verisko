// Only workflow facts cross into Sales. Never copy pay, photos, GPS or supplier details.
export async function loadInstallationProgress(store){
 const out=[];for await(const page of store.list({prefix:'jobs/',paginate:true})){for(const b of page.blobs){const j=await store.get(b.key,{type:'json'});if(!j)continue;out.push({id:j.id,sourceId:j.sourceId||'',contactId:j.readyContactId||'',materialSourceId:j.materialSourceId||'',assignmentStatus:j.assignment?.status||'',status:j.status,scheduledDate:j.scheduledDate||'',updatedAt:j.completedAt||j.submittedAt||j.updatedAt||j.createdAt||'',workStarted:!!j.workLog?.length});}}
 return out;
}
export function contactInstallations(contactId,jobs=[],installations=[]){
 const quoteIds=new Set(jobs.filter(j=>j.prospectId===contactId).map(j=>j.id));
 return installations.filter(i=>i.contactId===contactId||i.sourceId&&quoteIds.has(i.sourceId)).flatMap(i=>{
 const stage=i.status==='Completed'?'Installation approved':i.status==='Submitted'?'Waiting for installation approval':i.status==='Needs correction'?'Installation needs fixing':i.assignmentStatus==='pending'?'Waiting for installer reply':i.assignmentStatus==='declined'?'Installer declined':i.status==='In progress'?(i.workStarted?'Installation in progress':'Installer assigned'):'';
 if(!stage)return [];return [{id:i.id,sourceId:i.sourceId,label:jobs.find(j=>j.id===i.sourceId)?.ref||'Installation',stage,scheduledDate:i.scheduledDate,updatedAt:i.updatedAt}];
 }).sort((a,b)=>String(a.updatedAt).localeCompare(String(b.updatedAt)));
}
