export function health(site, now=Date.now()) {
  if (site.status !== 'active') return {key:'paused',label:site.status==='closed'?'Closed':'Paused',reason:'Monitoring is not active'};
  if ((site.incidents||[]).some(i=>i.state!=='fixed')) return {key:'attention',label:'Needs attention',reason:(site.incidents||[]).filter(i=>i.state!=='fixed').length+' active fault(s)'};
  if (!(site.feeds||[]).includes('box')) return {key:'unknown',label:'Email only',reason:'Cannot detect a full site outage'};
  const age=now-Date.parse(site.boxLastSeenAt);
  if (!Number.isFinite(age)||age< -60000) return {key:'unknown',label:'Not reporting',reason:'No valid report from this site'};
  if (age>=900000) return {key:'attention',label:'Site silent',reason:'No report for at least 15 minutes'};
  if (age>=180000) return {key:'unknown',label:'Report late',reason:'Waiting for a fresh site report'};
  if (!(site.devices||[]).length) return {key:'unknown',label:'No devices',reason:'Device setup needs checking'};
  if (site.devices.some(d=>d.kind!=='box'&&d.state==='down')) return {key:'attention',label:'Device down',reason:'Check the affected device'};
  if (!site.devices.some(d=>d.kind!=='box')||site.devices.some(d=>d.kind!=='box'&&d.state!=='ok')) return {key:'unknown',label:'Needs checking',reason:'Some devices have unknown health'};
  return {key:'healthy',label:'Reporting',reason:'All registered devices reachable'};
}
export function deviceHealth(site,device,now=Date.now()) {const age=now-Date.parse(site.boxLastSeenAt);return site.status!=='active'||!(site.feeds||[]).includes('box')||!Number.isFinite(age)||age>=180000||age< -60000?'unknown':device.kind==='box'||device.state==='ok'?'healthy':device.state==='down'?'attention':'unknown'}
export function ageText(value,now=Date.now()){const ms=now-Date.parse(value);if(!Number.isFinite(ms)||ms< -60000)return 'No valid report';const m=Math.max(0,Math.floor(ms/60000));return m<1?'Just now':m<60?m+' min ago':m<1440?Math.floor(m/60)+' hr ago':Math.floor(m/1440)+' days ago'}
export const faultName=kind=>({camera_offline:'Camera offline',recorder_offline:'Recorder offline',site_silent:'Site stopped reporting',disk_full:'Disk full',disk_error:'Disk error',ip_conflict:'Network address conflict'}[kind]||'Needs checking');
export function demoData(now=Date.now()){const ago=m=>new Date(now-m*60000).toISOString();const site=(id,name,area,minutes,count,issues=[],feeds=['box'])=>({id,code:'DEMO-'+id,name,area,status:'active',boxLastSeenAt:minutes===null?null:ago(minutes),feeds,jobRef:id==='014'?'Order 014':'Sample site',carePlan:true,devices:Array.from({length:count},(_,i)=>({id:id+'-c'+i,kind:'camera',label:'Camera '+(i+1),channel:i+1,state:i===2&&issues.length?'down':'ok',since:ago(40)})).concat([{id:id+'-nvr',kind:'recorder',label:'Recorder',state:'ok',since:ago(60)}]),incidents:issues.map((kind,i)=>({id:id+'-fault'+i,siteId:id,kind,state:'open',source:'box',openedAt:ago(23),notifiedAt:null}))});return {sites:[site('014','Brian’s building','Pilot · illustrative status',0.5,8,['camera_offline']),site('002','Sample pharmacy','Demo · Kampala',1,4),site('003','Sample shops','Demo · Wakiso',32,6,['site_silent']),site('004','Sample apartments','Demo · Kampala',null,6,[],['email'])],unknown:[]};}
