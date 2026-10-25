import {draftCostBudget,draftCostEstimate,draftComparisonHtml} from './draft-payment-options.mjs?v=143';
const keys=['direct','care','business'];
function parseCost(value,key){
  const text=String(value).trim();
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text))return null;
  const n=Number(text.replaceAll(',',''));
  return Number.isSafeInteger(n)&&n>=0&&(key!=='direct'||n>0)?n:null;
}
export function createDraftCostScenario(role,pricing,{preview=false}={}){
  let base=draftCostBudget(role,pricing,{preview}),changes={},stopped=false;
  function read(){
    if(stopped||!base)return {available:false,budget:null,estimate:null,fields:{},errors:{}};
    const defaults={direct:base.packages[4].direct,care:base.policy.callbacks,business:base.policy.acquisition+base.policy.overhead},fields={},errors={};
    for(const key of keys){fields[key]=Object.hasOwn(changes,key)?changes[key]:String(Math.round(defaults[key]));if(Object.hasOwn(changes,key)&&parseCost(changes[key],key)===null)errors[key]=key==='direct'?'Enter a whole UGX amount above 0.':'Enter a whole UGX amount. Use 0 if none.';}
    if(Object.keys(errors).length)return {available:true,budget:null,estimate:null,fields,errors};
    const budget={policy:{...base.policy},packages:{4:{direct:base.packages[4].direct}}};
    if(Object.hasOwn(changes,'direct'))budget.packages[4].direct=parseCost(changes.direct,'direct');
    if(Object.hasOwn(changes,'care'))budget.policy.callbacks=parseCost(changes.care,'care');
    if(Object.hasOwn(changes,'business')){budget.policy.acquisition=0;budget.policy.overhead=parseCost(changes.business,'business');}
    const estimate=draftCostEstimate(role,budget);
    if(!estimate)errors.direct='Costs are too large to calculate. Enter a smaller amount.';
    return {available:true,budget:estimate?budget:null,estimate,fields,errors};
  }
  return {read,update(key,value){if(!stopped&&base&&keys.includes(key))changes[key]=String(value);return read();},reset(){changes={};return read();},accept(saved){const next=read();if(next.budget){base=draftCostBudget(role,saved||next.budget);changes={};}return read();},stop(){stopped=true;base=null;changes={};}};
}
export function mountDraftPaymentEditor({host,user,pricing,preview=false,isCurrent=()=>true,onSave}){
  const role=user?.role;
  if(!['admin','operations'].includes(role)){host.innerHTML='<p role="alert">Operations or Admin access needed.</p>';return {stop(){}};}
  const model=createDraftCostScenario(role,pricing,{preview}),initial=model.read();let stopped=false;
  host.innerHTML=draftComparisonHtml(role,{pricing,preview});
  if(!initial.available)return {stop(){stopped=true;model.stop();}};
  const editor=document.createElement('section');editor.className='card draft-cost-editor';
  editor.innerHTML='<h2>Edit draft costs</h2><p class="helper">'+(onSave?'Changes stay on this page until you tap Save draft costs. Customer prices and the company budget do not change.':'Try costs for this sample job. Changes stay on this page only. Customer prices and the saved budget do not change.')+'</p>'+[
    ['direct','Materials, delivery & crew (UGX)'],['care','Care & callbacks (UGX)'],['business','Sales & office costs (UGX)']
  ].map(([key,label])=>'<div class="draft-cost-field"><label for="draft-cost-'+key+'">'+label+'</label><input id="draft-cost-'+key+'" data-draft-cost="'+key+'" type="text" inputmode="numeric" autocomplete="off" aria-describedby="draft-error-'+key+'"><small id="draft-error-'+key+'" class="draft-cost-error"></small></div>').join('')+'<p class="helper">Care includes monitoring and faults cover. We add the saved spare-cost allowance and payment costs automatically.</p><div class="ready-actions">'+(onSave?'<button type="button" class="btn btn-primary" data-draft-save'+(preview?' disabled':'')+'>Save draft costs</button>':'')+'<button type="button" class="btn btn-ghost" data-draft-reset>'+(preview?'Use sample costs':'Use saved costs')+'</button></div><p class="draft-cost-status" role="status" aria-live="polite" aria-atomic="true"></p>';
  host.querySelector('.draft-profit').before(editor);
  const inputs=[...editor.querySelectorAll('[data-draft-cost]')],reset=editor.querySelector('[data-draft-reset]'),save=editor.querySelector('[data-draft-save]'),status=editor.querySelector('[role=status]');let saving=false;
  const current=()=>!stopped&&isCurrent();
  function show(next,restore=false){
    if(!current())return;
    const template=document.createElement('template');template.innerHTML=draftComparisonHtml(role,{pricing,preview,scenario:next.budget,costError:!!Object.keys(next.errors).length});
    for(const selector of ['.draft-profit','.draft-plans-grid','.draft-plan-review']){
      const old=host.querySelector(selector),replacement=template.content.querySelector(selector);
      if(old?.open)replacement.open=true;
      old.replaceWith(replacement);
    }
    for(const input of inputs){const key=input.dataset.draftCost;if(restore)input.value=next.fields[key];input.setAttribute('aria-invalid',String(!!next.errors[key]));editor.querySelector('#draft-error-'+key).textContent=next.errors[key]||'';}
    const count=next.estimate?.rows.filter(r=>r.belowFloor).length;
    if(save)save.disabled=preview||saving||!next.estimate;
    status.textContent=!next.estimate?'Check the cost fields. Profit is unavailable until they are valid.':(restore?'Costs reset. ':'Updated. ')+(count?count+' '+(count===1?'option is':'options are')+' below 26%. Review before quoting.':'All four estimates reach 26%. Final costs still need checking.');
  }
  for(const input of inputs)input.value=initial.fields[input.dataset.draftCost];
  function edit(e){if(current()&&!saving)show(model.update(e.target.dataset.draftCost,e.target.value));}
  function restore(){if(current()&&!saving)show(model.reset(),true);}
  async function persist(){
    const next=model.read();if(!current()||saving||preview||!next.budget)return;
    saving=true;save.disabled=true;inputs.forEach(i=>i.disabled=true);reset.disabled=true;status.textContent='Saving draft costs…';
    try{const saved=await onSave({direct:Math.round(next.budget.packages[4].direct),care:Math.round(next.budget.policy.callbacks),business:Math.round(next.budget.policy.acquisition+next.budget.policy.overhead)});if(!current())return;show(model.accept(saved),true);status.textContent='Draft costs saved on this job. Customer pricing is unchanged.';}
    catch(e){if(current())status.textContent=e.message||'Could not save. Your edits are still here. Try again.';}
    finally{saving=false;if(current()){inputs.forEach(i=>i.disabled=false);reset.disabled=false;save.disabled=preview||!model.read().estimate;}}
  }
  inputs.forEach(i=>i.addEventListener('input',edit));reset.addEventListener('click',restore);
  save?.addEventListener('click',persist);
  return {stop(){stopped=true;inputs.forEach(i=>i.removeEventListener('input',edit));reset.removeEventListener('click',restore);save?.removeEventListener('click',persist);model.stop();}};
}
