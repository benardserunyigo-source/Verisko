// Presentation only. Existing request commands and server role checks remain authoritative.
const office=u=>['operations','teamlead','admin'].includes(u?.role);
export const requestCompleted=c=>(c.installationProgress||[]).some(i=>i.stage==='Client signed off');
export function requestCounts(items,user){return {new:items.filter(c=>!c.ownerId&&c.state!=='returned'&&!requestCompleted(c)).length,mine:items.filter(c=>c.ownerId===user.id&&c.state!=='returned'&&!requestCompleted(c)).length};}
export function requestLabel(c){
 if(c.state==='returned')return 'Back with Sales';
 if(c.installationProgress?.length)return c.installationProgress.at(-1).stage;
 if(c.firstPayment)return c.firstPayment.status==='approved'?'Client paid':c.firstPayment.status==='query'?'Check payment details':'Payment waiting for approval';
 if(c.quoteSent)return 'Quote sent';if(c.visit?.doneAt)return 'Visit done';
 if(c.visit&&!c.visit.onHoldAt)return 'Visit booked';return c.ownerId?'Arrange a visit':'New request';
}
export function requestActions(c,user,people=[]){
 const actions={primary:null,returnSales:false,extra:[]};
 if(!office(user)||c.state==='returned')return actions;
 if(!c.ownerId){actions.primary=['take','Take contact'];return actions;}
 if(c.ownerId!==user.id&&user.role!=='admin')return actions;
 if(!c.visit||c.visit.onHoldAt)actions.primary=['confirm_visit','Confirm visit'];
 else if(!c.visit.doneAt)actions.primary=['complete_visit','Mark visit done'];
 else if(!c.quoteSent)actions.primary=['quote_sent','Record quote sent'];
 else if(!c.firstPayment)actions.primary=['record_payment','Record first payment'];
 else if(c.firstPayment.status==='query'&&!c.firstPayment.legacy)actions.primary=['record_payment','Fix payment details'];
 actions.returnSales=!!c.creatorId&&!c.firstPayment;
 if(people.some(p=>p.id!==c.ownerId&&p.id!==c.previousOwnerId&&p.id!==user.id))actions.extra.push(['assign','Give to someone else']);
 if(people.some(p=>p.id===c.previousOwnerId))actions.extra.push(['return','Return to previous person']);
 if(c.visit&&!c.visit.doneAt)actions.extra.push(['reschedule_visit','Change visit time']);
 if(c.visit&&(!c.firstPayment||c.firstPayment.status==='query'&&!c.firstPayment.legacy)&&actions.primary?.[0]!=='record_payment')actions.extra.push(['record_payment',c.firstPayment?'Fix payment details':'Record first payment']);
 return actions;
}
export function readyQuoteAction(c,user){
 if(!['operations','admin'].includes(user?.role)||c.state==='returned'||!c.visit?.doneAt||(!c.ownerId)||(c.ownerId!==user.id&&user.role!=='admin'))return null;
 const jobs=c.quoteJobs||[];return {label:jobs.length>1?'Choose quote':jobs.length?'Open quote':'Create quote',jobs};
}
export function teamRequestCard({c,user,people,esc,progressHtml='',paymentHtml=''}){
 const q=readyQuoteAction(c,user),a=requestActions(c,user,people),phone=(c.contact.phone||'').replace(/[^\d+]/g,''),date=c.visit&&!c.visit.onHoldAt?new Date(c.visit.date+'T12:00:00+03:00').toLocaleDateString('en-GB',{timeZone:'Africa/Kampala',day:'numeric',month:'short'}):'',lastReturn=[...(c.history||[])].reverse().find(e=>['returned','returned_to_sales'].includes(e.type));
 const button=([action,label],primary=false)=>'<button type="button" class="btn '+(primary?'btn-primary':'btn-ghost')+'" data-ready-action="'+action+'" data-contact="'+esc(c.contactId)+'">'+label+'</button>';
 const historyLabels={requested:'sent for a visit',resent:'sent again',taken:'took this contact',assigned:'gave this contact to someone',returned:'sent this contact back',returned_to_sales:'sent this contact back to Sales',visit_confirmed:'confirmed the visit',visit_rescheduled:'changed the visit time',visit_done:'finished the visit',quote_sent:'recorded the quote',payment_recorded:'recorded a payment',payment_approved:'approved payment'};
 return '<article class="card visit-team-card"><div class="visit-team-heading"><h2>'+esc(c.contact.business)+'</h2><span class="sales-status">'+esc(requestLabel(c))+'</span></div><p>'+esc([c.contact.contact,c.contact.location].filter(Boolean).join(' · '))+'</p><p class="helper">From '+esc(c.contact.createdBy)+' · '+(c.ownerId?'With '+esc(c.ownerName):'Waiting for someone to take it')+'</p>'+(c.context?'<p class="visit-team-note">'+esc(c.context)+'</p>':'')+(date?'<p class="visit-team-date"><strong>Visit: '+esc(date)+' at '+esc(c.visit.time)+'</strong> · Uganda time</p>':'')+(c.visit?.doneTime?'<p class="helper">Visit finished at '+esc(c.visit.doneTime)+' · Uganda time</p>':'')+(c.state==='returned'&&lastReturn?'<p class="sales-return-reason"><strong>Why it went back:</strong> '+esc(lastReturn.note)+'</p>':'')+'<div class="visit-team-actions">'+(q?button(['open_quote',q.label],true):'')+(a.primary?button(a.primary,!q):'')+(phone?'<a class="btn btn-ghost" href="tel:'+esc(phone)+'">Call contact</a>':'')+(a.returnSales?button(['return_sales','Send back to Sales']):'')+(c.visit&&!c.visit.doneAt&&!c.visit.onHoldAt&&c.ownerId===user.id?'<button type="button" class="btn btn-ghost" data-client-work="'+esc(c.contactId)+'">Start / finish visit</button>':'')+'</div><details class="visit-team-more"><summary>More details</summary>'+progressHtml+paymentHtml+'<div class="ready-actions"><button type="button" class="btn btn-ghost" data-client-voice="'+esc(c.contactId)+'">Voice notes</button><button type="button" class="btn btn-ghost" data-client-work="'+esc(c.contactId)+'">Visit time and location</button>'+a.extra.map(x=>button(x)).join('')+'</div><h3>History</h3><ol class="visit-team-history">'+(c.history||[]).map(e=>'<li><strong>'+esc(e.name)+'</strong> '+esc(historyLabels[e.type]||e.type.replaceAll('_',' '))+(e.note?'<p>'+esc(e.note)+'</p>':'')+'<small>'+esc(new Date(e.at).toLocaleString('en-GB',{timeZone:'Africa/Kampala',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+' · Uganda time</small></li>').join('')+'</ol></details></article>';
}
