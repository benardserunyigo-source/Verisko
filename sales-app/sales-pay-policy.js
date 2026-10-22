/* Current earnings policy. Historic commission rules remain in commission.js. */
(function(root){
 'use strict';
 var POLICY=Object.freeze({id:'sales-monday-2026-10-19',effectiveFrom:'2026-10-19',perVisit:15000,perDeposit:100000,weeklyBonus:50000,minVisits:3});
 var DAY=86400000,EAT=10800000;
 function period(now,shift){var date=new Date(new Date(now===undefined?Date.now():now).getTime()+EAT),dow=(date.getUTCDay()+6)%7,start=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()-dow+(shift||0)*7)-EAT;return {start:new Date(start),end:new Date(start+7*DAY),payday:new Date(start+7*DAY)};}
 function active(now){return new Date(now===undefined?Date.now():now)>=new Date(POLICY.effectiveFrom+'T00:00:00+03:00');}
 function calculate(data,week,email){
  var C=root.VeriskoCommission,from=new Date(POLICY.effectiveFrom+'T00:00:00+03:00');
  if(week.start<from)throw new Error('Use the earlier pay rules for work before '+POLICY.effectiveFrom+'.');
  var out=C.earnings4(data.prospects||[],data.appointments||[],data.jobs||[],data.transactions||[],week,{email:email,users:data.users||[],perVisit:POLICY.perVisit,perDeposit:POLICY.perDeposit});
  // A completed visit counts once per customer. Bookings and qualifications do not count.
  var roster=(data.users||[]).filter(u=>u.role==='sales'&&u.email&&(!email||u.email.toLowerCase()===email.toLowerCase()));
  for(var u of roster)if(!out.reps.some(r=>r.email===u.email.toLowerCase()))out.reps.push({email:u.email.toLowerCase(),name:u.name,visits:[],deposits:[],qualified:[],pendingQual:0,bookings:0,visitAmount:0,depositAmount:0,total:0});
  out.reps=out.reps.map(r=>{var bonus=r.visits.length>=POLICY.minVisits?POLICY.weeklyBonus:0;return {...r,bonusAmount:bonus,visitsNeeded:Math.max(0,POLICY.minVisits-r.visits.length),total:r.visitAmount+r.depositAmount+bonus};}).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
  out.total=out.reps.reduce((n,r)=>n+r.total,0);out.policy=POLICY;return out;
 }
 root.VeriskoSalesPay={POLICY:POLICY,period:period,active:active,calculate:calculate};
})(typeof window==='object'?window:globalThis);
