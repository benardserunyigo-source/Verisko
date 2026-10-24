// Shared browser/server rules for recorded client acceptance, separate from crew approval.
(function(root){
  'use strict';
  var CHECKS=['cameras','tested','remote','trained','credentials'];
  var METHODS=['Signed form','Client message','In person'];
  function errors(job,today){
    var h=job.clientHandover||{},out=[];
    if(CHECKS.some(function(k){return job.checklist?.[k]!==true;}))out.push('Finish all five client handover checks.');
    if(!String(h.name||'').trim()||!String(h.role||'').trim())out.push('Record the client or their representative and their role.');
    var date=String(h.date||''),d=new Date(date+'T12:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(d)||d.toISOString().slice(0,10)!==date||today&&date>today)out.push('Choose the actual client sign-off date, not a future date.');
    if(METHODS.indexOf(h.method)<0||!String(h.reference||'').trim())out.push('Record how the client agreed and the form, message or meeting reference.');
    if(h.confirmed!==true)out.push('Confirm that the client agreed the work is complete.');
    return out;
  }
  root.VeriskoHandover={CHECKS:CHECKS,METHODS:METHODS,errors:errors};
})(typeof window!=='undefined'?window:globalThis);
