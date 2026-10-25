import {shiftPrompt,checkoutMessage} from './field-shift-prompts.mjs?v=145';
export const isFieldManager=u=>['admin','operations'].includes(u?.role);
const time=iso=>iso?new Date(iso).toLocaleTimeString('en-GB',{timeZone:'Africa/Kampala',hour:'2-digit',minute:'2-digit'}):'—';
const date=iso=>iso?new Date(iso).toLocaleDateString('en-GB',{timeZone:'Africa/Kampala',day:'numeric',month:'short'}):'—';
const duration=ms=>Math.floor(Math.max(0,ms)/3600000)+'h '+Math.floor(Math.max(0,ms)/60000)%60+'m';
const age=at=>{const m=Math.max(0,Math.floor((Date.now()-Date.parse(at))/60000));return m<1?'just now':m+' min ago';};
const status=s=>!s?'Not checked in':s.status==='ended'?'Checked out':s.status==='paused'?'Paused':Date.now()-Date.parse(s.lastPosition?.at||s.points?.at(-1)?.at)>300000?'Update missing':s.issue?'Sharing interrupted':'Location updated';
const link=p=>p?'<a href="https://www.google.com/maps?q='+p.lat+','+p.lng+'" target="_blank" rel="noopener noreferrer">Open location in Maps ↗</a>':'';
const safePoints=s=>(s.points||[]).filter(p=>p.accuracy<=150);
function metres(a,b){const rad=n=>n*Math.PI/180,x=rad(b.lat-a.lat),y=rad(b.lng-a.lng);return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(x/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(y/2)**2)));}
export function movement(s){
 const p=safePoints(s);if(p.length<2)return 'Not enough accurate locations to assess movement.';
 let lastMove=p[0],longest=0;
 for(let i=1;i<p.length;i++){
  if(p[i].segmentId!==p[i-1].segmentId||Date.parse(p[i].at)-Date.parse(p[i-1].at)>300000){lastMove=p[i];continue;}
  if(metres(lastMove,p[i])>Math.max(100,lastMove.accuracy+p[i].accuracy))lastMove=p[i];
  longest=Math.max(longest,Date.parse(p[i].at)-Date.parse(lastMove.at));
 }
 return longest>=1200000?'No clear movement observed for a period of '+duration(longest)+'. Confirm the context with the rep.':'Reported locations available. Location alone does not confirm work or a client visit.';
}
export function routeSvg(s){
 const points=(s.points||[]).map((p,index)=>({...p,sourceIndex:index})).filter(p=>p.accuracy<=150);if(!points.length)return '<p class="helper">No accurate locations to draw yet.</p>';
 const lat=points.reduce((n,p)=>n+p.lat,0)/points.length,cos=Math.cos(lat*Math.PI/180);
 const xs=points.map(p=>p.lng*cos),ys=points.map(p=>-p.lat),minX=Math.min(...xs),minY=Math.min(...ys),range=Math.max(Math.max(...xs)-minX,Math.max(...ys)-minY,.0005);
 const coords=points.map((p,i)=>({x:24+(xs[i]-minX)/range*550,y:24+(ys[i]-minY)/range*230,p}));
 let paths='',dots='';
 coords.forEach((c,i)=>{const prev=coords[i-1],gap=prev?Date.parse(c.p.at)-Date.parse(prev.p.at):0;
  if(prev&&prev.p.sourceIndex+1===c.p.sourceIndex&&prev.p.segmentId===c.p.segmentId&&gap>0&&gap<=300000&&metres(prev.p,c.p)/ (gap/1000)<55)paths+='<path d="M'+prev.x.toFixed(1)+' '+prev.y.toFixed(1)+'L'+c.x.toFixed(1)+' '+c.y.toFixed(1)+'"/>';
  dots+='<circle cx="'+c.x.toFixed(1)+'" cy="'+c.y.toFixed(1)+'" r="'+(i===coords.length-1?6:3)+'"><title>'+time(c.p.at)+' · ±'+c.p.accuracy+'m</title></circle>';
 });
 return '<svg class="shift-route" viewBox="0 0 600 280" role="img" aria-label="Reported location trail. Lines break during pauses or gaps over five minutes."><g fill="none" stroke="#169bd7" stroke-width="3">'+paths+'</g><g fill="#012169">'+dots+'</g><text x="566" y="25" fill="#68778b" font-size="14">N ↑</text></svg><p class="helper">Location trail, not a street map. Pauses, low-accuracy points and reporting gaps are not joined. All times are Uganda time.</p>';
}
function details(s,esc){
 if(!s)return '';
 if(s.offlineSummary)return '<p class="helper">Android has saved your shift on this phone. The location trail and timeline will load when you reconnect.</p>';
 const last=s.points?.at(-1),active=(s.segments||[]).reduce((n,x)=>n+Math.max(0,Date.parse(x.endedAt||new Date().toISOString())-Date.parse(x.startedAt)),0);
 return '<div class="shift-facts"><span><strong>Checked in</strong>'+date(s.startedAt)+' · '+time(s.startedAt)+'</span>'+(s.endedAt?'<span><strong>Checked out</strong>'+date(s.endedAt)+' · '+time(s.endedAt)+'</span>':'')+'<span><strong>Shift time, excluding pauses</strong>'+duration(active)+'</span><span><strong>Location updates</strong>'+(s.points||[]).length+'</span></div>'+
  (s.area?'<p><strong>Planned area:</strong> '+esc(s.area)+'</p>':'')+
  '<p class="helper">Shift time is elapsed time, not verified working hours.</p>'+routeSvg(s)+'<p>'+esc(movement(s))+'</p>'+
  '<div class="shift-facts"><span><strong>Check-in location</strong>'+link(s.events.find(e=>e.type==='check-in')?.position||s.points?.[0])+'</span><span><strong>Check-out location</strong>'+(s.status==='ended'?(s.events.find(e=>e.type==='check-out')?.position?link(s.events.find(e=>e.type==='check-out').position):esc(s.events.find(e=>e.type==='check-out')?.locationUnavailable||'Not recorded for this shift.')):'Saved when you check out.')+'</span></div>'+
  (last?'<p class="helper">Last shared '+date(last.at)+' at '+time(last.at)+' · GPS accuracy ±'+last.accuracy+'m. '+link(last)+'</p>':'')+
  '<details><summary>Check-in, pause and check-out timeline</summary><ul class="shift-timeline">'+s.events.map(e=>'<li><strong>'+esc(({ 'check-in':'Check-in',pause:'Paused',resume:'Resumed',reconnect:'Sharing continued','check-out':'Check-out','auto-end':'Automatically checked out' })[e.type]||e.type)+'</strong> '+date(e.at)+' · '+time(e.at)+(e.receivedAt&&e.receivedAt!==e.at?' · synced '+time(e.receivedAt):'')+'</li>').join('')+'</ul></details>';
}
export function renderShiftBanner(host,tracker,onOpen,options={}){
 const x=tracker.snapshot(),s=x.shift;
 if(options.today&&(isFieldManager(options.person)||((!s||s.status==='ended')&&!x.pending))){
  host.hidden=false;host.innerHTML='<span>'+(isFieldManager(options.person)?'See who is checked in and where updates were last reported.':'Starting field work? Check in before you begin.')+'</span><button type="button" class="btn btn-ghost btn-sm">'+(isFieldManager(options.person)?'View field team':'Check in')+'</button>';host.querySelector('button').onclick=onOpen;return;
 }
 host.hidden=(!s||s.status==='ended')&&!x.pending;if(host.hidden)return;
 const label=x.pending?'Sharing stopped · waiting to sync':s.status==='paused'?'Shift paused · location sharing off':x.error?'Shift open · location sharing needs attention':x.sharing&&!x.hidden?'Shift open · location sharing on':'Shift open · location sharing interrupted';
 host.innerHTML='<span>'+label+'</span><button type="button" class="btn btn-ghost btn-sm">Open shift</button>';
 host.querySelector('button').onclick=onOpen;
}
export function renderShiftPage(host,{tracker,api,person,esc,onSupport=()=>{}}){
 const previousDetail=host.querySelector('#shiftDetail'),previousHistory=host.querySelector('#shiftHistory');
 const previousArea=host.querySelector('#shiftArea')?.value||'',previousConsent=host.querySelector('#shiftConsent')?.checked||false;
 const x=tracker.snapshot(),s=x.shift,reviewer=isFieldManager(person),canShare=['sales','teamlead'].includes(person.role);
 host.innerHTML='<div class="stack field-shifts"><section class="card"><div class="shift-heading"><div><h2>'+(reviewer?'Field team':'My field shift')+'</h2><p class="helper">Check in when field work starts. Pause for breaks. Check out when you finish.</p></div><button class="btn btn-ghost btn-sm" data-shift-refresh>Refresh</button></div>'+
 '<p class="shift-notice">'+(x.native?'Android tracking continues with the screen locked or while using other apps. Keep precise location and notifications enabled. Pause or check out here, or from the Android notification.':'Keep this browser app open and visible, with location permission and a connection. For tracking with a locked screen, use the Verisko Field Android app. Operations sees when updates go missing.')+'</p>'+
 (x.native&&x.queued?'<p class="helper">'+x.queued+' saved updates waiting to sync securely from this phone.</p>':'')+
 '<p class="helper">We save your location at check-in and check-out. Live tracking stops on pause or check-out. Only you, Operations and Admin can see your history, kept for 30 days. Open shifts close after 12 hours.</p>'+
 (x.error?'<p class="shift-warning" role="status">'+esc(x.error)+'</p>':'')+
 (canShare?'<div class="shift-status" data-tone="'+(x.pending?'warning':s?.status==='active'&&x.sharing?'active':'quiet')+'">'+esc(x.pending?'Location sharing off on this phone · stop waiting to sync':!s?'Not checked in':s.status==='ended'?'Checked out':s.status==='paused'?'Paused · location sharing off':x.sharing?'Location sharing '+(x.hidden?'interrupted':'on'):'Open shift · tap Continue sharing')+'</div>':'')+
 (canShare&&!x.pending&&(!s||s.status==='ended'||s.status==='paused'||!x.sharing)?'<div class="shift-consent">'+(!s||s.status==='ended'?'<label for="shiftArea">Today’s field area (optional)</label><input id="shiftArea" maxlength="120" placeholder="For example, Ntinda and Kira">':'')+'<label class="shift-checkbox"><input id="shiftConsent" type="checkbox"> I agree to share my device location during this active field shift with Operations and Admin accounts.</label></div>':'')+
 '<div class="shift-actions">'+(canShare?x.pending?'<button class="btn btn-primary" data-shift-refresh>Retry sync</button>'+(x.pending.action==='pause'?'<button class="btn btn-ghost" data-shift-action="end">Check out instead</button>':''):!s||s.status==='ended'?'<button class="btn btn-primary" data-shift-begin="start" '+(!x.ready||x.busy?'disabled':'')+'>Check in</button>':s.status==='paused'?'<button class="btn btn-primary" data-shift-begin="resume" '+(x.busy?'disabled':'')+'>Resume shift</button><button class="btn btn-ghost" data-shift-action="end">Check out</button>':(x.sharing?'<button class="btn btn-primary" data-shift-action="pause">Pause shift</button>':'<button class="btn btn-primary" data-shift-begin="reconnect" '+(x.busy?'disabled':'')+'>Continue sharing</button>')+'<button class="btn btn-ghost" data-shift-action="end">Check out</button>':'')+'</div></section>'+
 (canShare&&(s?.status==='ended'||x.pending?.action==='end')?'<section class="card" role="status"><h2>Thank you for your shift!</h2><p>'+esc(checkoutMessage(x).text)+'</p></section>':'')+
 (canShare&&s?'<section class="card"><h2>Your latest shift</h2>'+details(s,esc)+'</section>':'')+
 (reviewer?'<section class="card"><h2>Latest team status</h2><p class="helper">Refreshes about every 30 seconds. “Location updated” means a device reported recently; it does not prove someone is working. Use this alongside prospect and visit records.</p><div class="list">'+(x.team||[]).map(t=>'<article class="item"><div class="shift-heading"><div><strong>'+esc(t.name)+'</strong><p class="helper">'+esc(t.signal)+(t.startedAt?' · '+date(t.startedAt)+' check-in '+time(t.startedAt):'')+'</p></div>'+(t.id?'<button class="btn btn-ghost btn-sm" data-shift-person="'+esc(t.userId)+'">View shift</button>':'')+'</div>'+(t.lastPosition?'<p class="helper">Last location: '+date(t.lastPosition.at)+' · '+time(t.lastPosition.at)+' ('+age(t.lastPosition.at)+') · ±'+t.lastPosition.accuracy+'m. '+link(t.lastPosition)+'</p>':'')+'</article>').join('')+'</div></section>':'')+
 '<section class="card"><h2>Shift history</h2><p class="helper">Completed shifts from the last 30 days. All times are Uganda time.</p>'+(canShare?'<button class="btn btn-ghost btn-sm" data-shift-history="'+esc(person.id)+'">Load my history</button>':'<p class="helper">Open a team member’s shift to load their history.</p>')+'<div id="shiftHistory"></div></section><section id="shiftDetail" class="card" hidden></section></div>';
 host.querySelectorAll('[data-shift-refresh]').forEach(b=>b.onclick=()=>tracker.refresh());
 if(host.querySelector('#shiftArea'))host.querySelector('#shiftArea').value=previousArea;
 if(host.querySelector('#shiftConsent'))host.querySelector('#shiftConsent').checked=previousConsent;
 host.querySelectorAll('[data-shift-action]').forEach(b=>{b.disabled=!!x.busy;b.onclick=async()=>{const action=b.dataset.shiftAction;await tracker.stop(action);const next=tracker.snapshot();if(action==='end'&&(next.shift?.status==='ended'||next.pending?.action==='end'))await shiftPrompt('end',next);};});
 host.querySelectorAll('[data-shift-begin]').forEach(b=>b.onclick=async()=>{
  if(!host.querySelector('#shiftConsent')?.checked){const msg=host.querySelector('.shift-consent');msg?.querySelector('input[type=checkbox]')?.focus();if(msg&&!msg.querySelector('[role=alert]'))msg.insertAdjacentHTML('beforeend','<p role="alert" class="shift-warning">Please confirm location sharing first.</p>');return;}
  const action=b.dataset.shiftBegin,area=host.querySelector('#shiftArea')?.value||'';
  if(action==='start'){const choice=await shiftPrompt('start');if(choice==='support'){onSupport();return;}if(choice!=='start')return;}
  await tracker.begin(action,area);
 });
 if(previousDetail&&!previousDetail.hidden)host.querySelector('#shiftDetail').replaceWith(previousDetail);
 if(previousHistory&&previousHistory.textContent)host.querySelector('#shiftHistory').replaceWith(previousHistory);
 const detailHost=host.querySelector('#shiftDetail');
 async function show(userId,shiftId){
  detailHost.hidden=false;detailHost.innerHTML='<p role="status">Loading shift…</p>';
  try{const r=await api('GET',null,'?userId='+encodeURIComponent(userId)+(shiftId?'&shiftId='+encodeURIComponent(shiftId):''));detailHost.innerHTML='<h2>'+esc(r.shift.name)+' · '+esc(status(r.shift))+'</h2>'+details(r.shift,esc)+'<button class="btn btn-ghost btn-sm" data-detail-history>Load this person’s history</button>';detailHost.querySelector('[data-detail-history]').onclick=()=>history(userId);}
  catch(e){detailHost.innerHTML='<p role="alert">'+esc(e.message)+'</p>';}
 }
 async function history(userId){
  const dest=host.querySelector('#shiftHistory');dest.innerHTML='<p role="status">Loading history…</p>';
  try{const r=await api('GET',null,'?history=1&userId='+encodeURIComponent(userId));dest.innerHTML=r.history.length?r.history.map(s=>'<p><button class="btn btn-ghost btn-sm" data-history-id="'+esc(s.id)+'">'+esc(s.name)+' · '+date(s.startedAt)+' · '+time(s.startedAt)+'–'+time(s.endedAt)+'</button></p>').join(''):'<p class="helper">No completed shifts recorded.</p>';dest.querySelectorAll('[data-history-id]').forEach(b=>b.onclick=()=>show(userId,b.dataset.historyId));}
  catch(e){dest.innerHTML='<p role="alert">'+esc(e.message)+'</p>';}
 }
 host.querySelectorAll('[data-shift-person]').forEach(b=>b.onclick=()=>show(b.dataset.shiftPerson));
 host.querySelectorAll('[data-shift-history]').forEach(b=>b.onclick=()=>history(b.dataset.shiftHistory));
}
