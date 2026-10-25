import {replyText} from './client-plan-ui.mjs?v=150';
import './job-finance.js?v=150';
import {installerPaymentSummary} from './installer-model.mjs?v=150';
import {materialBalance} from './installer-materials.mjs?v=150';
const office=u=>['admin','operations'].includes(u?.role);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'UGX '+Number(n).toLocaleString('en-UG');
const sum=(a,f)=>a.reduce((n,x)=>n+(Number(f(x))||0),0);
const date=v=>/^\d{4}-\d{2}-\d{2}/.test(v||'')?new Date(v.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Kampala'}):'Date not saved';
export function buildJobSummaries({user,data={},cases=[],installations=[],quoteValue,clientPlans=[],today=new Date().toISOString().slice(0,10)}){
 if(!office(user))return [];
 const rows=[],bySource=new Map(),prospects=data.prospects||[],sources=data.jobs||[];
 function add(id,contactId,source){const r={id,contactId:contactId||'',source,aliases:new Set([id]),installations:[],plans:[]};rows.push(r);bySource.set(id,r);return r;}
 for(const s of sources)if(!bySource.has(s.id))add(s.id,s.prospectId,s);
 const forContact=id=>rows.filter(r=>id&&r.contactId===id);
 for(const c of cases){for(const w of [...(c.paidWork||[]),...(c.materialPlans||[]).map(p=>({id:p.sourceId}))]){
   let r=bySource.get(w.id);if(!r&&w.id==='client-'+c.contactId&&forContact(c.contactId).length===1)r=forContact(c.contactId)[0];
   if(!r)r=add(w.id,c.contactId);r.aliases.add(w.id);bySource.set(w.id,r);
  }
 }
 for(const j of installations){let r=bySource.get(j.sourceId)||bySource.get(j.materialSourceId);
  // A distinct saved source must never be merged by a matching client name.
  if(!r&&!j.sourceId&&!j.materialSourceId&&forContact(j.readyContactId).length===1)r=forContact(j.readyContactId)[0];
  if(!r)r=add(j.sourceId||j.materialSourceId||'installation:'+j.id,j.readyContactId);r.installations.push(j);r.aliases.add(j.id);
 }
 for(const c of cases){if(!forContact(c.contactId).length)add('contact:'+c.contactId,c.contactId);for(const r of forContact(c.contactId)){r.case=c;r.plans=(c.materialPlans||[]).filter(p=>r.aliases.has(p.sourceId));}}
 const uniqueTx=new Map((data.transactions||[]).map(t=>[t.id,t]));
 for(const c of cases)if(c.firstPayment?.id&&!uniqueTx.has(c.firstPayment.id))uniqueTx.set(c.firstPayment.id,{...c.firstPayment,direction:'in',prospectId:c.contactId});
 return rows.map(r=>{
  const c=r.case,p=prospects.find(p=>p.id===r.contactId)||c?.contact||{},s=r.source,js=r.installations;
  r.business=p.business||s?.business||js[0]?.business||'Saved job';r.location=p.location||s?.location||js[0]?.address||'';r.reference=s?.ref||r.plans[0]?.label||'';
  const attribution=globalThis.VeriskoJobFinance.receiptsForJob({id:r.id,prospectId:r.contactId},[...uniqueTx.values()],rows.map(x=>({id:x.id,prospectId:x.contactId})),[...r.aliases]);
  r.receipts=attribution.receipts;r.unassignedClientMoney=attribution.unassignedClientMoney;
  r.paid=sum(r.receipts.filter(t=>t.status==='approved'),t=>t.amount);r.pending=sum(r.receipts.filter(t=>!['approved','query','rejected','void'].includes(t.status)),t=>t.amount);
  const stored=s?.quotedTotal??s?.quoteSnapshot?.cash;
  let total=stored!=null&&Number(stored)>0?Number(stored):null;
  if(total==null&&s&&quoteValue){try{const n=quoteValue(s);if(Number.isFinite(n)&&n>0)total=n;}catch{}}
  if(total==null&&s?.priceOverride&&Number(s.finalPrice)>0)total=Number(s.finalPrice);
  r.clientPlan=clientPlans.find(x=>x.jobId===s?.id);
  r.total=total;r.balance=total==null?null:Math.max(0,total-r.paid);r.credit=total==null?0:Math.max(0,r.paid-total);
  r.crew=js.flatMap(j=>(j.assignees||[]).map(id=>({jobId:j.id,id,...installerPaymentSummary(j,id)})));
  r.crewAgreed=sum(r.crew,x=>x.agreed);r.crewPaid=sum(r.crew,x=>x.paid);r.crewBalance=sum(r.crew,x=>Math.max(0,x.balance));r.crewOverpaid=sum(r.crew,x=>Math.max(0,-x.balance));r.crewKnown=r.crew.length>0&&r.crew.every(x=>x.agreed>0);
  r.crewPayments=js.flatMap(j=>(j.installerPayments||[]).filter(p=>!(j.installerPaymentVoids||[]).some(v=>v.paymentId===p.id)));
  const mats=js.flatMap(j=>j.materials?.items||[]);r.returns=mats.filter(i=>i.issued>0).map(i=>({...i,...materialBalance(i)}));
  r.returnsDue=r.returns.some(i=>!i.checked||i.leftGood>0||i.leftDamaged>0||(i.missing||0)>(i.lossAccepted||0));
  r.signed=js.length>0&&js.every(j=>j.clientReview?.outcome==='accepted');r.approved=js.length>0&&js.every(j=>j.status==='Completed');
  const quoteSent=!!(s&&!['Draft','Rejected','Cancelled'].includes(s.stage)||c?.quoteSent&&(!c.quoteSent.sourceId||r.aliases.has(c.quoteSent.sourceId)));
  r.steps=[['Contact saved',!!r.contactId],['Site visit done',!!c?.visit?.doneAt],['Quote sent',quoteSent],['Client payment approved',r.paid>0],['Materials arrived',r.plans.length>0&&r.plans.every(p=>p.items?.length&&p.items.every(i=>sum(i.receipts||[],x=>x.quantity)>=i.planned))],['Installer accepted',js.length>0&&js.every(j=>j.assignment?.status==='accepted')],['Installation checks approved',r.approved],['Client and supervisor signed off',r.signed]];
  const cancelled=['Cancelled','Rejected'].includes(s?.stage),legacyDone=!js.length&&['Installed','Handed over'].includes(s?.stage);
  r.stage=cancelled?s.stage:legacyDone?s.stage+' · older job':r.signed?'Client signed off':js.some(j=>j.clientReview?.outcome==='fixes'||j.status==='Needs correction')?'Fix needed':r.approved?'Client sign-off needed':js.some(j=>j.status==='Submitted')?'Ready for review':js.length?'Installation in progress':r.paid>0?'Payment approved':quoteSent?'Quote sent':c?.visit?.doneAt?'Visit done':c?.visit?'Visit booked':'Arrange a visit';
  r.tasks=[];const task=(text,action)=>r.tasks.push({text,action});
  if(cancelled){task('This job is '+s.stage.toLowerCase()+'. Check any open money or stock.','record');}
  else{
   if(!legacyDone&&!c?.visit?.doneAt&&!js.length)task('Arrange or finish the site visit.','visits');
   if(!quoteSent)task('Record the quote sent to the client.','visits');
   if(total==null)task('Add the full quote total to check the client balance.','record');
   if(r.unassignedClientMoney)task(money(r.unassignedClientMoney)+' client money is not linked to one job. Do not count it twice.','payments');
   if(r.pending)task(money(r.pending)+' client payment is waiting for approval.','payments');
   if(r.receipts.some(t=>t.status==='query'))task('Fix the client payment that was sent back.','payments');
   if(!r.paid&&!r.receipts.length)task('Record and approve the first client payment.','visits');
   if(r.balance>0)task('Client balance: '+money(r.balance)+'. Review payments before collecting.','payments');
   if(total!=null&&r.balance>0&&!s?.paymentSchedule?.length)task('Save the agreed client payment dates.','record');
   if(r.credit)task('Client receipts are '+money(r.credit)+' above the saved total. Check the records.','payments');
   if(!legacyDone&&!r.plans.length&&!js.length)task('Plan materials on the same client.','materials');
   for(const plan of r.plans){if(!plan.requestedAt)task('Request buying for the saved materials.','materials');else if(!plan.items.every(i=>sum(i.receipts||[],x=>x.quantity)>=i.planned))task('Finish ordering and receiving the planned materials.','materials');}
   if(!legacyDone&&!js.length&&r.paid)task('Assign an installer once the materials are ready.','materials');
   for(const j of js){if(j.assignment?.status==='pending')task('Wait for the installer to accept the offer.','installation');if(j.assignment?.status==='declined')task('Offer the job to another installer.','materials');if(j.clientReview?.outcome==='fixes')task('Client asked for a fix: '+j.clientReview.issue+' Next: '+j.clientReview.nextAction,'installation');else if(j.status==='Needs correction')task('Installer needs to fix the returned checks.','installation');if(j.status==='Submitted')task('Review the saved checks and photos.','installation');else if(j.status!=='Completed'&&j.assignment?.status==='accepted')task('Installer must finish the checks and send the job for review.','installation');if(j.clientReview?.outcome==='unavailable')task('Client was not available. Next: '+(j.clientReview.nextAction||'Arrange another meeting.'),'installation');if(j.status==='Completed'&&j.clientReview?.outcome!=='accepted')task('Site supervisor must meet the client and sign off together.','installation');}
   if(r.returnsDue)task('Check material counts and receive leftover stock.','installation');
   if(js.length&&!r.crewKnown)task('Confirm the installer’s agreed pay.','installation');else if(r.crewBalance>0)task('Installer has '+money(r.crewBalance)+' left to pay.','installation');if(r.crewOverpaid>0)task('An installer has '+money(r.crewOverpaid)+' above their agreed pay. Check the records.','installation');
   if(js.length&&!js.every(j=>(j.clientReview?.care?.monitoringCommissioned&&j.clientReview.care.monitoringMiniPcRef&&j.clientReview.care.monitoringTestEvidence)||(s?.monitoringCommissioned&&s.monitoringMiniPcRef&&s.monitoringTestEvidence)))task('Monitoring setup is not recorded. Check the included care.','record');
  }
  if(s?.paymentSchedule?.length){let remaining=r.paid;r.schedule=s.paymentSchedule.map(x=>{const paid=Math.min(remaining,Number(x.amount)||0);remaining-=paid;return {...x,balance:Math.max(0,Number(x.amount)-paid),overdue:(x.completion?r.approved:!!x.due&&x.due<today)&&Number(x.amount)>paid};});if(r.schedule.some(x=>x.overdue))task('A client payment date has passed. Follow up.','payments');}
  r.tasks=r.tasks.filter((x,i,a)=>a.findIndex(y=>y.text===x.text)===i);
  return r;
 });
}
const line=(label,value,cl='')=>'<div class="summary-money '+cl+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';
export function summaryCard(r){return '<article class="card job-summary-card"><header><div><h2>'+esc(r.business)+'</h2><p class="helper">'+esc([r.reference,r.location].filter(Boolean).join(' · '))+'</p></div><span class="iw-status">'+esc(r.stage)+'</span></header>'+(r.clientPlan?.choice?'<section><h3>Client payment plan</h3><p>'+esc(replyText(r.clientPlan))+'</p><p class="helper">Client choice only. Payment and funding approval stay separate.</p></section>':'')+'<section><h3>Client payments</h3>'+line('Full quote',r.total==null?'Not saved':money(r.total))+line('Received and approved',money(r.paid))+line('Waiting for approval',money(r.pending))+line('Client balance',r.balance==null?'Not yet known':money(r.balance))+(r.credit?line('Extra received',money(r.credit)):'')+'<details><summary>Client payment details</summary>'+(r.receipts.length?r.receipts.map(t=>'<p>'+esc(money(t.amount)+' · '+date(t.date)+' · '+(t.status||'pending')+' · '+(t.method||''))+'</p>').join(''):'<p>No client payment is recorded for this job.</p>')+(r.schedule||[]).map(x=>'<p>'+esc(x.label+' · '+date(x.due)+' · '+money(x.balance)+' left'+(x.overdue?' · overdue':''))+'</p>').join('')+'</details></section><section><h3>Installer payments</h3>'+line('Agreed pay',r.crewKnown?money(r.crewAgreed):'Not set')+line('Paid so far',money(r.crewPaid))+line('Left to pay',r.crewKnown?money(r.crewBalance):'Not yet known',r.crewKnown&&!r.crewBalance&&!r.crewOverpaid?'summary-clear':'')+(r.crewOverpaid?line('Extra installer payment',money(r.crewOverpaid)):'')+'<details><summary>Installer payment details</summary>'+(r.crewPayments.length?r.crewPayments.map(p=>'<p>'+esc(money(p.amount)+' · '+date(p.paidOn)+' · '+p.method+(p.reference?' · '+p.reference:''))+'</p>').join(''):'<p>No installer payment is recorded.</p>')+'</details></section><section class="summary-next"><h3>What is left to do?</h3>'+(r.tasks.length?'<ul>'+r.tasks.map(t=>'<li>'+esc(t.text)+'</li>').join('')+'</ul>':'<p>Nothing is waiting in these saved records.</p>')+'</section><details><summary>Job journey · '+r.steps.filter(x=>x[1]).length+' / '+r.steps.length+' done</summary><ol class="summary-journey">'+r.steps.map(([text,done])=>'<li><span aria-label="'+(done?'Done':'Not recorded')+'">'+(done?'✓':'○')+'</span> '+esc(text)+'</li>').join('')+'</ol><p class="helper">Added by '+esc(r.case?.contact?.createdBy||'Not recorded')+' · With '+esc(r.case?.ownerName||'Not assigned')+'</p></details><details><summary>Materials and returns</summary>'+(r.plans.length?'<p>'+esc(r.plans.map(p=>p.status).join(' · '))+'</p>':'')+(r.returns.length?r.returns.map(i=>'<p><strong>'+esc(i.name)+'</strong><br>'+esc('Taken: '+i.issued+' · Used: '+(i.used??'Not saved')+' · Received back: '+i.returnedGood+' good / '+i.returnedDamaged+' damaged ('+i.unit+')')+'<br>'+esc(i.checked?'Still to return: '+i.leftGood+' good / '+i.leftDamaged+' damaged':'Installer must save the counts.')+'</p>').join(''):'<p>No site material counts yet.</p>')+'</details><div class="ready-actions">'+(r.installations.length?'<button type="button" class="btn btn-primary" data-summary-install="'+esc(r.installations[0].id)+'">Open installation</button>':'')+(r.source?(([4,6,8,12].includes(Number(r.source.cameraCount??r.source.quoteSnapshot?.cameras)))?'<button type="button" class="btn btn-ghost" data-summary-draft="'+esc(r.source.id)+'">Draft costs &amp; profit</button>':'')+'<button type="button" class="btn btn-ghost" data-client-plan="'+esc(r.source.id)+'">Client payment plan</button><button type="button" class="btn btn-ghost" data-summary-record="'+esc(r.source.id)+'">Open job record</button>':'<button type="button" class="btn btn-ghost" data-nav-view="jobs">Job records</button>')+(r.case?'<button type="button" class="btn btn-ghost" data-nav-view="ready">Visit requests</button>':'')+'<button type="button" class="btn btn-ghost" data-summary-materials="'+esc(r.contactId)+'" data-summary-source="'+esc(r.plans[0]?.sourceId||r.id)+'">Materials &amp; buying</button><button type="button" class="btn btn-ghost" data-nav-view="cashflow">Payments</button></div></article>';}
export function mountJobSummaries({host,user,api,isCurrent,quoteValue,onInstallation,onRecord,onMaterials,onDraftCosts}){
 let rows=[],stopped=false,loading=false,selected='',query='';
 if(!office(user)){host.innerHTML='<p role="alert">Operations access is needed.</p>';return {stop(){}};}
 const active=()=>!stopped&&isCurrent();
 function draw(error=''){if(!active())return;const row=rows.find(r=>r.id===selected),shown=rows.filter(r=>[r.business,r.location,r.reference].join(' ').toLowerCase().includes(query.toLowerCase()));host.innerHTML='<div class="job-summary-workspace stack"><div class="ready-actions">'+(row?'<button type="button" class="btn btn-ghost" data-summary-back>All job summaries</button>':'')+'<button type="button" class="btn btn-ghost" data-summary-refresh'+(loading?' disabled':'')+'>Refresh</button></div>'+(error?'<p role="alert" class="shift-warning">'+esc(error)+'</p>':'')+(row?summaryCard(row):'<label for="summarySearch">Find a job</label><input class="summary-search" id="summarySearch" type="search" placeholder="Client, job number or area" value="'+esc(query)+'"><p class="helper">'+shown.length+(shown.length===1?' job':' jobs')+' · Open one to see money and the next step.</p><div class="card-grid">'+shown.map(r=>'<article class="card"><h2>'+esc(r.business)+'</h2><p class="helper">'+esc([r.reference,r.location].filter(Boolean).join(' · '))+'</p><p>'+esc(r.stage)+'</p><p class="helper">'+r.tasks.length+' items to check</p><button type="button" class="btn btn-primary" data-summary-open="'+esc(r.id)+'">Open job summary</button></article>').join('')+'</div>'+(!rows.length&&!loading?'<section class="card"><h2>No saved jobs yet</h2><p>Contacts sent for visits and saved jobs appear here.</p></section>':''))+'</div>';
 host.querySelector('[data-summary-refresh]').onclick=refresh;host.querySelector('[data-summary-back]')?.addEventListener('click',()=>{selected='';draw();});host.querySelectorAll('[data-summary-open]').forEach(b=>b.onclick=()=>{selected=b.dataset.summaryOpen;draw();});host.querySelector('#summarySearch')?.addEventListener('input',e=>{query=e.target.value;const start=e.target.selectionStart;draw();const input=host.querySelector('#summarySearch');input.focus();input.setSelectionRange?.(start,start);});host.querySelectorAll('[data-summary-install]').forEach(b=>b.onclick=()=>onInstallation(b.dataset.summaryInstall));host.querySelectorAll('[data-summary-draft]').forEach(b=>b.onclick=()=>onDraftCosts?.(b.dataset.summaryDraft));host.querySelectorAll('[data-summary-record]').forEach(b=>b.onclick=()=>onRecord(b.dataset.summaryRecord));host.querySelectorAll('[data-summary-materials]').forEach(b=>b.onclick=()=>onMaterials({contactId:b.dataset.summaryMaterials,sourceId:b.dataset.summarySource}));
 }
 async function refresh(){if(loading||!active())return;loading=true;draw();try{const [work,cases,inst,plans]=await Promise.all([api('GET',null,'','/api/data'),api('GET',null,'','/api/ready-leads'),api('GET',null,'','/api/installer'),api('GET',null,'','/api/client-plan')]);if(!active())return;rows=buildJobSummaries({user,data:work.data,cases:cases.items,installations:inst.jobs,quoteValue,clientPlans:plans.items||[],today:new Date(Date.now()+3*3600000).toISOString().slice(0,10)});loading=false;draw();}catch(e){if(!active())return;loading=false;draw('Could not refresh the job summary. '+e.message);}}
 refresh();return {stop(){stopped=true;rows=[];}};
}
