export const CHECK_IN_REMINDERS=['Smile and greet the client.','Do not talk over the client. Let them finish.','Listen more than you talk.'];
export function recordedHours(shift){return (shift?.segments||[]).reduce((n,x)=>{const start=Date.parse(x.startedAt),end=Date.parse(x.endedAt||shift.endedAt);return n+(Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,end-start):0);},0);}
export function checkoutMessage(snapshot){
 const s=snapshot.shift,recorded=s?.status==='ended'&&!!s.endedAt&&!s.offlineSummary&&!snapshot.pending;
 return {recorded,text:recorded?'Thank you so much for your shift. Your hours have been recorded.':'Thank you so much for your shift. Your check-out is saved on this phone and is waiting to sync.',hours:recorded?recordedHours(s):null};
}
export function shiftPrompt(kind,snapshot){
 const old=document.getElementById('fieldShiftPrompt');if(old)return Promise.resolve(null);
 return new Promise(resolve=>{
  const d=document.createElement('dialog');d.id='fieldShiftPrompt';d.className='ask-dialog';d.setAttribute('aria-labelledby','fieldShiftPromptTitle');
  if(kind==='start')d.innerHTML='<div class="ask-head"><h2 id="fieldShiftPromptTitle">Before you start</h2><p class="ask-body">A quick reminder for a good visit:</p></div><div class="shift-start-checklist">'+CHECK_IN_REMINDERS.map(t=>'<label class="shift-checkbox"><input type="checkbox" data-shift-reminder> '+t+'</label>').join('')+'</div><p class="helper">Need a refresher? Watch a short video in Support.</p><button type="button" class="btn btn-ghost btn-block" data-prompt-support>Watch Support videos</button><div class="ask-actions"><button type="button" class="btn btn-ghost" data-prompt-cancel>Not now</button><button type="button" class="btn btn-primary" data-prompt-start disabled>Start my shift</button></div>';
  else{const m=checkoutMessage(snapshot),minutes=m.hours===null?null:Math.floor(m.hours/60000);d.innerHTML='<div class="ask-head"><h2 id="fieldShiftPromptTitle">Thank you for your shift!</h2><p class="ask-body">'+m.text+'</p></div>'+(minutes===null?'':'<p><strong>Shift time: '+Math.floor(minutes/60)+'h '+minutes%60+'m</strong><br><span class="helper">Breaks are not included.</span></p>')+'<div class="ask-actions"><button type="button" class="btn btn-primary" data-prompt-cancel>Done</button></div>';}
  let done=false;function finish(value){if(done)return;done=true;d.close();d.remove();resolve(value);}
  d.addEventListener('cancel',e=>{e.preventDefault();finish(null);});d.querySelector('[data-prompt-cancel]').onclick=()=>finish(null);
  if(kind==='start'){const start=d.querySelector('[data-prompt-start]');d.onchange=()=>{start.disabled=![...d.querySelectorAll('[data-shift-reminder]')].every(x=>x.checked);};start.onclick=()=>finish('start');d.querySelector('[data-prompt-support]').onclick=()=>finish('support');}
  document.body.append(d);d.showModal();d.querySelector('input,button')?.focus();
 });
}
