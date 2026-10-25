import {draftPaymentOptions} from './draft-payment-options.mjs';
export function salesDraftOffer(plan,cameras=4){
 const defaults=draftPaymentOptions('operations',{cameras}),rows=defaults.map(p=>p.id===plan?.id?plan:p),valid=draftPaymentOptions('operations',{cameras,options:rows});
 const p=valid.find(p=>p.id===plan?.id);if(!p)return null;
 return Object.fromEntries(['id','title','upfront','monthly','months','owns','total'].map(k=>[k,p[k]]));
}
export function salesOfferText(p){
 const money=n=>'UGX '+n.toLocaleString('en-UG');
 return !p.months?'Pay in full: '+money(p.total)+'. You own the system.':p.owns?'Deposit '+money(p.upfront)+', then '+money(p.monthly)+' each month for '+p.months+' months. You own it after the last payment.':'Setup fee '+money(p.upfront)+', then '+money(p.monthly)+' each month. Verisko owns the system. First 12 months: '+money(p.total)+'. Rent keeps going.';
}
