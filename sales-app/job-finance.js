// Public, pure schedule and receipt reconciliation. No private cost inputs.
(function(root){
  'use strict';
  function addDays(iso,n){var d=new Date(String(iso)+'T12:00:00Z');if(isNaN(d))return '';d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
  function schedule(job,total){
    if(!job.scheduledDate || !total || !['cash','installments'].includes(job.paymentPlan))return [];
    var round=function(n){return Math.round(n/10000)*10000;};
    var a=round(total*(job.paymentPlan==='cash'?.6:.4)),b=round(total*.3);
    return job.paymentPlan==='cash' ? [{label:'Before installation',due:job.scheduledDate,amount:a},{label:'On completion',due:job.scheduledDate,amount:total-a,completion:true}] :
      [{label:'Installation',due:job.scheduledDate,amount:a},{label:'After 30 days',due:addDays(job.scheduledDate,30),amount:b},{label:'After 60 days',due:addDays(job.scheduledDate,60),amount:total-a-b}];
  }
  function review(job,transactions,today){
    var paid=(transactions||[]).filter(function(t){return t.installId===job.id && t.direction==='in' && t.status==='approved';}).reduce(function(s,t){return s+(Number(t.amount)||0);},0);
    var remaining=paid,overdue=0;
    var rows=(job.paymentSchedule||[]).map(function(r){var applied=Math.min(remaining,r.amount);remaining-=applied;var balance=r.amount-applied;
      var due=r.completion ? ['Installed','Handed over'].includes(job.stage) : r.due<today;
      if(due)overdue+=balance;return Object.assign({},r,{paid:applied,balance:balance,overdue:due&&balance>0});});
    var total=Number(job.quotedTotal || (job.quoteSnapshot||{}).cash || job.finalPrice)||0;
    return {paid:paid,outstanding:Math.max(0,total-paid),overdue:overdue,rows:rows};
  }
  root.VeriskoJobFinance={schedule:schedule,review:review,addDays:addDays};
})(typeof window!=='undefined'?window:globalThis);
