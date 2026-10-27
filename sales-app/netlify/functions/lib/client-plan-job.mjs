import {planSchedule,standardPlanOffer} from '../../../client-plan-schedule.mjs';
export {planSchedule} from '../../../client-plan-schedule.mjs';
import {createHash} from 'node:crypto';
import {COMMERCIAL,validateQuotes} from './quote-guard.mjs';
import {draftCostEstimate,draftCostBudget} from '../../../draft-payment-options.mjs';
export const clientQuoteFingerprint=j=>createHash('sha256').update(JSON.stringify([j.id,j.prospectId,j.business,j.ref,COMMERCIAL.map(k=>j[k]??null),j.quoteSnapshot,j.quotedTotal,j.quotedAt,j.validUntil,j.scheduledDate,['Accepted','Scheduled','In progress','Installed','Handed over'].includes(j.stage)])).digest('hex');
export const planScopeKey=j=>createHash('sha256').update(JSON.stringify([j.id,j.prospectId,j.business,j.ref,COMMERCIAL.map(k=>k==='paymentPlan'&&j.clientPlanApproval?j.clientPlanApproval.previousPaymentPlan??null:j[k]??null)])).digest('hex');
const fail=(s,status=409)=>Object.assign(Error(s),{status});
function standardApproval({job,record,pricing,start,completionDate,actor,now}){
 if(job.quoteSnapshot?.needsApproval||job.quoteSnapshot?.errors?.length)throw fail('The Owner must review the job costs before approving this plan.');
 const chosen=record.offer.options.find(p=>p.id===record.choice.plan);if(!chosen||record.offer.existingAgreement)throw fail('Keep the saved agreement.');
 const offer=standardPlanOffer(chosen);
 let checked;try{checked=validateQuotes([job],[{...job,paymentPlan:offer.id,stage:'Sent',renewQuote:true}],false,'',now,pricing)[0];}catch(e){throw fail(e.message);}
 const snapshot=checked.quoteSnapshot,cost=Math.max(Number(job.quoteSnapshot?.costOfDoingBusiness)||0,Number(snapshot.costOfDoingBusiness)||0),target=Math.max(.26,Number(job.targetMargin)||0,Number(snapshot.targetMargin)||0),margin=(offer.total-cost)/offer.total;
 if(!cost||snapshot.needsApproval||snapshot.errors?.length||snapshot.releaseErrors?.length||margin+1e-12<target)throw fail('This plan needs cost review before approval. Keep the client amounts and review the quote.');
 const schedule=planSchedule(offer,start,completionDate);
 return {id:createHash('sha256').update(job.id+'|'+record.tokenHash+'|'+record.choice.at).digest('hex'),jobId:job.id,contactId:job.prospectId,scopeKey:planScopeKey(job),linkHash:record.tokenHash,choiceAt:record.choice.at,previousPaymentPlan:job.paymentPlan??null,approvedAt:now,approvedBy:actor.id,approvedByName:actor.name||'Operations',startDate:start,...(offer.id==='cash'?{completionDate}:{}),offer,ownership:'You own the equipment after full payment.',terms:chosen.terms,totalLabel:'Agreed total',schedule,financials:{targetMargin:target,cost,profit:offer.total-cost,margin,financing:snapshot.financing},sourceJob:structuredClone(job)};
}
export function buildPlanApproval({job,record,draft,pricing,start,completionDate,actor,now}){
 if(record.mode!=='savedDraft')return standardApproval({job,record,pricing,start,completionDate,actor,now});
 const chosen=record.offer.options.find(p=>p.id===record.choice?.plan),offer=chosen?.offer;
 if(job.quoteSnapshot?.needsApproval)throw fail('The Owner must approve the job costs before this client plan can be approved.');
 if(job.quoteSnapshot?.errors?.length)throw fail('The job costs or equipment need review before approving this plan.');
 if(record.mode!=='savedDraft'||!offer)throw fail('This link uses an older plan. Review it in Job records.');
 const basis=record.costReview||{budget:draft?.item?.budget,options:draft?.item?.options};
 if(!record.costReview&&draft?.item?.version!==record.draftVersion)throw fail('Draft costs changed. Review and send a new client link.');
 if(!basis.budget||!draft?.item?.budget)throw fail('Load the saved job costs before approving.');
 const oldPlan=basis.options?.find(p=>p.id===offer.id),latest=draft.item.options?.find(p=>p.id===offer.id),target=Math.max(.26,oldPlan?.targetMargin||.26,latest?.targetMargin||.26);
 const options=basis.options.map(p=>p.id===offer.id?{...p,...offer,targetMargin:target}:p),cameras=Number(job.cameraCount??job.quoteSnapshot?.cameras);
 const results=[basis.budget,draft.item.budget,pricing].map(b=>{const budget=draftCostBudget('operations',b,{cameras});if(!budget)return null;const sourceDirect=Number(job.quoteSnapshot?.direct)||0;return draftCostEstimate('operations',{...budget,packages:{[cameras]:{direct:Math.max(sourceDirect,budget.packages[cameras].direct)}}},{cameras,options})?.rows.find(r=>r.id===offer.id);});
 if(results.some(r=>!r||r.margin<target))throw fail('This plan is below the profit target with the latest costs. Review costs and send a new quote.');
 const result=results.reduce((a,b)=>b.cost>a.cost?b:a),schedule=planSchedule(offer,start);
 return {id:createHash('sha256').update(job.id+'|'+record.tokenHash+'|'+record.choice.at).digest('hex'),jobId:job.id,contactId:job.prospectId,scopeKey:planScopeKey(job),linkHash:record.tokenHash,choiceAt:record.choice.at,previousPaymentPlan:job.paymentPlan??null,approvedAt:now,approvedBy:actor.id,approvedByName:actor.name||'Operations',startDate:start,offer,ownership:chosen.ownership,terms:chosen.terms,totalLabel:chosen.totalLabel,schedule,financials:{targetMargin:target,cost:result.cost,profit:offer.total-result.cost,margin:result.margin,financing:result.financing},sourceJob:structuredClone(job)};
}
export function publicPlanApproval(a){if(!a)return null;return Object.fromEntries(['id','jobId','contactId','scopeKey','linkHash','choiceAt','previousPaymentPlan','approvedAt','approvedBy','approvedByName','startDate','completionDate','offer','ownership','terms','totalLabel','schedule'].map(k=>[k,a[k]]));}
export async function loadClientPlans(store){const out=[];for await(const page of store.list({prefix:'jobs/',paginate:true}))for(const b of page.blobs){const r=await store.get(b.key,{type:'json'});if(r?.approval||r?.choice)out.push(r);}return out;}
export function projectClientPlans(data,plans=[]){
 const jobs=[...(data.jobs||[])];
 for(const r of plans){const a=r.approval;if(!a)continue;let index=jobs.findIndex(j=>j.id===a.jobId),j=index<0?a.sourceJob:jobs[index];
 if(!j||j.prospectId!==a.contactId||planScopeKey(j)!==a.scopeKey)continue;
 const retained=j.clientPlanApproval?.id===a.id,financials=a.financials;
 const next={...j,stage:j.stage==='Draft'?'Sent':j.stage,quotedTotal:a.offer.total,paymentPlan:a.offer.id,clientPlanApproval:publicPlanApproval(a),paymentSchedule:a.schedule,
 quoteSnapshot:{...j.quoteSnapshot,clientPlan:a.offer,paymentPlan:a.offer.id,paymentSchedule:a.schedule,totalLabel:a.offer.owns?'Agreed total':'First 12 months',targetMargin:financials.targetMargin,cash:a.offer.total,financed:a.offer.total,costOfDoingBusiness:financials.cost,netProfit:financials.profit,margin:financials.margin,financing:financials.financing,payments:a.schedule.map(x=>x.amount),needsApproval:false,releaseErrors:[],errors:[]},
 ...(!retained?{fundingConfirmed:false,fundingApprovedKey:'',fundingApprovedBy:''}:{})};
 if(index<0)jobs.push(next);else jobs[index]=next;
 }
 const prospects=(data.prospects||[]).map(p=>{const next={...p};delete next.planProgress;const matches=plans.filter(r=>r.choice&&jobs.some(j=>j.id===r.jobId&&j.prospectId===p.id&&(r.approval?planScopeKey(j)===r.approval.scopeKey:!r.revokedAt&&Date.parse(r.expiresAt)>Date.now()&&r.fingerprint===clientQuoteFingerprint(j))));if(matches.length===1){const r=matches[0];next.planProgress={sourceId:r.jobId,status:r.approval?'approved':'chosen',...(r.approval?{firstDue:r.approval.schedule[0].due}:{})};}return next;});
 return {...data,jobs,prospects};
}
