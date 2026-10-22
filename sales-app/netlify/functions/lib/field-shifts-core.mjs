import {createHash, randomUUID} from 'node:crypto';

export const RETENTION_DAYS=30, MAX_SHIFT_MS=12*60*60*1000, STALE_MS=5*60*1000;
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const ownerKey=id=>createHash('sha256').update(String(id)).digest('hex');
const keyFor=id=>'current/'+ownerKey(id);
const archiveKey=(id,s)=>'history/'+ownerKey(id)+'/'+s.startedAt.slice(0,10)+'/'+s.id;
const manager=u=>['admin','operations'].includes(u?.role);
const field=u=>['sales','teamlead'].includes(u?.role);

export function cleanPosition(input,now,maxAge=120000){
 if(!input||typeof input!=='object')throw fail('A fresh device location is required.');
 const {lat,lng,accuracy,at}=input;
 if(![lat,lng,accuracy].every(n=>typeof n==='number'&&Number.isFinite(n))||Math.abs(lat)>90||Math.abs(lng)>180||accuracy<0||accuracy>5000)throw fail('Invalid device location.');
 const time=Date.parse(at);
 if(!Number.isFinite(time)||time<now-maxAge||time>now+15000)throw fail('Location is too old. Get a fresh location and try again.');
 return {lat:+lat.toFixed(6),lng:+lng.toFixed(6),accuracy:Math.round(accuracy),at:new Date(time).toISOString(),receivedAt:new Date(now).toISOString()};
}
export function expireShift(s,now){
 if(!s||s.status==='ended'||now-Date.parse(s.startedAt)<MAX_SHIFT_MS)return s;
 const end=new Date(Date.parse(s.startedAt)+MAX_SHIFT_MS).toISOString();
 return {...s,status:'ended',endedAt:end,endReason:'Automatically closed after 12 hours',segments:s.segments.map(x=>x.endedAt?x:{...x,endedAt:end}),events:[...s.events,{type:'auto-end',at:end}],issue:''};
}
export function transition(previous,body,person,now,uuid=randomUUID){
 const action=body.action,at=new Date(now).toISOString();
 if(!/^[A-Za-z0-9-]{8,90}$/.test(body.requestId||''))throw fail('A request ID is required.');
 if(previous?.requests?.includes(body.requestId))return previous;
 const old=expireShift(previous,now);
 let s=old?structuredClone(old):null;
 if(action==='batch'){
  if(!s||body.shiftId!==s.id)throw fail('This shift is no longer current.',409);
  const segment=s.segments.find(x=>x.id===body.segmentId);
  if(!segment)throw fail('Unknown sharing segment.',409);
  if(!Array.isArray(body.points)||!body.points.length||body.points.length>25)throw fail('Send between 1 and 25 locations.');
  const end=Math.min(now,Date.parse(segment.endedAt||new Date(now).toISOString()),Date.parse(s.startedAt)+MAX_SHIFT_MS);
  for(const point of body.points){
   const geo=cleanPosition(point,now,MAX_SHIFT_MS+86400000),captured=Date.parse(geo.at);
   if(captured<Date.parse(segment.startedAt)||captured>end)throw fail('Location is outside the active sharing interval.');
   if(s.points.some(p=>p.segmentId===segment.id&&p.at===geo.at))continue;
   if(s.points.some(p=>p.segmentId===segment.id&&Math.abs(Date.parse(p.at)-captured)<30000))throw fail('Locations must be at least 30 seconds apart.');
   if(s.points.length>=1500)throw fail('Shift location limit reached.',409);
   s.points.push({...geo,segmentId:segment.id,source:'android',delayed:now-captured>120000});
  }
  s.points.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  // An old offline batch must never make a stale device appear live.
  if(now-Date.parse(s.points.at(-1).at)<STALE_MS)s.issue='';
  s.requests=[...(s.requests||[]),body.requestId].slice(-80);return s;
 }
 if(action==='start'){
  if(s&&s.status!=='ended')throw fail('You already have an open shift. Continue sharing, pause or check out.',409);
  if(body.consent!==true)throw fail('Confirm shift location sharing before checking in.');
  const geo=cleanPosition(body.position,now);
  if(geo.accuracy>150)throw fail('Location accuracy is over 150 metres. Move outdoors and try again.');
  const segmentId=uuid();
  s={id:uuid(),userId:person.id,name:person.name||'Sales',area:typeof body.area==='string'?body.area.trim().slice(0,120):'',startedAt:at,status:'active',endedAt:'',consentAt:at,policy:'field-shifts-v1',segments:[{id:segmentId,startedAt:at,endedAt:''}],points:[{...geo,segmentId}],events:[{type:'check-in',at}],issue:'',requests:[]};
 }else{
  if(!s||body.shiftId!==s.id)throw fail('This shift is no longer current. Refresh and try again.',409);
  const lateStop=s.status==='ended'&&!!s.endReason&&(action==='pause'||action==='end')&&Date.parse(body.requestedAt)>=Date.parse(s.segments.at(-1).startedAt)&&Date.parse(body.requestedAt)<=Date.parse(s.endedAt);
  if(s.status==='ended'&&!lateStop)throw fail('This shift has ended. Check in to start another.',409);
  if(action==='point'){
   const segment=s.segments.at(-1);
   if(s.status!=='active'||body.segmentId!==segment.id)throw fail('Location sharing stopped or moved to another tab. Refresh your shift.',409);
   const geo=cleanPosition(body.position,now),last=s.points.at(-1);
   if(Date.parse(geo.at)<Date.parse(segment.startedAt)-15000||Date.parse(geo.at)<=Date.parse(last.at))throw fail('A newer location is required.');
   if(now-Date.parse(last.receivedAt)<30000)throw fail('Location was already updated. Wait a moment.',429);
   if(s.points.length>=1500)throw fail('Shift location limit reached. Please check out.',409);
   s.points.push({...geo,segmentId:segment.id});s.issue='';
  }else if(action==='pause'||action==='end'){
   // A queued offline stop records both phone time and server receipt. The phone
   // time cannot move before the latest stored location or beyond receipt time.
   const requested=Date.parse(body.requestedAt),last=s.points.at(-1);
   const stop=Number.isFinite(requested)?Math.max(Date.parse(last.at),Date.parse(s.segments.at(-1).startedAt),Math.min(now,requested)):now;
   const stoppedAt=new Date(stop).toISOString();
   if(action==='pause'&&s.status==='paused')return {...s,requests:[...(s.requests||[]),body.requestId].slice(-80)};
   s.segments=s.segments.map((x,i)=>!x.endedAt||(lateStop&&i===s.segments.length-1)?{...x,endedAt:stoppedAt}:x);
   s.status=action==='end'||lateStop?'ended':'paused';s.issue='';
   if(action==='end'){s.endedAt=stoppedAt;s.endReason='';s.events=s.events.filter(e=>e.type!=='auto-end');}
   s.events.push({type:action==='end'?'check-out':'pause',at:stoppedAt,receivedAt:at});
  }else if(action==='resume'||action==='reconnect'){
   if(action==='resume'&&s.status!=='paused')throw fail('The shift is not paused. Refresh first.',409);
   if(action==='reconnect'&&s.status!=='active')throw fail('Resume your paused shift first.',409);
   if(body.consent!==true)throw fail('Confirm location sharing to continue.');
   const geo=cleanPosition(body.position,now);
   if(geo.accuracy>150)throw fail('Location accuracy is over 150 metres. Move outdoors and try again.');
   s.segments=s.segments.map(x=>x.endedAt?x:{...x,endedAt:at});
   const segmentId=uuid();s.segments.push({id:segmentId,startedAt:at,endedAt:''});
   s.points.push({...geo,segmentId});s.status='active';s.issue='';s.events.push({type:action,at});
  }else if(action==='issue'){
   if(s.status!=='active'||body.segmentId!==s.segments.at(-1).id)throw fail('Sharing is no longer active on this device.',409);
   s.issue=['permission-denied','gps-unavailable','page-hidden','signed-out'].includes(body.issue)?body.issue:'gps-unavailable';
   s.issueAt=at;
  }else throw fail('Unknown shift action.');
 }
 s.events.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 s.requests=[...(s.requests||[]),body.requestId].slice(-80);return s;
}
export function summary(s,now){
 if(!s)return null;
 s=expireShift(s,now);
 const last=s.points.at(-1),fresh=now-Date.parse(last.at)<=STALE_MS;
 const activeMs=s.segments.reduce((n,x)=>n+Math.max(0,Date.parse(x.endedAt||new Date(now).toISOString())-Date.parse(x.startedAt)),0);
 return {id:s.id,userId:s.userId,name:s.name,area:s.area||'',status:s.status,startedAt:s.startedAt,endedAt:s.endedAt,endReason:s.endReason||'',activeMs,pointCount:s.points.length,lastPosition:last,issue:s.issue||'',signal:s.status==='ended'?'Checked out':s.status==='paused'?'Paused':!fresh?'Update missing':s.issue?'Sharing interrupted':last.accuracy>150?'Low accuracy':'Location updated'};
}
const publicShift=s=>{if(!s)return null;const {requests,...out}=s;return out;};

export function createFieldShiftsHandler({store,authorize,now=Date.now,uuid=randomUUID}){
 async function saveArchive(s){if(s?.status==='ended'){
  const key=archiveKey(s.userId,s);
  for(let i=0;i<5;i++){
   const old=await store.getWithMetadata(key,{type:'json'});
   if(old&&(old.data.revision||0)>=(s.revision||0))return;
   const result=await store.setJSON(key,s,old?{onlyIfMatch:old.etag}:{onlyIfNew:true});
   if(result.modified&&(await store.get(key,{type:'json'}))?.id===s.id)return;
  }
  throw new Error('Archive write was not confirmed.');
 }}
 async function load(id){return store.getWithMetadata(keyFor(id),{type:'json'});}
 return async request=>{
  try{
   const auth=await authorize(request);
   if(!auth?.me) return json({ok:false,error:'Sign in with an active staff account.'},auth?.status||401);
   const me=auth.me,users=auth.users||[],clock=now(),url=new URL(request.url);
   if(!manager(me)&&!field(me))throw fail('Field shifts are not available for this role.',403);
   if(request.method==='GET'){
    if(url.searchParams.has('status')){
     const s=expireShift((await load(me.id))?.data,clock);
     return json({ok:true,current:s?{id:s.id,status:s.status,segmentId:s.segments.at(-1).id,segments:s.segments,deadline:Date.parse(s.startedAt)+MAX_SHIFT_MS}:null});
    }
    const userId=url.searchParams.get('userId')||me.id;
    if(userId!==me.id&&!manager(me))throw fail('You can only view your own shifts.',403);
    if(url.searchParams.has('userId')&&!url.searchParams.has('history')&&!url.searchParams.has('shiftId')){
     const selected=expireShift((await load(userId))?.data,clock);
     if(!selected||Date.parse(selected.startedAt)<clock-RETENTION_DAYS*86400000)throw fail('No recent shift recorded.',404);
     return json({ok:true,shift:publicShift(selected)});
    }
    if(url.searchParams.has('history')){
     const prefix='history/'+ownerKey(userId)+'/',{blobs}=await store.list({prefix});
     const cutoff=clock-RETENTION_DAYS*86400000;
     const keys=(blobs||[]).filter(b=>Date.parse(b.key.slice(prefix.length, prefix.length+10))>=cutoff-86400000).sort((a,b)=>b.key.localeCompare(a.key)).slice(0,60);
     const history=(await Promise.all(keys.map(b=>store.get(b.key,{type:'json'})))).filter(s=>s&&Date.parse(s.startedAt)>=cutoff).map(s=>summary(s,clock));
     return json({ok:true,history});
    }
    const shiftId=url.searchParams.get('shiftId');
    if(shiftId){
     const {blobs}=await store.list({prefix:'history/'+ownerKey(userId)+'/'});
     const item=(blobs||[]).find(b=>b.key.endsWith('/'+shiftId));
     const s=item?await store.get(item.key,{type:'json'}):null;
     if(!s||Date.parse(s.startedAt)<clock-RETENTION_DAYS*86400000)throw fail('Shift history is unavailable.',404);
     return json({ok:true,shift:publicShift(s)});
    }
    const record=await load(me.id);let mine=expireShift(record?.data,clock);
    // Archived copies are independent immutable records, never part of shared app-data.
    await saveArchive(mine);
    const reps=manager(me)?users.filter(field):[me];
    const team=await Promise.all(reps.map(async u=>{
     const r=u.id===me.id?record:await load(u.id),s=expireShift(r?.data,clock);
     if(s&&Date.parse(s.startedAt)>=clock-RETENTION_DAYS*86400000)return {...summary(s,clock),userId:u.id,name:u.name};
     return {userId:u.id,name:u.name,status:'none',signal:'Not checked in'};
    }));
    return json({ok:true,shift:mine&&Date.parse(mine.startedAt)>=clock-RETENTION_DAYS*86400000?publicShift(mine):null,team,retentionDays:RETENTION_DAYS,maxShiftHours:12,serverTime:new Date(clock).toISOString()});
   }
   if(request.method!=='POST')return json({ok:false,error:'Method not allowed.'},405);
   if(!field(me))throw fail('Only field staff can start or change their own shift.',403);
   const origin=request.headers.get('origin');if(origin&&origin!==url.origin)throw fail('Invalid request origin.',403);
   const text=await request.text();if(text.length>10000)throw fail('Request too large.',413);
   let body;try{body=JSON.parse(text);}catch{throw fail('Invalid request.');}
   if(!body||typeof body!=='object')throw fail('Invalid request.');
   if(body.userId&&body.userId!==me.id)throw fail('You can only change your own shift.',403);
   for(let attempt=0;attempt<5;attempt++){
    const record=await load(me.id),previous=record?.data;
    if(record&&!record.etag)throw new Error('Conditional write token unavailable.');
    if(body.action==='start')await saveArchive(expireShift(previous,clock));
    const next=transition(previous,body,me,clock,uuid);
    if(next!==previous)next.revision=(previous?.id===next.id?(previous.revision||0):0)+1;
    const result=await store.setJSON(keyFor(me.id),next,record?{onlyIfMatch:record.etag}:{onlyIfNew:true});
    if(!result.modified)continue;
    const saved=await load(me.id);
    if(saved?.data?.id!==next.id||!saved.data.requests?.includes(body.requestId))continue;
    await saveArchive(next);
    if(body.action==='batch')return json({ok:true,shiftId:saved.data.id,pointCount:saved.data.points.length});
    return json({ok:true,shift:publicShift(saved.data),summary:summary(saved.data,clock)});
   }
   throw fail('Shift changed on another device. Refresh and try again.',409);
  }catch(error){return json({ok:false,error:error.status?error.message:'Shift service unavailable. Try again.'},error.status||503);}
 };
}

export async function cleanupFieldShifts(store,now=Date.now()){
 const cutoff=now-RETENTION_DAYS*86400000;
 for await(const page of store.list({paginate:true}))for(const blob of page.blobs||[]){
  const s=await store.get(blob.key,{type:'json'});
  if(s&&Date.parse(s.startedAt)<cutoff)await store.delete(blob.key);
 }
}
