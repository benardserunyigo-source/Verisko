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
  // Read-only attribution. A client-only receipt belongs to a job only when
  // the complete saved job list has exactly one job for that client.
  function receiptsForJob(job,transactions,jobs,aliases){
    var ids=new Set([job.id].concat(aliases||[]).filter(Boolean));
    var peers=(jobs||[]).filter(function(j){return job.prospectId && j.prospectId===job.prospectId;});
    var sole=peers.length===1 && peers[0].id===job.id;
    var unique=new Map();
    (transactions||[]).forEach(function(t){unique.set(t.id || t, t);});
    var receipts=[],unassignedClientMoney=0;
    unique.forEach(function(t){
      if(t.direction!=='in' || !(Number(t.amount)>0))return;
      if(t.installId && ids.has(t.installId))receipts.push(t);
      else if(!t.installId && job.prospectId && t.prospectId===job.prospectId){
        if(sole)receipts.push(t);
        else if(t.status==='approved')unassignedClientMoney+=Number(t.amount);
      }
    });
    return {receipts:receipts,unassignedClientMoney:unassignedClientMoney};
  }
  function review(job,transactions,today,jobs){
    var attribution=receiptsForJob(job,transactions,jobs);
    var paid=attribution.receipts.filter(function(t){return t.status==='approved';}).reduce(function(s,t){return s+Number(t.amount);},0);
    var remaining=paid,overdue=0;
    var rows=(job.paymentSchedule||[]).map(function(r){var applied=Math.min(remaining,r.amount);remaining-=applied;var balance=r.amount-applied;
      var due=r.completion ? ['Installed','Handed over'].includes(job.stage) : r.due<today;
      if(due)overdue+=balance;return Object.assign({},r,{paid:applied,balance:balance,overdue:due&&balance>0});});
    var total=Number(job.quotedTotal || (job.quoteSnapshot||{}).cash || job.finalPrice)||0;
    return {paid:paid,outstanding:Math.max(0,total-paid),overdue:overdue,rows:rows,unassignedClientMoney:attribution.unassignedClientMoney};
  }
  root.VeriskoJobFinance={schedule:schedule,receiptsForJob:receiptsForJob,review:review,addDays:addDays};
})(typeof window!=='undefined'?window:globalThis);
