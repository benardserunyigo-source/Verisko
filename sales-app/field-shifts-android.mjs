// Android owns GPS, encrypted offline storage and uploads. Web timers are only
// for refreshing the screen; visibility changes must never stop the service.
export function createNativeRpc(bridge,{timers=globalThis,uuid=()=>crypto.randomUUID()}={}){
 const pending=new Map();
 bridge.onmessage=event=>{let value;try{value=JSON.parse(event.data);}catch{return;}const task=pending.get(value.id);if(!task)return;timers.clearTimeout(task.timer);pending.delete(value.id);value.ok?task.resolve(value.status):task.reject(new Error(value.error||'Android request failed.'));};
 return (action,payload={})=>new Promise((resolve,reject)=>{const id=uuid(),timer=timers.setTimeout(()=>{pending.delete(id);reject(new Error('Android did not reply. Open the app and refresh your shift.'));},70000);pending.set(id,{resolve,reject,timer});try{bridge.postMessage(JSON.stringify({...payload,id,action}));}catch(e){timers.clearTimeout(timer);pending.delete(id);reject(e);}});
}
export function createAndroidShiftTracker({api,bridge,credentials,personId,onChange=()=>{},timers=globalThis}){
 const rpc=createNativeRpc(bridge,{timers});let state={shift:null,team:[],ready:false,busy:false,sharing:false,error:'',pending:null,native:true,queued:0},poll=null,disposed=false;
 const snapshot=()=>({...state,hidden:false});const emit=()=>{if(!disposed)onChange(snapshot());};
 function applyNative(native,freshServer=false){
  state.sharing=native.sameUser&&native.tracking&&native.serviceRunning;state.native=true;state.queued=native.pending||0;
  state.pending=native.pendingAction?{action:native.pendingAction}:null;
  if(native.error)state.error=native.error;
  if(native.sameUser===false)state.error='Another staff member has an unfinished shift on this phone. Finish and sync it before changing accounts.';
  if(!state.shift&&native.shiftId)state.shift={id:native.shiftId,name:'Your shift',status:native.status||'active',startedAt:native.startedAt,points:[],segments:[],events:[],offlineSummary:true};
  if(state.shift?.id===native.shiftId&&!state.sharing&&native.status&&native.status!=='active'&&(!freshServer||native.pendingAction))state.shift={...state.shift,status:native.status};
  if(native.tracking&&!native.serviceRunning)state.error='Android tracking was interrupted. Tap Continue sharing to restart it.';
 }
 async function refresh(){
  if(disposed)return;
  try{
   let native=await rpc('status',{userId:personId}),freshServer=false;
   try{const response=await api('GET');if(disposed)return;state.shift=response.shift;state.team=response.team||[];state.ready=true;state.error='';freshServer=true;
    if(native.tracking&&response.shift&&(response.shift.id!==native.shiftId||response.shift.status!=='active'||response.shift.segments.at(-1)?.id!==native.segmentId))native=await rpc('local-stop',{userId:personId});
   }
   catch(e){if(native.sameUser){state.ready=true;state.error=native.error||'No connection. Android saves active-shift locations securely until signal returns.';}else state.error=e.message;}
   if(disposed)return;applyNative(native,freshServer);
  }catch(e){if(!disposed)state.error=e.message;}emit();
 }
 return {
  native:true,snapshot,
  async init(){await refresh();if(!disposed)poll=timers.setInterval(refresh,30000);},
  refresh,
  async begin(action,area=''){
   if(state.busy||state.pending||disposed)return;state.busy=true;state.error='Starting Android tracking…';emit();
   try{const auth=credentials();if(auth.kind!=='pin')throw new Error('Use phone number and PIN sign-in for Android field tracking.');await rpc('begin',{userId:personId,token:auth.access_token,expiresAt:auth.expires_at*1000,shiftAction:action,shiftId:state.shift?.id||'',area,consent:true});await refresh();}
   catch(e){state.error=e.message;}finally{state.busy=false;emit();}
  },
  async stop(action){state.sharing=false;state.error='Stopping Android tracking…';emit();try{applyNative(await rpc(action,{userId:personId}));await refresh();}catch(e){state.error='Could not confirm tracking stopped. Use Pause or Check out in the Android notification. '+e.message;}emit();},
  // A locked screen / WhatsApp does not stop native GPS.
  async visibility(hidden){if(!hidden)await refresh();},
  destroy(){disposed=true;if(poll)timers.clearInterval(poll);},
 };
}
