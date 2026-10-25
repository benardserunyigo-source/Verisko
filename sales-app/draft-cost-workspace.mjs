import {mountDraftPaymentEditor} from './draft-payment-editor.mjs?v=143';
import {draftCostBudget} from './draft-payment-options.mjs?v=143';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountDraftCostWorkspace({host,user,pricing,jobs=[],initialJobId='',api,preview=false,isCurrent=()=>true}){
 if(!['admin','operations'].includes(user?.role)){host.innerHTML='<p role="alert">Operations or Admin access needed.</p>';return {stop(){}};}
 let stopped=false,editor=null,epoch=0,selected='',version=0,basisHash='',pending=null;
 const active=()=>!stopped&&isCurrent();
 const eligible=jobs.filter(j=>Number(j.cameraCount??j.quoteSnapshot?.cameras)===4);
 if(preview&&!eligible.length)eligible.push({id:'preview-draft-job',business:'DEMO · Kampala Shop',ref:'DEMO-DRAFT-001',cameraCount:4});
 host.innerHTML='<section class="card draft-job-picker"><h2>Draft costs for a job</h2><p>Choose an existing four-camera job. These draft comparison prices do not replace the client’s quote.</p><label for="draftJob">Job</label><select id="draftJob" data-draft-job><option value="">Choose a saved job</option>'+eligible.map(j=>'<option value="'+esc(j.id)+'">'+esc([j.business||'Camera job',j.ref].filter(Boolean).join(' · '))+'</option>').join('')+'</select><p class="helper" data-draft-stamp></p><button type="button" class="btn btn-ghost" data-draft-reload>Reload saved draft</button><p class="helper">Reload replaces unsaved edits. Saving here changes internal draft costs only.</p><p role="status" data-draft-load-status></p></section><div data-draft-editor-host></div>';
 const select=host.querySelector('#draftJob'),slot=host.querySelector('[data-draft-editor-host]'),stamp=host.querySelector('[data-draft-stamp]'),status=host.querySelector('[data-draft-load-status]'),reload=host.querySelector('[data-draft-reload]');
 function savedLabel(item){stamp.textContent=preview?'Demo job · Saving is turned off in preview.':item?'Saved '+new Date(item.savedAt).toLocaleString('en-GB',{timeZone:'Africa/Kampala'})+' · Uganda time · '+(item.savedBy?.name||'Operations'):'No draft costs saved for this job yet.';}
 async function load(){
  const turn=++epoch;editor?.stop();editor=null;pending=null;selected=select.value;stamp.textContent='';slot.innerHTML='';status.textContent='';
  if(!selected){status.textContent=eligible.length?'Choose a job to open its draft costs.':'No saved four-camera jobs yet. Save a job record first.';return;}
  status.textContent='Loading draft costs…';
  const current=()=>active()&&turn===epoch&&selected===select.value;
  try{
   const response=preview?{item:null,budget:draftCostBudget('operations',null,{preview:true}),basisHash:'preview'}:await api('GET',null,'?jobId='+encodeURIComponent(selected),'/api/draft-costs');
   if(!current())return;version=response.item?.version||0;basisHash=response.basisHash;const budget=response.item?.budget||response.budget;
   savedLabel(response.item);status.textContent='';
   editor=mountDraftPaymentEditor({host:slot,user,pricing:budget,preview,isCurrent:current,onSave:async costs=>{
    if(!current())throw new Error('This job is no longer open.');
    if(preview)throw new Error('Saving is turned off in preview.');
    const signature=JSON.stringify(costs);
    if(!pending||pending.signature!==signature)pending={signature,body:{jobId:selected,baseVersion:version,basisHash,costs,requestId:crypto.randomUUID()}};
    const saved=await api('POST',pending.body,'','/api/draft-costs');
    if(!current())return;version=saved.item.version;basisHash=saved.basisHash;pending=null;savedLabel(saved.item);return saved.item.budget;
   }});
  }catch(e){if(current())status.textContent=e.message||'Could not load draft costs. Try again.';}
 }
 function change(){load();}select.addEventListener('change',change);reload.addEventListener('click',change);
 select.value=eligible.some(j=>j.id===initialJobId)?initialJobId:preview?eligible[0]?.id||'':'';load();
 return {stop(){stopped=true;epoch++;editor?.stop();pending=null;select.removeEventListener('change',change);reload.removeEventListener('click',change);}};
}
