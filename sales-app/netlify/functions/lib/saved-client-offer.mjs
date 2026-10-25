import {draftCostEstimate} from '../../../draft-payment-options.mjs';
import {salesDraftOffer} from '../../../sales-draft-offer.mjs';
import {salesPriceView} from '../../../sales-price-policy.mjs';
const fail=(message,status=409)=>Object.assign(Error(message),{status});
export function reviewSavedClientOffer({job,client,draft,version,pricing,market,now}){
 if(['Accepted','Scheduled','In progress','Installed','Handed over'].includes(job.stage))throw fail('This job already has agreed terms. Keep that agreement. Create a revised quote separately if needed.');
 if(['Cancelled','Rejected'].includes(job.stage))throw fail('This job is closed.');
 const item=draft?.item,cameras=draft?.cameras;
 if(!item)throw fail('Save draft costs and payment options on this job first.');
 if(version!=null&&item.version!==version)throw fail('The saved draft changed. Open it again and review the new amounts.');
 if(job.costConfirmed!==true||!String(job.costEvidence||'').trim()||!job.quoteSnapshot||!job.pricingVerifiedAt)throw fail('Open the job record. Check its equipment and costs, add the cost reference, and save it before making a client quote.');
 if(salesPriceView(market,Date.parse(now)).status==='expired')throw fail('Sales prices have expired. Operations must review and renew them first.');
 const scopes=globalThis.VeriskoQuote.buildQuoteModel(job,{business:client?.business||job.business||'Your camera installation'},job.quoteSnapshot,{value:job.quotedTotal||job.quoteSnapshot.cash,date:now.slice(0,10)}).items.map(i=>({label:i.label,detail:i.detail,qty:i.qty}));
 if(!scopes.length)throw fail('Save the equipment list on this job before sharing a client quote.');
 const options=item.options.map(plan=>{
  const offer=salesDraftOffer(plan,cameras);if(!offer)return null;
  const target=plan.targetMargin??.26;
  const results=[item.budget,pricing].map(b=>draftCostEstimate('operations',b,{cameras,options:item.options})?.rows.find(r=>r.id===plan.id));
  let eligible=results.every(r=>r&&r.margin>=Math.max(.26,target)),reason=eligible?'':'Below the profit target with saved or current costs.';
  const published=market?.catalogue?.find(r=>r.cameras===cameras),approval=market?.sourceApprovals?.[cameras];
  if(published?.offer?.id===plan.id&&approval?.jobId===job.id&&JSON.stringify(published.offer)!==JSON.stringify(offer)){eligible=false;reason='This saved option differs from the Sales offer. Update Sales prices first.';}
  const ownership=!offer.owns?'Verisko owns the equipment. Monthly rent does not buy it.':offer.months?'You own the equipment after the last monthly payment.':'You own the equipment after full payment.';
  const rows=offer.months?[{label:offer.owns?'Deposit at the start':'Setup fee at the start',amount:offer.upfront},{label:offer.owns?'Each month for '+offer.months+' months':'Each month while you rent',amount:offer.monthly}]:[{label:'One full payment',amount:offer.total}];
  const terms=[ownership,offer.months?'Verisko will confirm the start date. Monthly payments begin one month after the start payment.':'Verisko will confirm payment and installation dates.',...(offer.owns?[]:['The total shown covers the first 12 months only. Rent keeps going. Agree how to stop rental and return equipment with Verisko before confirming.']),...globalThis.VeriskoQuote.buildQuoteModel(job,{},job.quoteSnapshot,{value:offer.total,date:now.slice(0,10)}).terms.filter(t=>!/(60%|40%|30%|three.month|3.month|instalment|installment|full payment|payment plan)/i.test(t))];
  return {id:offer.id,title:offer.title,total:offer.total,totalLabel:offer.owns?'Total paid':'First 12 months',rows,terms,items:scopes,ownership,offer,eligible,reason};
 }).filter(Boolean);
 if(!options.length)throw fail('Saved payment options need review.');
 return {draftVersion:item.version,cameras,ref:job.ref||'Verisko quote',business:client?.business||job.business||'Your camera installation',options,existingAgreement:false};
}
export function selectSavedClientOffer(review,ids){
 if(!Array.isArray(ids)||!ids.length||ids.length>4||new Set(ids).size!==ids.length)throw fail('Choose at least one checked payment plan.',400);
 const plans=ids.map(id=>review.options.find(p=>p.id===id));
 if(plans.some(p=>!p||!p.eligible))throw fail('One selected plan needs review. Check the saved amounts and profit target.');
 return {ref:review.ref,business:review.business,existingAgreement:false,options:plans.map(({eligible,reason,...p})=>p)};
}
