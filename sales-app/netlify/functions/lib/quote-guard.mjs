// Authoritative new-quote validation. Never trust a browser's quote snapshot.
import { pricing, VERSION } from './pricing-policy.mjs';
import '../../../offer-catalogue.js';
import '../../../job-finance.js';
import '../../../care-policy.js';
const offer = globalThis.VeriskoOffer;
const finance = globalThis.VeriskoJobFinance;
const care = globalThis.VeriskoCare;
export const COMMERCIAL = ['pricingVersion','cameraCount','installationType','rubric','addons','zone','discountPct','priceOverride','finalPrice','directCost','extraCost','extraMaterialsCost','extraCrewCost','extraAccessTravelCost','addonCosts','costConfirmed','costEvidence','paymentPlan','servicePolicyVersion'];
const signature = j => JSON.stringify(COMMERCIAL.map(k => j[k] ?? null));
const won = stage => ['Accepted','Scheduled','In progress','Installed','Handed over'].includes(stage);
export function contextFor(q) {
  const lines = offer.addons.flatMap(a => {
    const qty = a.qty ? Math.max(0,Math.floor(Number(q.addons?.[a.key])||0)) : q.addons?.[a.key] ? 1 : 0;
    return qty ? [{...a,qty,total:a.price*qty}] : [];
  });
  if(q.addons?.tv32 || q.addons?.tv43) lines.push({key:'hdmi',label:'HDMI 5m cable',qty:1,price:40000,total:40000});
  return {lines,zone:offer.zones.find(z => z.key === q.zone) || offer.zones[0]};
}
export function validateQuotes(stored, incoming, isAdmin, email, now = new Date().toISOString()) {
  const previous = new Map((stored || []).map(j => [j.id,j]));
  const records = [...(incoming || [])];
  const ids = new Set(records.map(j=>j.id));
  for(const j of stored || []) if(won(j.stage) && !ids.has(j.id)) records.push(j);
  return records.map(job => {
    const prev = previous.get(job.id);
    if(job.servicePolicyVersion===care.VERSION && job.stage==='Handed over') {
      if(care.handoverErrors(job).length) throw new Error(care.handoverErrors(job).join(' '));
      if(job.serviceStartDate>now.slice(0,10)) throw new Error('The actual installation date cannot be in the future at handover.');
      if(prev?.stage==='Handed over' && prev.serviceStartDate!==job.serviceStartDate && !isAdmin) throw new Error('The Owner must correct an already handed-over care start date.');
    }
    // Old agreed records are immutable commercially; lifecycle updates continue.
    if(prev && won(prev.stage)) {
      if(signature(prev) !== signature(job)) throw new Error('Accepted pricing is locked. Create a separate revised quote for scope changes.');
      return {...job,quoteSnapshot:prev.quoteSnapshot,quotedAt:prev.quotedAt,validUntil:prev.validUntil,
        quotedTotal:prev.quotedTotal,paymentSchedule:prev.paymentSchedule,pricingVerifiedAt:prev.pricingVerifiedAt,
        costApprovalKey:prev.costApprovalKey,costApprovedBy:prev.costApprovedBy,costApprovedAt:prev.costApprovedAt,
        fundingApprovedKey:prev.fundingApprovedKey,fundingApprovedBy:prev.fundingApprovedBy,careSchedule:care.schedule(job)};
    }
    if(job.pricingVersion !== VERSION) {
      if(prev && signature(prev) === signature(job) && job.stage === prev.stage) return {...job,quoteSnapshot:prev.quoteSnapshot};
      throw new Error('Refresh this unaccepted quotation with current pricing before changing or sending it.');
    }
    if(!prev && job.servicePolicyVersion!==care.VERSION) throw new Error('Refresh the app to include the approved callback, monitoring and warranty coverage.');
    const same=prev && signature(prev) === signature(job);
    if(same && !job.renewQuote && prev.pricingVerifiedAt && prev.stage === job.stage && prev.scheduledDate === job.scheduledDate && prev.costApprovalKey === job.costApprovalKey && prev.fundingConfirmed === job.fundingConfirmed) {
      return {...job,quoteSnapshot:prev.quoteSnapshot,quotedTotal:prev.quotedTotal,quotedAt:prev.quotedAt,
        validUntil:prev.validUntil,pricingVerifiedAt:prev.pricingVerifiedAt,paymentSchedule:prev.paymentSchedule,
        costApprovalKey:prev.costApprovalKey,costApprovedBy:prev.costApprovedBy,costApprovedAt:prev.costApprovedAt,
        fundingApprovedKey:prev.fundingApprovedKey,fundingApprovedBy:prev.fundingApprovedBy,careSchedule:care.schedule(job)};
    }
    if(Object.entries(job.addons || {}).some(([k,v]) => v && (!offer.addons.some(a=>a.key===k) || ['camFixed','camWide'].includes(k)))) throw new Error('Choose a supported package or approved add-on.');
    if(!pricing.policy.fx) throw new Error('Approved pricing is unavailable. Contact the Owner before issuing a quote.');
    let q={...job,costApprovalKey:'',crewApprovalKey:''};
    let result=pricing.compute(q,contextFor(q));
    if(result.errors.length) throw new Error(result.errors.join(' '));
    const key=result.approvalKeyRequired;
    const prior=key && prev?.costApprovalKey === key && !!prev.costApprovedBy;
    const approved=!!key && (prior || (isAdmin && job.costApprovalKey === key));
    if(approved) q.costApprovalKey=key;
    result=pricing.compute(q,contextFor(q));
    const unchanged=prev && signature(prev) === signature(job);
    const quotedAt=unchanged && !job.renewQuote && prev.quotedAt ? prev.quotedAt : now.slice(0,10);
    const validUntil=finance.addDays(quotedAt,7);
    if(job.stage !== 'Draft' && job.stage !== 'Cancelled' && job.stage !== 'Rejected') {
      if(job.servicePolicyVersion!==care.VERSION) throw new Error('Refresh this unaccepted quote to include the current care and warranty terms.');
      if(result.releaseErrors.length) throw new Error(result.releaseErrors.join(' '));
      if(result.needsApproval) throw new Error('Owner approval required: '+result.approvalReasons.join(', ')+'. Save as Draft.');
      if(now.slice(0,10)>validUntil) throw new Error('This quote has expired. Refresh pricing and confirm costs before reissuing.');
    }
    const fundingKey=JSON.stringify([VERSION,result.cash,result.direct,job.paymentPlan,job.scheduledDate||'']);
    const fundedBefore=prev?.fundingApprovedKey === fundingKey && !!prev.fundingApprovedBy;
    const funded=fundedBefore || (isAdmin && job.fundingConfirmed === true);
    if(won(job.stage) && job.paymentPlan === 'installments' && (!job.scheduledDate || !funded)) {
      throw new Error('The Owner must confirm funding and the installation date before accepting a financed job.');
    }
    if(won(job.stage) && !job.scheduledDate) throw new Error('Set the installation date before accepting this job.');
    const out={...job,renewQuote:false,quoteSnapshot:result,quotedTotal:result.cash,quotedAt,validUntil,
      pricingVerifiedAt:now,costApprovalKey:approved?key:'',costApprovedBy:approved?(prior?prev.costApprovedBy:email):'',
      costApprovedAt:approved?(prior?prev.costApprovedAt:now):'',fundingConfirmed:!!funded,
      fundingApprovedKey:funded?fundingKey:'',fundingApprovedBy:funded?(fundedBefore?prev.fundingApprovedBy:email):''};
    out.paymentSchedule=finance.schedule(out,result.cash);
    out.careSchedule=care.schedule(out);
    return out;
  });
}
