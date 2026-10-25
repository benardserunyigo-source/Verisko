import {salesPriceView,salesPriceRows,SALES_PRICE_DAYS} from '../../../sales-price-policy.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>Object.assign(Error(message),{status});
export function createSalesPricesHandler({store,authorize,pricing,now=()=>Date.now()}){return async request=>{try{
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
 const catalogue=salesPriceRows(body.catalogue);
 if(!pricing.policy?.fx)throw fail('The private job budget is unavailable.',503);
 for(const r of catalogue){const estimate=pricing.compute({cameraCount:r.cameras,priceOverride:true,finalPrice:r.price});if(!Number.isFinite(estimate.margin)||estimate.margin<.26||estimate.errors.length)throw fail(r.cameras+' cameras: price must cover costs and at least 26% before tax.');}
 const at=now(),next={version:body.version+1,publishedAt:new Date(at).toISOString(),expiresAt:new Date(at+SALES_PRICE_DAYS*86400000).toISOString(),catalogue,updatedBy:me.id};
 const written=await store.setJSON('current',next,record?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(!written.modified)throw fail('Prices changed. Reload before saving.',409);
 return json({ok:true,...salesPriceView(next,at),savedCatalogue:catalogue});
 }catch(e){return json({ok:false,error:e.status?e.message:e.message==='Use whole UGX 10,000 steps, above 0.'||e.message==='Enter prices for 4, 6, 8 and 12 cameras.'?e.message:'Could not save prices. Try again.'},e.status||400);}};}
