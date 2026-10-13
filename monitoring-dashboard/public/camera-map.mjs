import {deviceHealth,faultName} from './model.mjs';

export function cameraGroups(devices,checks=[]){
 const groups=new Map();
 for(const device of devices.filter(d=>d.kind==='camera')){
  const matches=checks.filter(c=>c.kind===device.kind&&c.label?.toLowerCase()===device.label?.toLowerCase());
  const area=device.area||(matches.length===1?matches[0].area:null)||'Area not set';
  if(!groups.has(area))groups.set(area,[]);
  groups.get(area).push(device);
 }
 return [...groups].map(([area,cameras])=>({area,cameras}));
}
export function cameraIncidents(device,incidents){return incidents.filter(i=>i.deviceId===device.id)}
const labels={healthy:'Reachable',attention:'Failed check',unknown:'Unknown remotely'};
export function mountCameraMap({site,devices,incidents,workflow,esc:E,stamp,host}){
 const panel=document.createElement('section');panel.className='camera-map';
 const groups=cameraGroups(devices,workflow.profile?.checks),count=groups.reduce((n,g)=>n+g.cameras.length,0);
 panel.innerHTML='<div class="map-heading"><div><p class="eyebrow">CAMERA STATUS</p><h3>At '+E(site.name)+'</h3></div><span>'+count+' cameras</span></div><p class="map-hint">Tap a camera to check it.</p>'+groups.map(g=>'<div class="floor-row"><strong>'+E(g.area)+'</strong><div class="floor-cameras">'+g.cameras.map(c=>{const state=deviceHealth(site,c);return '<button class="camera-pin '+state+'" data-camera="'+E(c.id)+'" aria-label="'+E(c.label)+': '+labels[state]+'" aria-pressed="false"><span class="camera-mark"></span><small>'+E(c.channel??c.label)+'</small></button>'}).join('')+'</div><span class="floor-count">'+g.cameras.length+' camera'+(g.cameras.length===1?'':'s')+'</span></div>').join('')+(count?'':'<p>No cameras registered yet.</p>')+'<div class="map-legend">'+Object.entries(labels).map(([state,label])=>'<span class="'+state+'"><i class="camera-mark"></i>'+label+'</span>').join('')+'</div><p class="map-hint">Last report: '+E(stamp(site.boxLastSeenAt))+'<br>A connection check does not confirm recording.</p><div class="camera-selection" aria-live="polite"></div>';
 const selection=panel.querySelector('.camera-selection');
 function select(id){
  const camera=devices.find(c=>c.id===id);if(!camera)return;
  const state=deviceHealth(site,camera),faults=cameraIncidents(camera,incidents);
  panel.querySelectorAll('[data-camera]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.camera===id)));
  selection.innerHTML='<div class="selected-heading"><b>'+E(camera.label)+'</b><span>'+labels[state]+'</span></div>'+faults.map(i=>{const r=workflow.repairs.find(r=>r.incident_id===i.id),complete=r?.status==='completed';return '<div class="camera-repair"><p>'+E(faultName(i.kind))+'</p><ol class="repair-steps"><li class="done">Fault found</li><li class="'+(r?'done':'')+'">Visit planned</li><li class="'+(complete?'done':'')+'">Repair checked</li></ol><p>'+(complete?'Repair checked and closed.':r?'Visit: '+E(stamp(r.starts_at))+' – '+E(stamp(r.ends_at))+'<br>'+E(r.technician):i.state==='fixed'?'Fault closed.':'No repair visit planned yet.')+'</p><div class="camera-actions">'+(i.state!=='fixed'?'<button data-schedule="'+E(i.id)+'" '+(workflow.error?'disabled':'')+'>'+(r?'Change visit':'Plan repair')+'</button>':'')+(!complete&&(i.state!=='fixed'||r?.status==='scheduled')?'<button data-fix="'+E(i.id)+'">Verify repair</button>':'')+'</div></div>'}).join('')+(faults.length?'':'<p>'+(state==='attention'?'Check failed. No camera-linked fault has been recorded yet.':state==='unknown'?'Waiting for a fresh report. Check site faults below.':'No recorded fault for this camera.')+'</p>');
 }
 panel.addEventListener('click',e=>{const b=e.target.closest('[data-camera]');if(b)select(b.dataset.camera)});
 host.prepend(panel);
 const first=devices.find(c=>c.kind==='camera'&&deviceHealth(site,c)==='attention')||devices.find(c=>c.kind==='camera');if(first)select(first.id);
 const timer=setInterval(()=>{
  if(!panel.isConnected){clearInterval(timer);return}
  const active=panel.querySelector('[aria-pressed="true"]')?.dataset.camera;
  panel.querySelectorAll('[data-camera]').forEach(button=>{const camera=devices.find(c=>c.id===button.dataset.camera),state=deviceHealth(site,camera);button.className='camera-pin '+state;button.setAttribute('aria-label',camera.label+': '+labels[state])});
  if(active)select(active);
 },30000);
}
