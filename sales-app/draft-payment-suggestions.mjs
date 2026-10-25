import {draftCostBudget,draftCostEstimate,draftPaymentOptions} from './draft-payment-options.mjs?v=151';
// A small display cushion ensures a suggested margin reads above 26.00%.
// This is a draft review target, not a change to the quote's existing margin rule.
export const DRAFT_SUGGESTION_TARGET=.2601;
const STEP=10000;
export function draftPaymentSuggestion(role,pricing,{cameras=4,options,planId}={}){
 const budget=draftCostBudget(role,pricing,{cameras}),plans=draftPaymentOptions(role,{cameras,options});
 if(!budget||plans.length!==4)return null;
 const current=draftCostEstimate(role,budget,{cameras,options:plans}),index=plans.findIndex(p=>p.id===planId);
 if(!current||index<0||!current.rows[index].belowFloor&&!current.rows[index].belowTarget)return null;
 const plan=plans[index],target=(plan.targetMargin??.26)+.0001,key=plan.months?'monthly':'upfront';
 const unavailable=()=>({id:planId,available:false,reason:'No automatic suggestion. Review job costs and payment fees.'});
 const amounts=plans.map(({id,upfront,monthly,targetMargin})=>({id,upfront,monthly,...(targetMargin!==undefined?{targetMargin}:{})}));
 const maxUnits=Math.floor((Number.MAX_SAFE_INTEGER-(plan.months?plan.upfront:0))/(plan.months||1)/STEP);
 function evaluate(units){
  const value=units*STEP;if(!Number.isSafeInteger(value))return null;
  const trial=amounts.map((p,i)=>i===index?{...p,[key]:value}:p);
  const estimate=draftCostEstimate(role,budget,{cameras,options:trial});
  return estimate?{row:estimate.rows[index],options:trial}:null;
 }
 let low=plan[key]/STEP,high=Math.min(maxUnits,Math.max(1,low+1)),upper=null;
 // Bounded search. No unsupported promise that a suggestion always exists.
 for(let n=0;n<54;n++){
  const candidate=evaluate(high);
  if(!candidate)return unavailable();
  if(candidate.row.margin>=target){upper=candidate;break;}
  if(high===maxUnits)return unavailable();
  low=high;high=Math.min(maxUnits,Math.max(high+1,high*2));
 }
 if(!upper)return unavailable();
 for(let n=0;high-low>1&&n<54;n++){
  const mid=low+Math.floor((high-low)/2),candidate=evaluate(mid);
  if(!candidate)return unavailable();
  if(candidate.row.margin>=target){high=mid;upper=candidate;}else low=mid;
 }
 // Recompute the actual rounded pair before offering it for review.
 const final=evaluate(high);
 if(!final||final.row.belowFloor||final.row.margin<target)return unavailable();
 const chosen=final.options[index];
 return {id:planId,available:true,upfront:chosen.upfront,monthly:chosen.monthly,total:chosen.upfront+chosen.monthly*plan.months,cost:final.row.cost,profit:final.row.profit,margin:final.row.margin};
}
