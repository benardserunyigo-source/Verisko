import {planScopeKey,buildPlanApproval} from './client-plan-job.mjs';
import {reviewSavedClientOffer,selectSavedClientOffer} from './saved-client-offer.mjs';
import {createHash, timingSafeEqual} from 'node:crypto';
import {COMMERCIAL, validateQuotes} from './quote-guard.mjs';
import '../../../quote-pdf.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const valid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
const office=me=>['admin','operations'].includes(me?.role);
const won=j=>['Accepted','Scheduled','In progress','Installed','Handed over'].includes(j.stage);
const hash=s=>createHash('sha256').update(s).digest('hex');
const fingerprint=j=>hash(JSON.stringify([j.id,j.prospectId,j.business,j.ref,COMMERCIAL.map(k=>j[k]??null),j.quoteSnapshot,j.quotedTotal,j.quotedAt,j.validUntil,j.scheduledDate,won(j)]));
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
function current(record,j,now){return !!j&&!['Cancelled','Rejected'].includes(j.stage)&&!record.revokedAt&&Date.parse(record.expiresAt)>Date.parse(now)&&(record.fingerprint===fingerprint(j)||record.approval?.scopeKey===planScopeKey(j)&&record.approval?.linkHash===record.tokenHash);}
function status(record,j,now){return {jobId:record.jobId,createdAt:record.createdAt,expiresAt:record.expiresAt,current:current(record,j,now),revoked:!!record.revokedAt,choice:record.choice||null,approval:record.approval?{approvedAt:record.approval.approvedAt,approvedByName:record.approval.approvedByName,startDate:record.approval.startDate,schedule:record.approval.schedule,offer:record.approval.offer}:null,startDate:j?.clientPlanApproval?.startDate||j?.scheduledDate||'',...(record.mode?{mode:record.mode,draftVersion:record.draftVersion}:{} )};}
export function clientOffer(j,client,now){
 if(!j.pricingVerifiedAt||!j.quoteSnapshot||['Cancelled','Rejected'].includes(j.stage))throw fail('Save and check this quote before making a client link.',409);
 if(!won(j)&&(!j.validUntil||j.validUntil<now.slice(0,10)))throw fail('This quote has expired. Refresh it first.',409);
 const options=[];
 for(const plan of (won(j)?[j.paymentPlan]:['installments','cash'])){
  if(!['installments','cash'].includes(plan))continue;
  try{
   const q=won(j)?j:validateQuotes([j],[{...j,paymentPlan:plan,stage:'Sent'}],false,'',now)[0];
   if(q.quoteSnapshot.needsApproval||q.quoteSnapshot.releaseErrors?.length||q.quoteSnapshot.errors?.length)continue;
   const model=globalThis.VeriskoQuote.buildQuoteModel(q,{business:client?.business||j.business||'Your camera installation'},q.quoteSnapshot,{value:q.quotedTotal,date:q.quotedAt});
   const p=model.plans[0];if(!p||!(model.total>0))continue;
   options.push({id:plan,title:plan==='cash'?'Pay in 2 parts':'Pay over 3 months',total:model.total,rows:p.rows.map(r=>({label:r.label,amount:r.amount})),terms:model.terms,items:model.items.map(i=>({label:i.label,detail:i.detail,qty:i.qty,amount:i.amount}))});
  }catch{ /* An alternative requiring fresh cost approval is not offered. */ }
 }
 if(!options.length)throw fail('This quote needs review before it can be shared.',409);
 return {ref:j.ref||'Verisko quote',business:client?.business||j.business||'Your camera installation',options,existingAgreement:won(j)};
}
export function createClientPlanHandler({store,loadWorkspace,authorize,loadDraft,loadMarket,pricing,now=()=>new Date().toISOString()}){return async request=>{try{
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)throw fail('Open this link in your browser.',403);
 if(!['GET','POST'].includes(request.method))throw fail('Method not allowed.',405);
 let body={};if(request.method==='POST'){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw fail('Use the client page.',415);
  const text=await request.text();if(text.length>4096)throw fail('Request too large.',413);try{body=JSON.parse(text);}catch{throw fail('Invalid request.');}
 }
 const stamp=now(),publicAction=['view','choose'].includes(body.action);
 const auth=publicAction?null:await authorize(request);
 if(!publicAction&&!office(auth?.me))throw fail('Operations access is needed.',auth?.me?403:auth?.status||401);
 const data=await loadWorkspace(),jobs=data.jobs||[],jobId=body.jobId||new URL(request.url).searchParams.get('jobId');
 if(request.method==='GET'&&!jobId){const items=[];for await(const page of store.list({prefix:'jobs/',paginate:true}))for(const b of page.blobs){const record=await store.get(b.key,{type:'json'}),j=jobs.find(j=>j.id===record?.jobId);if(j)items.push(status(record,j,stamp));}return json({ok:true,items});}
 if(!valid(jobId))throw fail('Link not found.',404);
 const key='jobs/'+jobId,j=jobs.find(j=>j.id===jobId),old=await store.getWithMetadata(key,{type:'json'}),record=old?.data;
 if(publicAction){
  if(!/^[A-Za-z0-9_-]{43}$/.test(body.token||'')||!record||!timingSafeEqual(Buffer.from(hash(body.token),'hex'),Buffer.from(record.tokenHash,'hex')))throw fail('Link not found.',404);
  if(!current(record,j,stamp))throw fail('This link is no longer active. Ask Verisko for a new link.',410);
  if(body.action==='view')return json({ok:true,offer:record.offer,choice:record.choice||null,expiresAt:record.expiresAt});
  const plan=record.offer.options.find(p=>p.id===body.plan),name=typeof body.name==='string'?body.name.trim():'';
  if(!plan||body.confirmed!==true||name.length<2||name.length>100||/[\x00-\x1f]/.test(name))throw fail('Choose a plan, enter your name and tick Yes.');
  if(record.choice){if(record.choice.plan===plan.id&&record.choice.name===name)return json({ok:true,choice:record.choice});throw fail('Your choice is already saved. Please contact Verisko to change it.',409);}
  const choice={plan:plan.id,title:plan.title,total:plan.total,rows:plan.rows,name,confirmed:true,at:stamp,...(plan.offer?{offer:plan.offer,totalLabel:plan.totalLabel,ownership:plan.ownership,terms:plan.terms}:{})};
  const write=await store.setJSON(key,{...record,choice},{onlyIfMatch:old.etag});if(!write.modified)throw fail('This link changed. Reload to see the saved choice.',409);
  return json({ok:true,choice});
 }
 if(!j)throw fail('Job not found.',404);
 if(request.method==='GET')return json({ok:true,item:record?status(record,j,stamp):null});
 if(body.action==='approve'){
  if(!record?.choice||!current(record,j,stamp))throw fail('This client reply changed or expired. Reload it before approving.',409);
  if(body.choiceAt!==record.choice.at||body.checked!==true)throw fail('Review the client choice and tick the check before approving.',409);
  if(record.approval){if(record.approval.startDate!==body.startDate)throw fail('This plan is already approved. Keep the saved payment dates.',409);return json({ok:true,item:status(record,j,stamp)});}
  if(won(j))throw fail('This job already has agreed terms. Keep the saved agreement.',409);
  if(!loadDraft||!pricing)throw fail('Saved costs are unavailable. Reload before approving.',503);
  const draft=await loadDraft(request,jobId);
  const approval=buildPlanApproval({job:j,record,draft,pricing,start:body.startDate,actor:auth.me,now:stamp});
  const next={...record,approval};const write=await store.setJSON(key,next,{onlyIfMatch:old.etag});if(!write.modified)throw fail('This client reply changed. Reload before approving.',409);
  return json({ok:true,item:status(next,j,stamp)});
 }
 if(body.action==='revoke'){
  if(!record)return json({ok:true});const write=await store.setJSON(key,{...record,revokedAt:stamp,revokedBy:auth.me.id},{onlyIfMatch:old.etag});if(!write.modified)throw fail('Link changed. Try again.',409);return json({ok:true});
 }
 if(record?.approval&&['reviewDraft','createDraft','create'].includes(body.action))throw fail('This client plan is approved. Keep its saved terms and dates.',409);
 let review=null,sourceDraft=null;
 if(['reviewDraft','createDraft'].includes(body.action)){
  if(!loadDraft||!pricing)throw fail('Saved options are unavailable. Refresh and try again.',503);
  const draft=sourceDraft=await loadDraft(request,jobId),market=loadMarket?await loadMarket():null;
  review=reviewSavedClientOffer({job:j,client:(data.prospects||[]).find(p=>p.id===j.prospectId),draft,version:body.draftVersion,pricing,market,now:stamp});
  if(body.action==='reviewDraft')return json({ok:true,review});
  if(!Number.isSafeInteger(body.draftVersion)||body.draftVersion<1)throw fail('Review the saved draft again before creating this link.',400);
  if(body.checked!==true)throw fail('Check the equipment, costs and payment terms before making a client link.',400);
 }
 if(!['create','createDraft'].includes(body.action))throw fail('Choose an action.');
 if(!/^[A-Za-z0-9_-]{43}$/.test(body.token||''))throw fail('A secure link is needed. Reload and try again.');
 if(record?.choice&&current(record,j,stamp))throw fail('The client already chose a plan. Review their reply before making a new link.',409);
 // Token is generated by Web Crypto in the operator's browser. Only its hash
 // is stored. Retrying the same creation returns the same issued snapshot.
 if(record?.tokenHash===hash(body.token)&&current(record,j,stamp)){if(review&&(record.mode!=='savedDraft'||record.draftVersion!==review.draftVersion||JSON.stringify(record.offer.options.map(p=>p.id))!==JSON.stringify(body.optionIds)))throw fail('This link request changed. Review it again.',409);return json({ok:true,item:status(record,j,stamp)});}
 const offer=review?selectSavedClientOffer(review,body.optionIds):clientOffer(j,(data.prospects||[]).find(p=>p.id===j.prospectId),stamp);
 const expiry=review?Date.parse(stamp)+7*86400000:won(j)?Date.parse(stamp)+7*86400000:Math.min(Date.parse(stamp)+7*86400000,Date.parse(j.validUntil+'T23:59:59.999Z'));
 const next={...(review?{mode:'savedDraft',draftVersion:review.draftVersion,costReview:{budget:sourceDraft.item.budget,options:sourceDraft.item.options}}:{}),jobId,tokenHash:hash(body.token),fingerprint:fingerprint(j),offer,createdAt:stamp,createdBy:auth.me.id,expiresAt:new Date(expiry).toISOString(),choice:null,previousChoices:[...(record?.previousChoices||[]),...(record?.choice?[record.choice]:[])]};
 const write=await store.setJSON(key,next,old?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(!write.modified)throw fail('Someone changed this link. Try again.',409);
 return json({ok:true,item:status(next,j,stamp)});
 }catch(e){return json({ok:false,error:e.status?e.message:'Could not save the client choice. Try again.'},e.status||500);}};}
