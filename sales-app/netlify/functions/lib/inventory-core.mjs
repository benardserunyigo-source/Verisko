import {allocateWarehouse,warehouseHolds} from './warehouse-stock.mjs';
import {createHash} from 'node:crypto';
import {MATERIALS,stockUnit,materialKey,reviewDate,reviewDue} from '../../../inventory-catalog.mjs';
const fail=(m,s=400)=>Object.assign(Error(m),{status:s});
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const round=n=>Math.round(n*100)/100;
const text=(v,n=150)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,n):'';
const json=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export const materialId=(name,unit)=>'stock-'+hash(materialKey(name,unit)).slice(0,24);
export async function stockRecords(store,prefix){const out=[];for await(const page of store.list({prefix,paginate:true}))for(const b of page.blobs){const row=await store.get(b.key,{type:'json'});if(row)out.push(row);}return out;}
export function inventoryView(record={},cases=[],jobs=[],now=Date.now()){
 const rows=new Map();
 function item(name,unit){unit=stockUnit(unit);if(!name||!['pcs','m','box','roll','sets'].includes(unit))return null;const id=materialId(name,unit);if(!rows.has(id))rows.set(id,{id,name,unit,ordered:0,arrived:0,issued:0,returned:0,atSite:0,damaged:0,events:[]});return rows.get(id);}
 for(const [n,u] of MATERIALS)item(n,u);
 for(const c of cases)for(const p of c.materialPlans||[])for(const m of p.items||[]){const r=item(m.name,m.unit);if(!r)continue;
  for(const [kind,list] of [['order',m.orders],['arrival',m.receipts]])(list||[]).forEach((x,index)=>{const q=Number(x.quantity)||0;r[kind==='order'?'ordered':'arrived']+=q;r.events.push({key:[kind,c.contactId,p.sourceId,m.id,index].join('/'),type:kind,quantity:q,at:x.at,date:x.date,job:p.label||p.sourceId,supplier:x.supplier||'',reference:x.reference||'',link:x.link||'',unitCost:x.unitCost??null,currency:x.currency||''});});
 }
 for(const j of jobs)for(const m of j.materials?.items||[]){const r=item(m.name,m.unit);if(!r)continue;r.issued+=m.issued||0;r.returned+=m.returnedGood||0;r.damaged+=m.returnedDamaged||0;r.atSite+=Math.max(0,(m.issued||0)-(m.used||0)-(m.damaged||0)-(m.missing||0)-(m.returnedGood||0));
  if(m.issued||m.returnedGood||m.returnedDamaged)r.events.push({key:'site/'+j.id+'/'+m.id,type:'site',quantity:m.issued||0,returned:m.returnedGood||0,damaged:m.returnedDamaged||0,at:j.updatedAt||j.createdAt,job:j.business||j.id});
 }
 for(const saved of record.items||[])item(saved.name,saved.unit);
 const holds=warehouseHolds(record,cases,jobs);
 const items=[...rows.values()].map(r=>{const saved=record.items?.find(s=>s.id===r.id)||{},flow={arrived:round(r.arrived),issued:round(r.issued),returned:round(r.returned)};
  const basis=hash(r.events.map(e=>({...e,at:undefined})).sort((a,b)=>a.key.localeCompare(b.key)));
  const itemHolds=holds.filter(h=>materialKey(h.name,h.unit)===materialKey(r.name,r.unit)),reserved=round(itemHolds.reduce((n,h)=>n+h.quantity,0));
  const count=saved.count,stock=count?round(count.quantity+flow.arrived-(count.flow?.arrived||0)-flow.issued+(count.flow?.issued||0)+flow.returned-(count.flow?.returned||0)):null;
  return {...r,ordered:round(r.ordered),arrived:flow.arrived,issued:flow.issued,returned:flow.returned,atSite:round(r.atSite),damaged:round(r.damaged),waiting:round(r.ordered-r.arrived),flow,basis,stock,reserved,available:stock===null?null:round(stock-reserved),holds:itemHolds,count:count||null,price:saved.price||null,source:saved.source||'',quotes:saved.quotes||[],history:saved.history||[],priceDue:reviewDue(saved.price?.at,now),stockDue:reviewDue(count?.at,now),priceReviewOn:reviewDate(saved.price?.at),stockReviewOn:reviewDate(count?.at)};
 }).sort((a,b)=>a.name.localeCompare(b.name));
 return {version:record.version||0,items,reviewDays:30,serverAt:new Date(now).toISOString()};
}
function amount(v,unit){const n=Number(v);if(v===''||v===null||typeof v==='boolean'||!Number.isFinite(n)||n<0||n>1e9||Math.abs(n*100-Math.round(n*100))>1e-6||(unit!=='m'&&!Number.isInteger(n)))throw fail('Enter a valid amount. Use whole numbers except for metres.');return n;}
function price(v,currency){const n=Number(v);if(!['UGX','USD'].includes(currency)||v===''||v===null||typeof v==='boolean'||!Number.isFinite(n)||n<=0||n>1e9||Math.abs(n*100-Math.round(n*100))>1e-6||(currency==='UGX'&&!Number.isInteger(n)))throw fail('Enter a cost above zero. Use whole shillings for UGX.');return n;}
function link(v){const l=text(v,1000);if(!l)return '';let u;try{u=new URL(l);}catch{throw fail('Paste a full https link.');}if(u.protocol!=='https:'||u.username||u.password)throw fail('Use an https link without login details.');return l;}
export function createInventoryHandler({store,authorize,loadMovements,coordinate=(_,fn)=>fn(),now=()=>Date.now()}){return async request=>{try{
 let auth=await authorize(request),me=auth?.me;if(!me)throw fail('Sign in first.',auth?.status||401);if(!['operations','admin'].includes(me.role))throw fail('Only Operations can manage inventory.',403);
 if(!['GET','POST'].includes(request.method))throw fail('Method not allowed.',405);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)throw fail('Open this in the app.',403);
 return await coordinate(request.method,async()=>{
 if(request.method==='POST'){auth=await authorize(request);me=auth?.me;if(!['operations','admin'].includes(me?.role))throw fail('Only Operations can manage inventory.',auth?.status||403);}
 const loaded=await store.getWithMetadata('current',{type:'json'}),old=loaded?.data||{version:0,items:[],requests:[]};
 const {cases=[],jobs=[]}=await loadMovements(),view=inventoryView(old,cases,jobs,now());if(request.method==='GET')return json({ok:true,...view});
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw fail('Use the inventory form.',415);
 const raw=await request.text();if(raw.length>6000)throw fail('Request too large.',413);let body;try{body=JSON.parse(raw);}catch{throw fail('Invalid request.');}
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(body.requestId||''))throw fail('A unique save ID is needed.');
 const digest=hash({...body,version:undefined}),repeat=old.requests?.find(x=>x.id===body.requestId);if(repeat){if(repeat.by!==me.id||repeat.digest!==digest)throw fail('Save ID already used.',409);return json({ok:true,...view});}
 if(!Number.isSafeInteger(body.version)||body.version!==old.version)throw fail('Inventory changed. Refresh before saving.',409);
 const next=structuredClone(old),at=new Date(now()).toISOString();let row=view.items.find(i=>i.id===body.itemId),saved=next.items.find(i=>i.id===body.itemId);
 if(body.action==='allocate'){const result=allocateWarehouse(next,body,auth,cases,jobs,view,at);row=result.row;saved=next.items.find(i=>i.id===row.id);if(!saved){saved={id:row.id,name:row.name,unit:row.unit,source:'',quotes:[],history:[]};next.items.push(saved);}}else if(body.action==='add'){
  const name=text(body.name),unit=body.unit;if(name.length<2||!['pcs','m','box','roll','sets'].includes(unit))throw fail('Add an item name and unit.');const id=materialId(name,unit);if(view.items.some(i=>i.id===id))throw fail('This item is already here. Open it instead.');if(view.items.length>=500)throw fail('The item list is full. Ask Admin for help.');saved={id,name,unit,source:'',quotes:[],history:[]};next.items.push(saved);
 }else{
  if(!row)throw fail('Item not found.',404);if(!saved){saved={id:row.id,name:row.name,unit:row.unit,source:'',quotes:[],history:[]};next.items.push(saved);}
  if(body.action==='count'){
   if(row.basis!==body.basis)throw fail('Stock moved while you were counting. Refresh and check it again.',409);
   const note=text(body.note,300);if(note.length<3)throw fail('Add a short note about the stock count.');
   saved.count={quantity:amount(body.quantity,row.unit),flow:row.flow,at,by:me.name,note};
  }else if(body.action==='price'){
   const quote=body.quoteId?saved.quotes.find(q=>q.id===body.quoteId):null;if(body.quoteId&&!quote)throw fail('Quote not found.');
   if(quote&&Date.parse(quote.at)+30*86400000<=now())throw fail('This quote needs a new price check.',409);
   const source=quote?.source||body.source;if(!['China','Uganda'].includes(source))throw fail('Choose where you buy this item.');
   const cost=quote?.unitCost??price(body.unitCost,body.currency),currency=quote?.currency||body.currency;
   saved.source=source;saved.price={unitCost:cost,currency,source,supplier:quote?.supplier||text(body.supplier),link:quote?.link||link(body.link),at,by:me.name,quoteId:quote?.id||''};
  }else if(body.action==='quote'){
   const supplier=text(body.supplier);if(supplier.length<2||!['China','Uganda'].includes(body.source))throw fail('Add the supplier and where they are based.');if(saved.quotes.length>=100)throw fail('This item has 100 quotes. Ask Admin for help.');
   saved.quotes.push({id:body.requestId,supplier,source:body.source,unitCost:price(body.unitCost,body.currency),currency:body.currency,link:link(body.link),note:text(body.note,300),at,by:me.name});
  }else throw fail('Unknown inventory action.');
 }
 if(saved.history.length>=1000)throw fail('This item has reached its change limit. Ask Admin for help.',409);
 saved.history.push({id:body.requestId,action:body.action,at,by:me.name,...(body.action==='allocate'?{allocation:next.allocations.find(a=>a.contactId===body.contactId&&a.sourceId===body.sourceId&&a.materialItemId===body.materialItemId)}:body.action==='count'?{count:structuredClone(saved.count)}:body.action==='price'?{price:structuredClone(saved.price)}:{})});
 next.version++;next.requests=[...(next.requests||[]),{id:body.requestId,by:me.id,digest}].slice(-1000);
 const result=await store.setJSON('current',next,loaded?.etag?{onlyIfMatch:loaded.etag}:{onlyIfNew:true});if(!result?.modified)throw fail('Inventory changed. Refresh before saving.',409);
 return json({ok:true,...inventoryView(next,cases,jobs,now())});
 });
 }catch(e){return json({ok:false,error:e.status?e.message:'Could not save inventory. Please try again.'},e.status||500);}};}
