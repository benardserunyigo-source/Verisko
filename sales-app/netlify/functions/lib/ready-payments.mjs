const stamp=t=>String(t.approvedAt||t.reviewedAt||t.recordedAt||t.createdAt||t.date||'');
export function firstClientPayment(contactId,transactions=[],jobs=[]){
 const ids=new Set(jobs.filter(j=>j.prospectId===contactId).map(j=>j.id));
 const payments=transactions.filter(t=>t.direction==='in'&&Number(t.amount)>0&&(t.prospectId===contactId||ids.has(t.installId)));
 return payments.filter(t=>t.status==='approved').sort((a,b)=>stamp(a).localeCompare(stamp(b)))[0]||payments.filter(t=>t.status!=='query').sort((a,b)=>stamp(a).localeCompare(stamp(b)))[0]||payments[0]||null;
}
export function paymentView(c,p,me,transactions=[],jobs=[]){
 const tx=c.firstPayment||firstClientPayment(p.id,transactions,jobs);if(!tx)return null;
 const common={id:tx.id,status:tx.status||'pending',date:tx.date,approvedAt:tx.approvedAt||'',commissionEligible:!p.imported&&(c.firstPayment?.commissionEligible??!!p.createdByEmail),legacy:!c.firstPayment};
 return ['admin','operations','teamlead'].includes(me?.role)?{...common,amount:tx.amount,method:tx.method,reference:tx.reference||'',reviewNote:tx.reviewNote||''}:common;
}
export function validPaymentDay(day,at){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day&&day<=new Date(Date.parse(at)+3*3600000).toISOString().slice(0,10);}
