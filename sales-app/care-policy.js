// Approved package inclusions. No new charge or additional cost allowance.
(function(root){
  'use strict';
  var VERSION='2026-10-18-care24';
  var summary='12 months of callbacks and camera-status monitoring through an on-site mini PC, plus a 2-year replacement warranty for faulty cameras and installed cables.';
  var terms=[
    'Included care: 12 months of callbacks and system-health monitoring from installation, using an on-site mini PC. This is included in the package price.',
    'Monitoring checks camera and system availability so Verisko can identify outages and arrange follow-up. Monitoring does not give Verisko access to view, record or store your camera footage. Outage visibility depends on connectivity and reporting.',
    'Warranty: for 2 years from installation, Verisko replaces faulty cameras and faulty installed cables. This covers faults only; accidental damage and power-surge damage are excluded.'
  ];
  function addMonths(iso,n){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return '';
    var d=new Date(iso+'T12:00:00Z');if(isNaN(d)||d.toISOString().slice(0,10)!==iso)return '';
    var day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);
    var last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
    d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);
  }
  function schedule(job){
    if(job.servicePolicyVersion!==VERSION)return null;
    var start=job.serviceStartDate || '';
    return {version:VERSION,start:start,callbackEnd:addMonths(start,12),monitoringEnd:addMonths(start,12),warrantyEnd:addMonths(start,24),
      monitoringStatus:handoverErrors(job).length===0 ? 'Test recorded' : 'Activation test pending'};
  }
  function handoverErrors(job){
    if(job.servicePolicyVersion!==VERSION)return [];
    var errors=[];
    if(!job.serviceStartDate || !addMonths(job.serviceStartDate,12))errors.push('Record the actual installation / care start date.');
    if(!String(job.monitoringMiniPcRef||'').trim())errors.push('Record the on-site mini PC reference.');
    if(job.monitoringCommissioned!==true || !String(job.monitoringTestEvidence||'').trim())errors.push('Record the offline-alert test and confirm health-only monitoring before handover.');
    return errors;
  }
  root.VeriskoCare={VERSION:VERSION,summary:summary,terms:terms,callbacksMonths:12,monitoringMonths:12,warrantyMonths:24,scope:'Faults only',schedule:schedule,handoverErrors:handoverErrors,addMonths:addMonths};
})(typeof window!=='undefined'?window:globalThis);
