import {draftCostBudget,draftCostEstimate,draftComparisonHtml,draftPaymentOptions} from './draft-payment-options.mjs?v=147';
import {draftPaymentSuggestion} from './draft-payment-suggestions.mjs?v=147';
const keys=['direct','care','business'];
function parseCost(value,key){
 const text=String(value).trim();if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text))return null;
 const n=Number(text.replaceAll(',',''));return Number.isSafeInteger(n)&&n>=0&&(key!=='direct'||n>0)?n:null;
}
export function createDraftCostScenario(role,pricing,{preview=false,cameras=4,options}={}){
 let base=draftCostBudget(role,pricing,{preview,cameras}),plans=draftPaymentOptions(role,{cameras,options}),changes={},paymentChanges={},stopped=false;
 function read(){
  if(stopped||!base||plans.length!==4)return {available:false,budget:null,options:null,estimate:null,fields:{},errors:{},paymentFields:{},paymentErrors:{},suggestions:{}};
  const defaults={direct:base.packages[cameras].direct,care:base.policy.callbacks,business:base.policy.acquisition+base.policy.overhead},fields={},errors={},paymentFields={},paymentErrors={};
  for(const key of keys){fields[key]=Object.hasOwn(changes,key)?changes[key]:String(Math.round(defaults[key]));if(Object.hasOwn(changes,key)&&parseCost(changes[key],key)===null)errors[key]=key==='direct'?'Enter a whole UGX amount above 0.':'Enter a whole UGX amount. Use 0 if none.';}
  const amounts=plans.map(p=>{const row={id:p.id};for(const key of ['upfront','monthly']){const name=p.id+'-'+key,value=Object.hasOwn(paymentChanges,name)?paymentChanges[name]:String(p[key]);paymentFields[name]=value;row[key]=parseCost(value,'payment');if(row[key]===null||row[key]%10000!==0||key==='monthly'&&(p.months?row[key]===0:row[key]!==0)||key==='upfront'&&!p.months&&row[key]===0)paymentErrors[name]=!p.months&&key==='monthly'?'Pay in full has no monthly payment.':key==='upfront'&&p.months?'Use UGX 10,000 steps. Use 0 for no deposit.':'Use UGX 10,000 steps, above 0.';}return row;});
  const resolved=Object.keys(paymentErrors).length?null:draftPaymentOptions(role,{cameras,options:amounts});
  if(resolved&&resolved.length!==4)paymentErrors['cash-upfront']='Payment amounts are too large. Enter smaller amounts.';
  const budget=Object.keys(errors).length?null:{policy:{...base.policy},packages:{[cameras]:{direct:parseCost(fields.direct,'direct')}}};
  if(budget&&Object.hasOwn(changes,'care'))budget.policy.callbacks=parseCost(fields.care,'care');
  if(budget&&Object.hasOwn(changes,'business')){budget.policy.acquisition=0;budget.policy.overhead=parseCost(fields.business,'business');}
  const validOptions=!Object.keys(paymentErrors).length?resolved:null;
  const estimate=budget&&validOptions?draftCostEstimate(role,budget,{cameras,options:validOptions}):null;
  if(budget&&validOptions&&!estimate)errors.direct='Amounts are too large to calculate. Enter smaller amounts.';
  const suggestions=estimate?Object.fromEntries(estimate.rows.filter(r=>r.belowFloor).map(r=>[r.id,draftPaymentSuggestion(role,budget,{cameras,options:validOptions,planId:r.id})])):{};
  return {available:true,budget:Object.keys(errors).length?null:budget,options:validOptions,estimate,fields,errors,paymentFields,paymentErrors,suggestions};
 }
 return {read,update(key,value){if(!stopped&&base&&keys.includes(key))changes[key]=String(value);return read();},updatePayment(id,key,value){if(!stopped&&base&&plans.some(p=>p.id===id)&&['upfront','monthly'].includes(key))paymentChanges[id+'-'+key]=String(value);return read();},applySuggestion(id){const next=read(),suggestion=next.suggestions?.[id];if(suggestion?.available){paymentChanges[id+'-upfront']=String(suggestion.upfront);paymentChanges[id+'-monthly']=String(suggestion.monthly);}return read();},reset(){changes={};paymentChanges={};return read();},accept(saved,savedOptions){const next=read();if(next.estimate){base=draftCostBudget(role,saved||next.budget,{cameras});plans=draftPaymentOptions(role,{cameras,options:savedOptions||next.options});changes={};paymentChanges={};}return read();},stop(){stopped=true;base=null;plans=[];changes={};paymentChanges={};}};
}
const money=n=>'UGX '+n.toLocaleString('en-UG');
export function mountDraftPaymentEditor({host,user,pricing,preview=false,cameras=4,options,isCurrent=()=>true,onSave}){
 const role=user?.role;if(!['admin','operations'].includes(role)){host.innerHTML='<p role="alert">Operations or Admin access needed.</p>';return {stop(){}};}
 const model=createDraftCostScenario(role,pricing,{preview,cameras,options}),initial=model.read();let stopped=false,saving=false;
 host.innerHTML=draftComparisonHtml(role,{pricing,preview,cameras,options});
 if(!initial.available)return {stop(){stopped=true;model.stop();}};
 const editor=document.createElement('section');editor.className='card draft-cost-editor';
 const costFields=keys.map((key,i)=>'<div class="draft-cost-field"><label for="draft-cost-'+key+'">'+['Materials, delivery & crew (UGX)','Care & callbacks (UGX)','Sales & office costs (UGX)'][i]+'</label><input id="draft-cost-'+key+'" data-draft-cost="'+key+'" type="text" inputmode="numeric" autocomplete="off" aria-describedby="draft-error-'+key+'"><small id="draft-error-'+key+'" class="draft-cost-error"></small></div>').join('');
 const planFields=initial.options.map(p=>'<fieldset class="draft-term-card"><legend>'+p.title+'</legend><p class="helper">'+(p.id==='cash'?'One payment. No monthly payment.':p.owns?p.months+' monthly payments.':'First 12 months shown. Rent keeps going; Verisko owns the system.')+'</p><div class="draft-term-inputs">'+(p.id==='cash'?['upfront']:['upfront','monthly']).map(key=>{const name=p.id+'-'+key,label=p.id==='cash'?'Total paid':key==='upfront'?(p.owns?'Deposit':'Setup fee'):'Monthly payment';return '<div><label for="draft-payment-'+name+'">'+label+' (UGX)</label><input id="draft-payment-'+name+'" data-draft-payment="'+name+'" data-plan-id="'+p.id+'" data-payment-key="'+key+'" type="text" inputmode="numeric" autocomplete="off" aria-describedby="draft-payment-error-'+name+'"><small id="draft-payment-error-'+name+'" class="draft-cost-error"></small></div>';}).join('')+'</div><p class="draft-term-return" data-draft-plan-return="'+p.id+'"></p><div data-draft-suggestion-host="'+p.id+'"></div></fieldset>').join('');
 editor.innerHTML='<h2>Edit this draft</h2><p class="helper">'+(onSave?'Tap Save draft to keep costs and payment amounts on this job. Customer prices and the company budget do not change.':'Try costs and payment amounts here. Changes stay on this page only.')+'</p><details class="draft-cost-details"><summary>Job costs</summary>'+costFields+'<p class="helper">Care includes monitoring and faults cover. We add the saved spare-cost allowance and payment costs automatically.</p></details><h3>Draft payment amounts</h3><p class="helper">Use UGX 10,000 steps. Changes update total paid and profit.</p>'+planFields+'<div class="ready-actions">'+(onSave?'<button type="button" class="btn btn-primary" data-draft-save'+(preview?' disabled':'')+'>Save draft</button>':'')+'<button type="button" class="btn btn-ghost" data-draft-reset>'+(preview?'Use sample draft':'Use saved draft')+'</button></div><p class="draft-cost-status" role="status" aria-live="polite" aria-atomic="true"></p>';
 host.querySelector('.draft-plan-comparison').before(editor);
 const inputs=[...editor.querySelectorAll('[data-draft-cost],[data-draft-payment]')],reset=editor.querySelector('[data-draft-reset]'),save=editor.querySelector('[data-draft-save]'),status=editor.querySelector('[role=status]');
 const current=()=>!stopped&&isCurrent();
 function show(next,restore=false){
  if(!current())return;
  const template=document.createElement('template');template.innerHTML=draftComparisonHtml(role,{pricing,preview,cameras,scenario:next.budget,options:next.options||options,planError:!!Object.keys(next.paymentErrors).length,costError:!!Object.keys(next.errors).length});
  for(const selector of ['.draft-plan-comparison','.draft-profit','.draft-plans-grid','.draft-plan-review']){const old=host.querySelector(selector),replacement=template.content.querySelector(selector);if(old?.open)replacement.open=true;old.replaceWith(replacement);}
  for(const input of inputs){const payment=!!input.dataset.draftPayment,key=payment?input.dataset.draftPayment:input.dataset.draftCost,errors=payment?next.paymentErrors:next.errors,fields=payment?next.paymentFields:next.fields;if(restore)input.value=fields[key];input.setAttribute('aria-invalid',String(!!errors[key]));editor.querySelector('#'+(payment?'draft-payment-error-':'draft-error-')+key).textContent=errors[key]||'';}
  for(const line of editor.querySelectorAll('[data-draft-plan-return]')){const p=next.options?.find(p=>p.id===line.dataset.draftPlanReturn),r=next.estimate?.rows.find(r=>r.id===line.dataset.draftPlanReturn);line.textContent=p?('Total '+money(p.total)+(r?' · Profit '+money(r.profit)+' · '+(r.belowFloor&&Number((r.margin*100).toFixed(2))>=26?'<26%':(r.margin*100).toFixed(2)+'%')+(r.belowFloor?' · Below 26%':''):' · Check job costs for profit.')):'Check payment amounts to see total and profit.';line.classList.toggle('draft-margin-warning',!!r?.belowFloor);}
  for(const box of editor.querySelectorAll('[data-draft-suggestion-host]')){
   const suggestion=next.suggestions?.[box.dataset.draftSuggestionHost],p=next.options?.find(p=>p.id===box.dataset.draftSuggestionHost);
   box.innerHTML=!suggestion?'':!suggestion.available?'<p class="helper">'+suggestion.reason+'</p>':'<section class="draft-suggestion"><h4>Suggested draft amounts</h4><p>'+(p.months?'Keep '+(p.owns?'deposit':'setup fee')+' at '+money(suggestion.upfront)+'. Monthly payment: '+money(suggestion.monthly)+'.':'Pay in full: '+money(suggestion.upfront)+'.')+'</p><p>Total '+money(suggestion.total)+' · Profit '+money(suggestion.profit)+' · '+(suggestion.margin*100).toFixed(2)+'% before tax.</p><p class="helper">Check these amounts. They are not an approved customer quote.</p><button type="button" class="btn btn-ghost" data-draft-suggestion="'+suggestion.id+'">Use these amounts</button></section>';
  }
  if(Object.keys(next.errors).length)editor.querySelector('.draft-cost-details').open=true;
  const count=next.estimate?.rows.filter(r=>r.belowFloor).length;if(save)save.disabled=preview||saving||!next.estimate;
  status.textContent=!next.estimate?'Check the fields. Profit is unavailable until they are valid.':(restore?'Saved draft restored. ':'Updated. ')+(count?count+' '+(count===1?'option is':'options are')+' below 26%. Review before quoting.':'All four estimates reach 26%. Final amounts still need checking.');
 }
 show(initial,true);status.textContent='';
 function edit(e){if(current()&&!saving)show(e.target.dataset.draftPayment?model.updatePayment(e.target.dataset.planId,e.target.dataset.paymentKey,e.target.value):model.update(e.target.dataset.draftCost,e.target.value));}
 function restore(){if(current()&&!saving)show(model.reset(),true);}
 function apply(e){const button=e.target.closest('[data-draft-suggestion]');if(!button||!current()||saving)return;const next=model.applySuggestion(button.dataset.draftSuggestion);show(next,true);editor.querySelector('#draft-payment-'+button.dataset.draftSuggestion+'-'+(button.dataset.draftSuggestion==='cash'?'upfront':'monthly'))?.focus();status.textContent='Suggestion applied. Review total and profit, then tap Save draft to keep it.';}
 async function persist(){
  const next=model.read();if(!current()||saving||preview||!next.estimate)return;
  saving=true;save.disabled=true;inputs.forEach(i=>i.disabled=true);reset.disabled=true;status.textContent='Saving draft…';
  try{const saved=await onSave({costs:{direct:Math.round(next.budget.packages[cameras].direct),care:Math.round(next.budget.policy.callbacks),business:Math.round(next.budget.policy.acquisition+next.budget.policy.overhead)},options:next.options.map(({id,upfront,monthly})=>({id,upfront,monthly}))});if(!current())return;show(model.accept(saved?.budget||saved,saved?.options),true);status.textContent='Draft saved on this job. Customer pricing is unchanged.';}
  catch(e){if(current())status.textContent=e.message||'Could not save. Your edits are still here. Try again.';}
  finally{saving=false;if(current()){inputs.forEach(i=>i.disabled=false);reset.disabled=false;save.disabled=preview||!model.read().estimate;}}
 }
 editor.addEventListener('click',apply);inputs.forEach(i=>i.addEventListener('input',edit));reset.addEventListener('click',restore);save?.addEventListener('click',persist);
 return {stop(){stopped=true;editor.removeEventListener('click',apply);inputs.forEach(i=>i.removeEventListener('input',edit));reset.removeEventListener('click',restore);save?.removeEventListener('click',persist);model.stop();}};
}
