import {createHash} from 'node:crypto';
import {canUseVoice} from './voice-notes-core.mjs';
import {imageData} from './installer-core.mjs';
import {SITE_SHOTS,CAMERA_SHOTS,sitePlanReady} from '../../../site-photo-guide.mjs';
const fail=(s,status=400)=>Object.assign(Error(s),{status});
const valid=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(s);
const text=(s,n)=>typeof s==='string'?s.trim().slice(0,n):'';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const empty=contactId=>({contactId,version:0,positions:[],photos:[],requests:[]});
const publicItem=x=>({contactId:x.contactId,version:x.version,positions:x.positions.filter(p=>!p.archivedAt),photos:x.photos,ready:sitePlanReady({...x,positions:x.positions.filter(p=>!p.archivedAt)})});
export function createSitePhotosHandler({store,authorize,now=()=>new Date().toISOString()}){return async request=>{try{
 const auth=await authorize(request),me=auth?.me;if(!me)throw fail('Sign in again.',auth?.status||401);
 if(!['GET','POST'].includes(request.method))throw fail('Use the photo page.',405);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)throw fail('Open the photo page in the app.',403);
 let body={};if(request.method==='POST'){if(!request.headers.get('content-type')?.startsWith('application/json'))throw fail('Use the photo page.',415);const raw=await request.text();if(raw.length>1600000)throw fail('Keep the photo under 1 MB.',413);try{body=JSON.parse(raw);}catch{throw fail('Could not read this save.');}}
 const url=new URL(request.url),jobId=body.jobId||url.searchParams.get('jobId'),job=(auth.jobs||[]).find(j=>j.id===jobId),contactId=jobId?job?.readyContactId:body.contactId||url.searchParams.get('contactId'),p=(auth.prospects||[]).find(p=>p.id===contactId);
 const assigned=me.role==='installer'&&job?.assignees?.includes(me.id);
 if(!valid(contactId)||!(assigned||canUseVoice(p,me,auth.cases)))throw fail('This site is not shared with you.',404);
 if(me.role==='installer'&&request.method!=='GET')throw fail('Operations makes the camera plan.',403);
 const relevant=(auth.jobs||[]).filter(j=>j.readyContactId===contactId),quotes=(auth.sourceJobs||[]).filter(j=>j.prospectId===contactId&&!['Cancelled','Rejected'].includes(j.stage)),expected=job?.cameras?.length||(relevant.length===1?relevant[0].cameras?.length:0)||(quotes.length===1?Number(quotes[0].cameraCount):0)||null;
 const replyItem=x=>{const out=publicItem(x);return {...out,expected,ready:out.ready&&(!expected||out.positions.length===expected)};};
 const key='contacts/'+contactId,old=await store.getWithMetadata(key,{type:'json'}),item=old?.data||empty(contactId);
 if(request.method==='GET'){
  const id=url.searchParams.get('id');if(!id)return json({ok:true,contact:{id:contactId,business:p?.business||job?.business||'Site'},canPlan:['operations','admin','teamlead'].includes(me.role),canUpload:me.role!=='installer',savedJobs:['operations','admin','teamlead'].includes(me.role)?(auth.jobs||[]).filter(j=>j.readyContactId===contactId).map(j=>({id:j.id,label:j.business+' · '+(j.scheduledDate||'Date not set')})):[],item:replyItem(item)});
  if(!valid(id)||!item.photos.some(n=>n.id===id))throw fail('Photo not found.',404);
  const photo=await store.get('images/'+contactId+'/'+id,{type:'json'});if(!photo)throw fail('Photo is not available.',404);
  return new Response(Buffer.from(photo.base64,'base64'),{headers:{'Content-Type':photo.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
 }
 const id=body.requestId;if(!valid(id)||id.length<8)throw fail('A save ID is needed.');
 const digest=hash({...body,version:undefined}),repeat=item.requests.find(r=>r.id===id);
 if(repeat){if(repeat.by!==me.id||repeat.hash!==digest)throw fail('This save ID was already used.',409);return json({ok:true,item:replyItem(item)});}
 if(body.version!==item.version)throw fail('This site changed. Your work is kept. Check it, then tap Save again.',409);
 const next=structuredClone(item),at=now();
 if(body.action==='archive_position'){
  if(!['operations','admin','teamlead'].includes(me.role))throw fail('Operations makes the camera plan.',403);const position=next.positions.find(p=>p.id===body.positionId&&!p.archivedAt);if(!position)throw fail('Camera spot not found.',404);position.archivedAt=at;position.archivedBy=me.id;
 }else if(body.action==='positions_from_job'){
  if(!['operations','admin','teamlead'].includes(me.role))throw fail('Operations makes the camera plan.',403);
  const source=(auth.jobs||[]).find(j=>j.id===body.sourceJobId&&j.readyContactId===contactId);if(!source)throw fail('Choose a job for this client.',404);
  for(const camera of source.cameras||[]){if(next.positions.some(p=>!p.archivedAt&&p.name.toLowerCase()===camera.name.toLowerCase()))continue;const archived=next.positions.find(p=>p.id==='spot-'+hash([source.id,camera.id]).slice(0,24)&&p.archivedAt);if(archived){delete archived.archivedAt;delete archived.archivedBy;continue;}if(next.positions.length>=24)throw fail('This plan already has 24 camera spots.');next.positions.push({id:'spot-'+hash([source.id,camera.id]).slice(0,24),name:camera.name,aim:'',sourceJobId:source.id,by:me.name||'Staff',at});}
 }else if(body.action==='position'){
  if(!['operations','admin','teamlead'].includes(me.role))throw fail('Operations makes the camera plan.',403);
  if(!valid(body.positionId))throw fail('Choose a camera position.');
  const name=text(body.name,100),aim=text(body.aim,400);if(!name||!aim)throw fail('Name the camera spot and say what it should see.');
  if(next.positions.some(p=>!p.archivedAt&&p.id!==body.positionId&&p.name.toLowerCase()===name.toLowerCase()))throw fail('Give each camera spot a different name.');
  const prior=next.positions.find(p=>p.id===body.positionId);if(prior?.archivedAt)throw fail('This spot was removed. Add a new spot.');if(!prior&&next.positions.length>=24)throw fail('This plan already has 24 camera spots.');
  const position={id:body.positionId,name,aim,by:me.name||'Staff',at};if(prior)Object.assign(prior,position);else next.positions.push(position);
 }else if(body.action==='photo'){
  const positionId=body.positionId||'',slots=positionId?CAMERA_SHOTS:SITE_SHOTS;
  if(positionId&&(!['operations','admin','teamlead'].includes(me.role)||!next.positions.some(p=>p.id===positionId&&!p.archivedAt)))throw fail('Choose a saved camera spot. Operations adds these photos.',403);
  if(!slots.some(([slot])=>slot===body.slot))throw fail('Choose the photo to take.');
  if(next.photos.length>=160)throw fail('This site has enough photos. Ask Operations to review it.');
  const image=imageData(body.image),imageKey='images/'+contactId+'/'+id,binding=hash([image.hash,positionId,body.slot,me.id]),put=await store.setJSON(imageKey,{...image,binding},{onlyIfNew:true});
  if(!put.modified&&(await store.get(imageKey,{type:'json'}))?.binding!==binding)throw fail('This photo ID was already used.',409);
  if(next.photos.some(p=>p.id===id))return json({ok:true,item:replyItem(item)});
  next.photos.push({id,positionId,slot:body.slot,by:me.name||'Staff',byId:me.id,at});
 }else throw fail('Choose a photo or camera spot.');
 next.version++;next.requests=[...next.requests,{id,hash:digest,by:me.id}].slice(-500);
 const put=await store.setJSON(key,next,old?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(!put.modified)throw fail('Someone saved at the same time. Tap Refresh and try again.',409);
 return json({ok:true,item:replyItem(next)});
 }catch(e){return json({ok:false,error:e.status?e.message:'Could not save the site photos. Try again.'},e.status||500);}};}
