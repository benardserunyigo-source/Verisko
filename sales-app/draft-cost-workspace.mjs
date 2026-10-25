import {mountDraftPaymentEditor} from './draft-payment-editor.mjs?v=147';
import {draftCostBudget,DRAFT_CAMERA_COUNTS} from './draft-payment-options.mjs?v=147';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountDraftCostWorkspace({host,user,pricing,jobs=[],initialJobId='',api,preview=false,isCurrent=()=>true}){
 if(!['admin','operations'].includes(user?.role)){host.innerHTML='<p role="alert">Operations or Admin access needed.</p>';return {stop(){}};}
 let stopped=false,editor=null,epoch=0,selected='',version=0,basisHash='',pending=null;
 const active=()=>!stopped&&isCurrent();
 const cameraCount=j=>Number(j.cameraCount??j.quoteSnapshot?.cameras);
 const eligible=jobs.filter(j=>DRAFT_CAMERA_COUNTS.includes(cameraCount(j)));
 if(preview&&!eligible.length)eligible.push(...DRAFT_CAMERA_COUNTS.map(n=>({id:n===4?'preview-draft-job':'preview-draft-'+n,business:'DEMO · '+n+'-camera shop',ref:'DEMO-DRAFT-'+n,cameraCount:n})));
 host.innerHTML='<section class="card draft-job-picker"><h2>Draft costs & payments</h2><p>Choose an existing 4, 6, 8 or 12-camera job. These draft comparison prices do not replace the client’s quote.</p><label for="draftJob">Job</label><select id="draftJob" data-draft-job><option value="">Choose a saved job</option>'+eligible.map(j=>'<option value="'+esc(j.id)+'">'+esc([j.business||'Camera job',j.ref,cameraCount(j)+' cameras'].filter(Boolean).join(' · '))+'</option>').join('')+'</select><p class="helper" data-draft-stamp></p><button type="button" class="btn btn-ghost" data-draft-reload>Reload saved draft</button><p class="helper">Reload replaces unsaved edits. Saving here keeps internal draft costs and payment amounts only.</p><p role="status" data-draft-load-status></p></section><div data-draft-editor-host></div>';
 const select=host.querySelector('#draftJob'),slot=host.querySelector('[data-draft-editor-host]'),stamp=host.querySelector('[data-draft-stamp]'),status=host.querySelector('[data-draft-load-status]'),reload=host.querySelector('[data-draft-reload]');
 function savedLabel(item){stamp.textContent=preview?'Demo job · Saving is turned off in preview.':item?'Saved '+new Date(item.savedAt).toLocaleString('en-GB',{timeZone:'Africa/Kampala'})+' · Uganda time · '+(item.savedBy?.name||'Operations'):'No draft saved for this job yet.';}
 async function load(){
  const turn=++epoch;editor?.stop();editor=null;pending=null;selected=select.value;stamp.textContent='';slot.innerHTML='';status.textContent='';
  if(!selected){status.textContent=eligible.length?'Choose a job to open its draft costs.':'No saved 4, 6, 8 or 12-camera jobs yet. Save a job record first.';return;}
  const cameras=cameraCount(eligible.find(j=>j.id===selected));
  status.textContent='Loading draft…';
  const current=()=>active()&&turn===epoch&&selected===select.value;
  try{
   const response=preview?{item:null,budget:draftCostBudget('operations',null,{preview:true,cameras}),cameras,basisHash:'preview'}:await api('GET',null,'?jobId='+encodeURIComponent(selected),'/api/draft-costs');
   if(!current())return;if(response.cameras!==cameras)throw new Error('This job changed. Reload the job before editing costs.');version=response.item?.version||0;basisHash=response.basisHash;const budget=response.item?.budget||response.budget;
   savedLabel(response.item);status.textContent='';
   editor=mountDraftPaymentEditor({host:slot,user,pricing:budget,preview,cameras,options:response.item?.options||response.options,isCurrent:current,onSave:async draft=>{
    if(!current())throw new Error('This job is no longer open.');
    if(preview)throw new Error('Saving is turned off in preview.');
    const signature=JSON.stringify(draft);
    if(!pending||pending.signature!==signature)pending={signature,body:{jobId:selected,baseVersion:version,basisHash,costs:draft.costs,options:draft.options,requestId:crypto.randomUUID()}};
    const saved=await api('POST',pending.body,'','/api/draft-costs');
    if(!current())return;version=saved.item.version;basisHash=saved.basisHash;pending=null;savedLabel(saved.item);return {budget:saved.item.budget,options:saved.item.options};
   }});
  }catch(e){if(current())status.textContent=e.message||'Could not load the draft. Try again.';}
 }
 function change(){load();}select.addEventListener('change',change);reload.addEventListener('click',change);
 select.value=eligible.some(j=>j.id===initialJobId)?initialJobId:preview?eligible[0]?.id||'':'';load();
 return {stop(){stopped=true;epoch++;editor?.stop();pending=null;select.removeEventListener('change',change);reload.removeEventListener('click',change);}};
}
