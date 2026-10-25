import {draftCostEstimate,draftPaymentOptions} from '../../../draft-payment-options.mjs';
import {salesDraftOffer} from '../../../sales-draft-offer.mjs';
import {salesPriceView,salesPriceRows,SALES_PRICE_DAYS} from '../../../sales-price-policy.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>Object.assign(Error(message),{status});
export function createSalesPricesHandler({store,authorize,pricing,loadDraft,now=()=>Date.now()}){return async request=>{try{
 const auth=await authorize(request),me=auth?.me;if(!me)throw fail('Sign in first.',auth?.status||401);
 if(!['admin','operations','sales','teamlead'].includes(me.role))throw fail('Access not allowed.',403);
 if(!['GET','POST'].includes(request.method))throw fail('Method not allowed.',405);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)throw fail('Open this page in the app.',403);
 const old=await store.getWithMetadata('current',{type:'json'}),record=old?.data;
 if(request.method==='GET')return json({ok:true,...salesPriceView(record,now()),...(['admin','operations'].includes(me.role)?{savedCatalogue:record?.catalogue||pricing.publicPackages()}:{} )});
 if(!['admin','operations'].includes(me.role))throw fail('Operations access is needed.',403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw fail('Use the price form.',415);
 const raw=await request.text();if(raw.length>4096)throw fail('Request too large.',413);
 let body;try{body=JSON.parse(raw);}catch{throw fail('Invalid request.');}
 if(!Number.isSafeInteger(body.version)||body.version!==(record?.version||0))throw fail('Prices changed. Reload before saving.',409);
 let catalogue,sourceApprovals={...(record?.sourceApprovals||{})};
 if(body.action==='useDraft'){
  const source=body.source;
  if(!source||typeof source.jobId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(source.jobId)||!Number.isSafeInteger(source.draftVersion)||!['cash','12months','24months','rental'].includes(source.optionId)||!loadDraft)throw fail('Choose a saved draft option.');
  const loaded=await loadDraft(request,source.jobId),item=loaded?.item;
  if(!item)throw fail('Save this draft before using it for Sales.',409);
  if(item.version!==source.draftVersion)throw fail('This draft changed. Reload and review it again.',409);
  const cameras=loaded.cameras,plan=item.options?.find(p=>p.id===source.optionId),offer=salesDraftOffer(plan,cameras);
  if(!offer)throw fail('This saved option needs review.',409);
  const result=draftCostEstimate('operations',item.budget,{cameras,options:item.options})?.rows.find(r=>r.id===offer.id),target=plan.targetMargin??.26;
  if(!result||result.margin<target||result.margin<.26)throw fail('This saved option is below its profit target. Update and save the draft first.');
  const before=record?.catalogue||pricing.publicPackages();catalogue=salesPriceRows(before).map(row=>{const oldRow=before.find(p=>p.cameras===row.cameras);return row.cameras===cameras?{...row,price:offer.total,payments:[],offer}:oldRow;});
  sourceApprovals[cameras]={jobId:source.jobId,draftVersion:item.version,optionId:offer.id,target,budget:item.budget};
 }else{
  if(body.action!==undefined)throw fail('Use the price form.');
  catalogue=salesPriceRows(body.catalogue).map(row=>{const oldRow=record?.catalogue?.find(p=>p.cameras===row.cameras);if(!oldRow?.offer)return {...row,name:oldRow?.name||row.name};
   if(row.price!==oldRow.price)throw fail('Use another saved draft to change this option and its payment terms.');
   if(row.priceMax!==undefined)throw fail('Saved payment options keep their exact price. Use another saved draft to change the terms.');
   return {...row,name:oldRow.name,payments:[],offer:oldRow.offer};
  });
 }
 if(!pricing.policy?.fx)throw fail('The private job budget is unavailable.',503);
 for(const r of catalogue){if(r.offer){const offer=salesDraftOffer(r.offer,r.cameras),approval=sourceApprovals[r.cameras];if(!offer||offer.total!==r.price||!approval)throw fail('Saved offer needs review.',409);for(const basis of [approval.budget,pricing]){const optionSet=draftPaymentOptions('operations',{cameras:r.cameras}).map(p=>p.id===offer.id?offer:p);const row=draftCostEstimate('operations',basis,{cameras:r.cameras,options:optionSet})?.rows.find(p=>p.id===offer.id);if(!row||row.margin<Math.max(.26,approval.target))throw fail(r.cameras+' cameras: saved or current costs are above this option’s profit target. Review the draft.');}continue;}const estimate=pricing.compute({cameraCount:r.cameras,priceOverride:true,finalPrice:r.price});if(!Number.isFinite(estimate.margin)||estimate.margin<.26||estimate.errors.length)throw fail(r.cameras+' cameras: price must cover costs and at least 26% before tax.');}
 const at=now(),next={version:body.version+1,publishedAt:new Date(at).toISOString(),expiresAt:new Date(at+SALES_PRICE_DAYS*86400000).toISOString(),catalogue,sourceApprovals,updatedBy:me.id};
 const written=await store.setJSON('current',next,record?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(!written.modified)throw fail('Prices changed. Reload before saving.',409);
 return json({ok:true,...salesPriceView(next,at),savedCatalogue:catalogue});
 }catch(e){return json({ok:false,error:e.status?e.message:e.message==='Use whole UGX 10,000 steps, above 0.'||e.message==='Enter prices for 4, 6, 8 and 12 cameras.'||e.message==='Complex price must be at least the simple price, in UGX 10,000 steps.'?e.message:'Could not save prices. Try again.'},e.status||400);}};}
