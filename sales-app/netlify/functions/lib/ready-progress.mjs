// Queue progress is authoritative. Project it into the existing visit/pay screens.
export async function loadReadyCases(store){const out=[];for await(const page of store.list({prefix:'cases/',paginate:true})){for(const b of page.blobs){const c=await store.get(b.key,{type:'json'});if(c)out.push(c);}}return out;}
export function projectReady(data,cases){
 const out={...data,prospects:[...(data.prospects||[])],appointments:[...(data.appointments||[])]};
 for(const c of cases){if(!c.visit)continue;const index=out.prospects.findIndex(p=>p.id===c.contactId);if(index<0)continue;
 const p=out.prospects[index],v=c.visit,advanced=/^(Quoted|Won|Lost|Installed|Installation|Payment|Closed)/i.test(p.stage||'');
 out.prospects[index]={...p,leadOnly:false,leadConvertedAt:p.leadConvertedAt||v.confirmedAt,stage:advanced?p.stage:c.quoteSent?'Quote sent':v.doneAt?'Site visit done':'Appointment confirmed',readyProgress:c.quoteSent?'Quote sent':v.doneAt?'Visit done':'Visit confirmed'};
 const old=out.appointments.find(a=>a.id===v.id)||{};
 const appointment={...old,id:v.id,prospectId:c.contactId,readyCaseId:c.contactId,date:v.date,time:v.time,director:v.byName,status:v.doneAt?'Completed':'Confirmed',purpose:'Technical site survey',callConfirmedAt:v.confirmedAt,callConfirmedBy:v.byName,callConfirmedByEmail:v.byEmail,
 visitResult:v.doneAt?'real':'',visitResultAt:v.doneAt||'',visitResultBy:v.doneByName||'',visitResultByEmail:v.doneByEmail||'',visitResultReason:'',visitResultNote:v.doneNote||''};
 out.appointments=out.appointments.filter(a=>a.id!==v.id);out.appointments.push(appointment);
 }
 return out;
}
