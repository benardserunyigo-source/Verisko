export const SALES_PRICE_DAYS=30;
export function salesPriceView(record,now=Date.now()){
 if(!record)return {status:'missing',catalogue:[],expiresAt:null,version:0};
 const active=Number.isFinite(Date.parse(record.expiresAt))&&now<Date.parse(record.expiresAt);
 return {status:active?'active':'expired',catalogue:active?record.catalogue:[],expiresAt:record.expiresAt,publishedAt:record.publishedAt,version:record.version};
}
export function salesPriceRows(rows){
 if(!Array.isArray(rows)||rows.length!==4||new Set(rows.map(r=>r?.cameras)).size!==4)throw Error('Enter prices for 4, 6, 8 and 12 cameras.');
 return [4,6,8,12].map(cameras=>{const r=rows.find(r=>r.cameras===cameras),price=r?.price;
 if(!Number.isSafeInteger(price)||price<=0||price%10000||price>1000000000)throw Error('Use whole UGX 10,000 steps, above 0.');
 const a=Math.round(price*.4/10000)*10000,b=Math.round(price*.3/10000)*10000;
 return {cameras,name:({4:'Essential',6:'Standard',8:'Premium',12:'Commercial'})[cameras],price,payments:[a,b,price-a-b],recorderChannels:cameras<=8?8:16};});
}
