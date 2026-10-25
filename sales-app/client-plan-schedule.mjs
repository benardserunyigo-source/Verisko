const fail=(message,status=400)=>Object.assign(Error(message),{status});
export function planSchedule(offer,start){
 if(Number(String(start).slice(0,4))<2000||Number(String(start).slice(0,4))>2100||!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!Number.isFinite(Date.parse(start+'T12:00:00Z'))||new Date(start+'T12:00:00Z').toISOString().slice(0,10)!==start)throw fail('Choose a valid payment start date.',400);
 const [y,m,d]=start.split('-').map(Number),rows=[{label:offer.months?(offer.owns?'Deposit':'Setup fee'):'Full payment',due:start,amount:offer.upfront}];
 for(let n=1;n<=offer.months;n++){const month=new Date(Date.UTC(y,m-1+n,1,12)),last=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();month.setUTCDate(Math.min(d,last));rows.push({label:'Month '+n,due:month.toISOString().slice(0,10),amount:offer.monthly});}
 return rows;
}
