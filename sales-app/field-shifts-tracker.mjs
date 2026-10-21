// Location is requested only after an explicit staff action. No GPS positions
// are persisted on the device. Only a pending pause/check-out can be queued.
export function createShiftTracker({api,geolocation,storage,personId,onChange=()=>{},now=Date.now,timers=globalThis}){
 const key='verisko_shift_stop_'+personId;
 let state={shift:null,team:[],ready:false,busy:false,sharing:false,error:'',pending:null},watch=null,gpsTimer=null,pollTimer=null,epoch=0,lastSent=0,sending=false,hidden=false,destroyed=false,lease='';
 const id=()=>globalThis.crypto.randomUUID();
 try{state.pending=JSON.parse(storage.getItem(key)||'null');}catch{}
 const emit=()=>{if(!destroyed)onChange(snapshot());};
 const snapshot=()=>({...state,hidden});
 function persist(){try{state.pending?storage.setItem(key,JSON.stringify(state.pending)):storage.removeItem(key);}catch{}}
 function stopGPS(){epoch++;if(watch!==null)geolocation?.clearWatch(watch);watch=null;if(gpsTimer)timers.clearInterval(gpsTimer);gpsTimer=null;}
 const position=p=>({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,at:new Date(p.timestamp).toISOString()});
 const errorText=e=>e?.code===1?'Location permission is blocked. Allow location for this app, then continue sharing.':e?.message||'Could not get a fresh location. Move outdoors and try again.';
 function locate(){return new Promise((resolve,reject)=>{if(!geolocation)return reject(new Error('This phone cannot share a location.'));geolocation.getCurrentPosition(p=>resolve(position(p)),reject,{enableHighAccuracy:true,maximumAge:0,timeout:20000});});}
 async function post(body){return api('POST',body);}
 async function sendPoint(p){
  if(!state.sharing||hidden||state.pending||sending||now()-lastSent<60000)return;
  const generation=epoch,shift=state.shift,segmentId=lease;
  if(!shift||shift.status!=='active')return;
  sending=true;lastSent=now();
  try{
   const r=await post({action:'point',shiftId:shift.id,segmentId,position:p,requestId:id()});
   if(generation!==epoch||destroyed)return;
   state.shift=r.shift;state.error='';
  }catch(e){
   if(generation!==epoch||destroyed)return;
   state.error=e.message||'Location update could not be sent.';
   if(e.status===401||e.status===403||e.status===409){state.sharing=false;stopGPS();}
  }finally{sending=false;emit();}
 }
 function gpsError(e){state.error=errorText(e);emit();if(e?.code===1){state.sharing=false;stopGPS();}reportIssue(e?.code===1?'permission-denied':'gps-unavailable');}
 async function reportIssue(issue){
  const s=state.shift;if(!s||s.status!=='active'||state.pending)return;
  try{await post({action:'issue',shiftId:s.id,segmentId:s.segments.at(-1).id,issue,requestId:id()});}catch{}
 }
 function startGPS(){
  stopGPS();if(!state.sharing||hidden||!geolocation)return;
  watch=geolocation.watchPosition(p=>sendPoint(position(p)),gpsError,{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  gpsTimer=timers.setInterval(()=>{if(state.sharing&&!hidden)locate().then(sendPoint).catch(gpsError);},60000);
 }
 async function flushStop(){
  const pending=state.pending;if(!pending)return;
  try{const r=await post(pending);if(destroyed)return;state.shift=r.shift;state.pending=null;state.error='';persist();}
  catch(e){
   // A previous retry may already have ended this shift. Never turn sharing
   // back on, including when authentication expires while offline.
   if(e.status===409){try{const r=await api('GET');if(!r.shift||r.shift.id!==pending.shiftId||r.shift.status==='ended'||(pending.action==='pause'&&r.shift.status==='paused')){state.shift=r.shift;state.pending=null;persist();}}catch{}}
   state.error=state.pending?'Sharing stopped on this phone. Your '+(pending.action==='end'?'check-out':'pause')+' is waiting to sync.':'';
  }emit();
 }
 async function refresh(){
  if(destroyed)return;
  if(state.pending)await flushStop();
  try{
   const r=await api('GET');if(destroyed)return;
   if(state.sharing&&r.shift?.segments.at(-1)?.id!==lease){state.sharing=false;stopGPS();state.error='Sharing moved to another tab or device. Continue here only if needed.';}
   state.shift=r.shift;state.team=r.team||[];state.ready=true;
   if(!r.shift||r.shift.status!=='active'){state.sharing=false;stopGPS();}
   if(!state.pending&&(!r.shift||r.shift.status!=='active'||state.sharing))state.error='';
  }catch(e){if(!destroyed){state.error=e.message||'Could not refresh field shifts.';if(e.status===401||e.status===403){state.sharing=false;stopGPS();}}}emit();
 }
 async function begin(action,area=''){
  if(state.busy||state.pending||destroyed)return;
  state.busy=true;state.error='Getting a fresh location…';emit();const generation=epoch;
  try{
   const geo=await locate();if(destroyed||generation!==epoch)return;
   const r=await post({action,shiftId:state.shift?.id,position:geo,consent:true,area,requestId:id()});
   if(destroyed||generation!==epoch)return;
   state.shift=r.shift;lease=r.shift.segments.at(-1).id;state.sharing=true;state.error='';lastSent=now();startGPS();
  }catch(e){if(!destroyed)state.error=errorText(e);}finally{state.busy=false;emit();}
 }
 async function stop(action){
  const shiftId=state.shift?.id||state.pending?.shiftId;
  if(!shiftId||state.shift?.status==='ended'||destroyed)return;
  state.sharing=false;state.busy=false;stopGPS();
  // End can replace an unsent pause. Both stop GPS immediately, even offline.
  state.pending={action,shiftId,requestedAt:state.pending?.requestedAt||new Date(now()).toISOString(),requestId:id()};persist();emit();await flushStop();
 }
 return {
  snapshot,
  async init(){await refresh();if(!destroyed)pollTimer=timers.setInterval(refresh,30000);},
  refresh,begin,stop,
  async visibility(value){hidden=value;if(value){stopGPS();await reportIssue('page-hidden');}else if(state.sharing){await refresh();startGPS();}emit();},
  destroy(){destroyed=true;state.sharing=false;stopGPS();if(pollTimer)timers.clearInterval(pollTimer);},
 };
}
