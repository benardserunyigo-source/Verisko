const fail=(message,status=400)=>Object.assign(Error(message),{status});
export function standardPlanOffer(plan){
 const id=plan?.plan||plan?.id,rows=plan?.rows,total=Number(plan?.total);
 if(!['installments','cash'].includes(id)||!Array.isArray(rows)||rows.length!==(id==='installments'?3:2)||rows.some(r=>!Number.isSafeInteger(r.amount)||r.amount<=0)||rows.reduce((n,r)=>n+r.amount,0)!==total)throw fail('The saved payment amounts need review.');
 return {id,title:plan.title,owns:true,months:id==='installments'?2:0,upfront:rows[0].amount,monthly:0,total,standardRows:rows.map((r,i)=>({label:r.label,amount:r.amount,days:id==='installments'?i*30:i===0?0:null}))};
}
export function planSchedule(offer,start,completionDate){
 if(Number(String(start).slice(0,4))<2000||Number(String(start).slice(0,4))>2100||!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!Number.isFinite(Date.parse(start+'T12:00:00Z'))||new Date(start+'T12:00:00Z').toISOString().slice(0,10)!==start)throw fail('Choose a valid payment start date.',400);
 if(offer.standardRows){
  return offer.standardRows.map(r=>{let due;if(r.days===null){if(!completionDate||completionDate<start)throw fail('Choose a completion payment date on or after the first payment date.');planSchedule({months:0,upfront:1},completionDate);due=completionDate;}else{const day=new Date(start+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+r.days);due=day.toISOString().slice(0,10);}return {label:r.label,due,amount:r.amount};});
 }
 const [y,m,d]=start.split('-').map(Number),rows=[{label:offer.months?(offer.owns?'Deposit':'Setup fee'):'Full payment',due:start,amount:offer.upfront}];
 for(let n=1;n<=offer.months;n++){const month=new Date(Date.UTC(y,m-1+n,1,12)),last=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();month.setUTCDate(Math.min(d,last));rows.push({label:'Month '+n,due:month.toISOString().slice(0,10),amount:offer.monthly});}
 return rows;
}
