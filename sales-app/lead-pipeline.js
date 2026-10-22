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
 const phoneKey=v=>{let d=String(v||'').replace(/\D/g,'');return d.length>=9?d.slice(-9):'';};
 function check(data,records,id){
  if(String(data.business||'').trim().length<2)return 'Add the business or contact name.';
  if(!/^\+?\d[\d\s()-]{7,20}$/.test(String(data.phone||'').trim())||phoneKey(data.phone).length!==9)return 'Add a valid phone number so you can follow up.';
  if((records||[]).some(p=>p.id!==id&&phoneKey(p.phone)===phoneKey(data.phone)))return 'This phone number is already saved. Open the existing contact instead.';
  return '';
 }
 // Other reps' saved contacts survive older or scoped workspace writes.
 // Handovers are monotonic so an older phone cannot withdraw or undo routing.
 function guard(stored,incoming,user,appointments=[],jobs=[],now=new Date().toISOString()){
  const byId=new Map((stored||[]).map(p=>[p.id,p]));
  let out=(incoming||[]).filter(p=>!byId.has(p.id)||canSee(byId.get(p.id),user)).map(p=>{
   const prev=byId.get(p.id);let next={...p};
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
 root.VeriskoLeadPipeline={ownerKey,kampalaDay,followUpBucket,matchesFilters,latestFollowUp,isLead,own,routed,canSee,canManage,phoneKey,check,guard,STATUSES:['New contact','Following up','Not ready','Not interested']};
})(typeof window!=='undefined'?window:globalThis);
