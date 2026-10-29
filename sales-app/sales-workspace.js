/* Sales uses the same saved contacts and server queue; this is display only. */
(function(root){
 'use strict';
 const own=(p,u)=>!!u?.email&&String(p?.createdByEmail||'').toLowerCase()===u.email.toLowerCase();
 const returned=c=>c?.state==='returned';
 function canSend(p,c,u){return p.leadStatus!=='Not ready'&&own(p,u)&&(p.leadOnly===true||returned(c))&&(!c||returned(c));}
 function progress(c,p={}){
  if(returned(c))return 'Needs your follow-up';
  if(c?.installationProgress?.length)return c.installationProgress.at(-1).stage;
  if(c?.firstPayment)return c.firstPayment.status==='approved'?'Client paid':c.firstPayment.status==='query'?'Team is checking the payment':'Payment waiting for approval';
  if(p.planProgress&&(!c||c.state!=='returned'&&c.quoteSent?.sourceId===p.planProgress.sourceId))return p.planProgress.status==='approved'?'Payment plan approved':'Client chose a plan';
  if(c?.quoteSent)return 'Quote sent';if(c?.visit?.doneAt)return 'Site visit done';if(c?.visit?.onHoldAt)return 'Waiting for a new visit time';if(c?.visit)return 'Site visit booked';if(c)return 'Sent for site visit';
  return p.readyProgress||(p.leadStatus==='Not ready'?'Deferred':p.leadStatus)||'Follow up';
 }
 function returnReason(c){return returned(c)?[...(c.history||[])].reverse().find(h=>['returned','returned_to_sales'].includes(h.type))?.note||'Please follow up with this contact.':'';}
 function contactCard({p,c,user,esc,call,numbers='',voice,dateLabel,sending=false}){
  const health=root.VeriskoLeadPipeline?.health(p,c),reason=returnReason(c),send=canSend(p,c,user),due=p.followUp?'Next follow-up: '+dateLabel(p.followUp):'No follow-up date';
  return '<article class="card sales-contact"><div class="sales-contact-head"><h2>'+esc(p.business)+'</h2><span class="sales-status'+(reason?' needs-followup':'')+'">'+esc(c||p.leadStatus==='Not ready'?progress(c,p):root.VeriskoLeadImport?.contacted(p)?'Contacted':'Not contacted')+'</span></div><p class="helper">'+esc([p.contact,p.location].filter(Boolean).join(' · '))+'</p>'+(reason?'<p class="sales-return-reason"><strong>Why it came back:</strong> '+esc(reason)+'</p>':'')+'<p>'+esc(due)+'</p><div class="sales-contact-actions">'+(send?'<button type="button" class="btn btn-primary" data-lead-send="operations" data-lead-id="'+esc(p.id)+'"'+(sending?' disabled':'')+'>'+(sending?'Sending…':reason?'Ready again · send for visit':'Send for site visit')+'</button>':'')+call+'<button type="button" class="btn btn-ghost" data-log-followup="'+esc(p.id)+'">Add update</button></div><details><summary>Contact details & voice notes</summary>'+voice+'<p>'+esc(p.phone)+'</p>'+numbers+'<p>'+esc(p.notes||'No notes yet')+'</p>'+(health?'<p class="deal-health deal-health-'+health.key+'"><strong>'+esc(health.label)+'</strong> · '+esc(health.reason)+'</p>':'')+'<p>With: '+esc(c?.state==='returned'?p.createdBy||'Sales':c?.ownerName||p.createdBy||'Sales')+'</p>'+(p.nextAction?'<p class="helper">'+esc(p.nextAction)+'</p>':'')+((own(p,user)&&(!c||returned(c)))?'<button type="button" class="btn btn-ghost btn-sm" data-defer-contact="'+esc(p.id)+'">'+(p.leadStatus==='Not ready'?'Ready to follow up again':'Defer contact')+'</button>':'')+'<button type="button" class="btn btn-ghost btn-sm" data-edit-lead="'+esc(p.id)+'">Edit contact</button>'+(c?'<button type="button" class="btn btn-ghost btn-sm" data-open-contact="'+esc(p.id)+'">Open progress</button>':'')+'</details></article>';
 }
 async function sendContact({api,user,contact,item,requestId,isCurrent=()=>true}){
  if(!isCurrent())throw new Error('Sign in again before sending.');
  if(!canSend(contact,item,user))throw new Error('This contact is already sent. Check My work.');
  const r=await api('POST',{action:'request',contactId:contact.id,baseVersion:item?.version||0,requestId,note:contact.nextAction||contact.notes||''});
  if(!isCurrent())throw new Error('Account changed. Sign in again to see the result.');return r.item;
 }
 root.VeriskoSalesWorkspace={own,returned,canSend,progress,returnReason,contactCard,sendContact};
})(typeof window==='object'?window:globalThis);
