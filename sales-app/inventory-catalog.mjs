// Shared names/units only. Prices and stock are private, never bundled here.
export const MATERIALS=[['5MP bullet camera','pcs'],['5MP dome camera','pcs'],['4K bullet camera','pcs'],['4K dome camera','pcs'],['PTZ camera','pcs'],['Fisheye camera','pcs'],['8-channel PoE NVR','pcs'],['16-channel PoE NVR','pcs'],['Surveillance hard drive','pcs'],['Cat6 cable','m'],['RJ45 plugs','pcs'],['Junction boxes','pcs'],['Conduit','m'],['Trunking','m'],['Camera mounts','pcs'],['UPS','pcs'],['Site monitoring mini PC','pcs']];
export const stockUnit=u=>({metres:'m',pieces:'pcs',sets:'sets',rolls:'roll',boxes:'box'})[u]||u;
export const materialKey=(name,unit)=>String(name||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()+'|'+stockUnit(unit);
export const REVIEW_DAYS=30;
export function reviewDate(at){return at?new Date(Date.parse(at)+REVIEW_DAYS*86400000).toISOString():null;}
export function reviewDue(at,now){return !at||Date.parse(reviewDate(at))<=now;}
