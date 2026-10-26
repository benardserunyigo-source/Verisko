// A saved contact is not a site booking. One record is retained through handover.
(function(root){
 'use strict';
 const lc=v=>String(v||'').toLowerCase(), isLead=p=>!!p&&p.leadOnly===true;
 const own=(p,u)=>!!u?.email&&lc(p?.createdByEmail)===lc(u.email);
 const routed=(p,u)=>!!p?.handoffAt&&['admin','operations'].includes(u?.role);
 const canSee=(p,u)=>!isLead(p)||own(p,u)||['admin','operations'].includes(u?.role);
 const canManage=(p,u)=>isLead(p)&&['admin','operations'].includes(u?.role);
 // Capture time, not append/upload order, determines the latest conversation.
 function latestFollowUp(p){
  return (Array.isArray(p?.followUps)?p.followUps:[]).filter(f=>f&&Number.isFinite(Date.parse(f.at))).reduce((latest,f)=>!latest||Date.parse(f.at)>=Date.parse(latest.at)?f:latest,null);
 }
 const ownerKey=p=>lc(p?.createdByEmail)||(p?.createdBy?'name:'+lc(p.createdBy):'unknown');
 function kampalaDay(now=Date.now()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Kampala',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
  const part=type=>parts.find(p=>p.type===type).value;return part('year')+'-'+part('month')+'-'+part('day');
 }
 function followUpBucket(p,today=kampalaDay()){
  const due=String(p?.followUp||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due+'T12:00:00Z')))return 'unscheduled';
  return due===today?'today':due<today?'overdue':'upcoming';
 }
 function matchesFilters(p,{owner='',due='',today=kampalaDay()}={}){
  return (!owner||ownerKey(p)===owner)&&(!due||followUpBucket(p,today)===due);
 }
 // Summary is deliberately independent of the contact-list filters.
 function salespersonSummary(records,users=[],today=kampalaDay()){
  const rows=new Map(), roster=new Map(users.filter(u=>u.email).map(u=>[lc(u.email),u]));
  const nameKeys=new Map();
  users.forEach(u=>{if(u.name){const k=lc(u.name);nameKeys.set(k,nameKeys.has(k)?null:lc(u.email));}});
  const ensure=(key,name)=>{if(!rows.has(key))rows.set(key,{key,name:roster.get(key)?.name||name||'Not recorded',contacts:0,followUps:0,today:0,overdue:0});return rows.get(key);};
  users.filter(u=>['sales','teamlead'].includes(u.role)&&u.email).forEach(u=>ensure(lc(u.email),u.name));
  const contacts=(records||[]).filter(isLead);
  contacts.forEach(p=>{
   const row=ensure(ownerKey(p),p.createdBy);row.contacts++;
   const bucket=followUpBucket(p,today);if(bucket==='today'||bucket==='overdue')row[bucket]++;
  });
  contacts.forEach(p=>{
   const seen=new Set();
   (Array.isArray(p.followUps)?p.followUps:[]).forEach(f=>{
    if(!f||!Number.isFinite(Date.parse(f.at)))return;
    const key=lc(f.byEmail)||(f.by?(nameKeys.get(lc(f.by))||'name:'+lc(f.by)):'');
    const actor=roster.get(key);
    if(!key||(actor&&!['sales','teamlead'].includes(actor.role)))return;
    // Legacy names can match a creator only when that name is unambiguous.
    let row=rows.get(key);
    if(!row&&!f.byEmail&&f.by){const matches=[...rows.values()].filter(r=>lc(r.name)===lc(f.by));if(matches.length===1)row=matches[0];}
    if(!row&&f.role&&!['sales','teamlead'].includes(f.role))return;
    if(!row)row=ensure(key,f.by);
    const signature=JSON.stringify([f.at,key,f.note||'',f.outcome||'',f.voiceNoteId||'']);
    if(seen.has(signature))return;seen.add(signature);row.followUps++;
   });
  });
  return [...rows.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.key.localeCompare(b.key));
 }
 const phoneKey=v=>{let d=String(v||'').replace(/\D/g,'');return d.length>=9?d.slice(-9):'';};
 const deferred=p=>p?.leadStatus==='Not ready';
 function deferredError(p){
  if(!deferred(p))return '';
  if(String(p.deferredReason||'').trim().length<3)return 'Add why this contact is waiting.';
  const day=String(p.followUp||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T12:00:00Z'))||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day)return 'Choose a valid follow-up date.';
  return '';
 }
 // Rules use saved dates and ownership, never a guessed chance of winning.
 function health(p,c,today=kampalaDay()){
  const result=(key,label,reason)=>({key,label,reason});
  if(c?.state!=='returned'&&c?.firstPayment?.status==='approved')return result('paid','Client paid','Payment approved. Follow the job progress.');
  if(p.stage==='Lost'||p.leadStatus==='Not interested')return result('closed','Not going ahead','Keep the record and its history.');
  const bucket=followUpBucket(p,today);
  if(deferred(p)&&(!c||c.state==='returned')){
   if(deferredError(p))return result('attention','Needs attention',deferredError(p));
   if(bucket==='overdue')return result('attention','Needs attention','Deferred contact: follow-up is overdue.');
   if(bucket==='today')return result('today','Follow up today','Deferred contact is due today.');
   return result('deferred','Deferred',deferredError(p)||p.deferredReason);
  }
  if(c&&c.state!=='returned'){
   if(c.firstPayment?.status==='query')return result('attention','Needs attention','The payment was sent back. Check the reason.');
   if(c.visit?.onHoldAt)return result('attention','Needs attention','Agree a new visit date with the client.');
   if(!c.ownerId)return result('attention','Needs attention','The visit team needs to take this contact.');
   if(c.visit&&!c.visit.doneAt&&!c.visit.onHoldAt){
    if(c.visit.date<today)return result('attention','Needs attention','Visit date passed. Record what happened.');
    if(c.visit.date===today)return result('today','Visit today','Confirm the visit or record it as done.');
    return result('track','On track','Site visit has a date and owner.');
   }
   if(c.firstPayment?.status==='pending')return result('waiting','Waiting for approval','Admin needs to check the payment.');
  }
  if(bucket==='overdue')return result('attention','Needs attention','Follow-up is overdue.');
  if(bucket==='today')return result('today','Follow up today',p.nextAction||'Call and record the next step.');
  if(bucket==='unscheduled')return result('attention','Needs attention','Set the next follow-up date.');
  return result('track','On track','The next follow-up has a date.');
 }
 function stage(p,c){
  if(c?.state==='returned')return deferred(p)?'Deferred':'Back for follow-up';
  if(c?.firstPayment?.status==='approved')return 'Client paid';
  if(p.stage==='Lost'||p.leadStatus==='Not interested')return 'Not going ahead';
  if(c?.firstPayment)return 'Payment being checked';
  if(c?.quoteSent)return 'Quote sent';
  if(c?.visit?.doneAt)return 'Visit done';
  if(c?.visit?.onHoldAt)return 'Visit needs a new date';
  if(c?.visit)return 'Visit booked';
  if(c)return 'Waiting for visit team';
  return deferred(p)?'Deferred':'Talking to client';
 }
 function stageSummary(records,cases=[]){const counts={},seen=new Set();(records||[]).forEach(p=>{if(!p?.id||seen.has(p.id))return;seen.add(p.id);const label=stage(p,cases.find(c=>c.contactId===p.id));counts[label]=(counts[label]||0)+1;});return counts;}
 function healthSummary(records,cases=[],today=kampalaDay()){
  const totals={track:0,today:0,attention:0,deferred:0,waiting:0,paid:0,closed:0};
  const seen=new Set();(records||[]).forEach(p=>{if(!p?.id||seen.has(p.id))return;seen.add(p.id);const c=cases.find(c=>c.contactId===p.id),h=health(p,c,today);totals[h.key]++;if(deferred(p)&&(!c||c.state==='returned')&&h.key!=='deferred')totals.deferred++;});return totals;
 }
 function check(data,records,id){
  if(String(data.business||'').trim().length<2)return 'Add the business or contact name.';
  if(!/^\+?\d[\d\s()-]{7,20}$/.test(String(data.phone||'').trim())||phoneKey(data.phone).length!==9)return 'Add a valid phone number so you can follow up.';
  if((records||[]).some(p=>p.id!==id&&phoneKey(p.phone)===phoneKey(data.phone)))return 'This phone number is already saved. Open the existing contact instead.';
  return deferredError(data);
 }
 // Other reps' saved contacts survive older or scoped workspace writes.
 // Handovers are monotonic so an older phone cannot withdraw or undo routing.
 function guard(stored,incoming,user,appointments=[],jobs=[],now=new Date().toISOString()){
  const byId=new Map((stored||[]).map(p=>[p.id,p]));
  let out=(incoming||[]).filter(p=>!byId.has(p.id)||canSee(byId.get(p.id),user)).map(p=>{
   const prev=byId.get(p.id);let next={...p};
   if(deferred(next)&&(!prev||['leadStatus','deferredReason','followUp'].some(k=>next[k]!==prev[k]))){const error=deferredError(next);if(error)throw new Error(error);}
   if(prev&&!isLead(prev)&&isLead(next))next={...next,leadOnly:false,leadConvertedAt:prev.leadConvertedAt||'',stage:prev.stage,reviewStatus:prev.reviewStatus,handoffTo:prev.handoffTo,handoffAt:prev.handoffAt};
   if(isLead(prev)){
    next={...next,createdByEmail:prev.createdByEmail,createdBy:prev.createdBy,created:prev.created};
    // Converting requires an explicit action by the receiving team.
    if(!isLead(next)&&(!next.leadConvertedAt||!canManage(prev,user)))next={...next,leadOnly:true,leadConvertedAt:''};
    if(isLead(next)&&prev.handoffAt&&(!next.handoffTo||!next.handoffAt||next.handoffAt<prev.handoffAt))next={...next,handoffAt:prev.handoffAt,handoffTo:prev.handoffTo,handoffBy:prev.handoffBy,handoffByEmail:prev.handoffByEmail,handoffNote:prev.handoffNote};
   }
   if(isLead(next)){
    if(!prev||phoneKey(prev.phone)!==phoneKey(next.phone)){
     const duplicate=(stored||[]).some(x=>x.id!==next.id&&phoneKey(x.phone)===phoneKey(next.phone));
     const error=check(next,[],next.id);if(error||duplicate)throw new Error(duplicate?'This phone is already recorded. Ask your manager to check the existing contact.':error);
    }
    const legacyManager=next.handoffTo==='manager'&&prev?.handoffTo==='manager';
    if(legacyManager)next.handoffTo='operations';
    if(next.handoffTo&&next.handoffTo!=='operations')throw new Error('Send handovers to Operations only.');
    const changed=(!legacyManager&&next.handoffTo!==prev?.handoffTo)||next.handoffAt!==prev?.handoffAt;
    if(!changed&&prev?.handoffAt)next={...next,handoffBy:prev.handoffBy,handoffByEmail:prev.handoffByEmail};
    if(changed&&next.handoffTo){
     if(prev&&!own(prev,user)&&!canManage(prev,user))throw new Error('Only the lead owner or receiving team can hand it over.');
     next={...next,handoffAt:now,handoffBy:user.name||'',handoffByEmail:lc(user.email)};
    }
    next={...next,stage:'New prospect',reviewStatus:'draft',qualStatus:'',closedSale:false,closedAuto:false};
   }else if(isLead(prev))next={...next,leadConvertedAt:now,leadOnly:false,reviewStatus:'pending'};
   return next;
  });
  const ids=new Set(out.map(p=>p.id));
  (stored||[]).forEach(p=>{if(!ids.has(p.id)&&isLead(p)&&(!own(p,user)||p.handoffAt))out.push(p);});
  const changed=out.filter(p=>isLead(p)&&(!byId.has(p.id)||phoneKey(byId.get(p.id).phone)!==phoneKey(p.phone)));
  if(changed.some(p=>out.some(x=>x.id!==p.id&&phoneKey(x.phone)===phoneKey(p.phone))))throw new Error('This phone is already recorded. Open the existing contact instead.');
  const leads=new Set(out.filter(isLead).map(p=>p.id));
  if(appointments.some(a=>leads.has(a.prospectId))||jobs.some(j=>leads.has(j.prospectId)))throw new Error('Move the saved lead to Prospects before creating a visit or quote.');
  return out;
 }
 root.VeriskoLeadPipeline={stage,stageSummary,deferred,deferredError,health,healthSummary,salespersonSummary,ownerKey,kampalaDay,followUpBucket,matchesFilters,latestFollowUp,isLead,own,routed,canSee,canManage,phoneKey,check,guard,STATUSES:['New contact','Following up','Not ready','Not interested']};
})(typeof window!=='undefined'?window:globalThis);
