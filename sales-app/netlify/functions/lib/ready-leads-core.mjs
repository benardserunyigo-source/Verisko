import {loadReadyCases} from './ready-progress.mjs';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const office=u=>['admin','operations','teamlead'].includes(u?.role),allowed=u=>office(u)||u?.role==='sales';
const own=(p,u)=>!!u?.email&&String(p.createdByEmail||'').toLowerCase()===u.email.toLowerCase();
const valid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const text=(v,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
export function legacyCase(p){return p?.leadOnly&&p.handoffAt&&['operations','manager'].includes(p.handoffTo)?{contactId:p.id,state:'queued',ownerId:null,previousOwnerId:null,version:0,readyAt:p.handoffAt,context:text(p.handoffNote),updatedAt:p.handoffAt,history:[{id:'legacy-'+p.id,type:'requested',at:p.handoffAt,by:null,name:p.handoffBy||p.createdBy||'Sales',toId:null,toName:'Shared queue',note:text(p.handoffNote)}]}:null;}
export function transitionReady(old,body,me,p,users,at,appointments=[]){
 if(!allowed(me))throw fail('Site visit access required.',403);
 const eventId=text(body.requestId,100);if(!/^[A-Za-z0-9-]{8,100}$/.test(eventId))throw fail('A unique request ID is required.');
 const repeat=old?.history?.find(e=>e.id===eventId);if(repeat){if(repeat.by!==me.id)throw fail('Request ID already in use.',409);return old;}
 if(!Number.isSafeInteger(body.baseVersion)||body.baseVersion!==(old?.version||0))throw fail('This lead changed. Refresh the queue and try again.',409);
 if(!p||!valid(p.id)||(p.leadOnly!==true&&!old))throw fail('This contact has moved on. Open Prospects to continue.',409);
 const c=old?structuredClone(old):{contactId:p.id,state:'queued',ownerId:null,previousOwnerId:null,version:0,history:[]};
 if(c.history.length>=1000)throw fail('This lead has reached its history limit. Ask Admin for help.',409);
 const action=body.action;let type=action,toId=null,toName='',note=text(body.note),creator=users.find(u=>own(p,u));
 if(action==='request'){
  if(!own(p,me)&&!['admin','operations'].includes(me.role))throw fail('Only the contact creator or Operations can send it.',403);
  if(p.leadOnly!==true)throw fail('This contact already has a visit. Open its queue entry.',409);
  if(old&&old.state!=='returned')throw fail('This contact is already in the site visit queue.',409);
  c.state='queued';c.ownerId=null;c.previousOwnerId=null;c.readyAt=at;c.context=note;type=old?'resent':'requested';toName='Shared queue';
 }else{
  if(!old)throw fail('Send this contact to the site visit queue first.',409);
  if(!office(me))throw fail('Only Team Lead or Operations can take, assign or return a lead.',403);
  if(c.state==='returned')throw fail('This contact was returned to Sales. Wait for it to be sent again.',409);
  if(action==='take'){
   if(c.ownerId)throw fail('Someone already owns this lead. Refresh to see who.',409);
   c.ownerId=me.id;c.previousOwnerId=null;c.state='assigned';toId=me.id;toName=me.name;type='taken';
  }else if(action==='assign'){
   if(c.ownerId&&c.ownerId!==me.id&&me.role!=='admin')throw fail('Only the current owner can pass this lead on.',403);
   const target=users.find(u=>u.id===body.toId&&office(u)&&u.role!=='admin');
   if(!target)throw fail('Choose an active Team Lead or Operations person.');
   if(target.id===c.ownerId)throw fail('This person already owns the lead.');
   if(c.previousOwnerId===target.id)throw fail('Use Send back and add a reason to return this lead.');
   c.previousOwnerId=c.ownerId||me.id;c.ownerId=target.id;c.state='assigned';toId=target.id;toName=target.name;type='assigned';
  }else if(['confirm_visit','complete_visit','quote_sent'].includes(action)){
   if(!c.ownerId)throw fail('Take or assign this lead first.',409);
   if(c.ownerId!==me.id&&me.role!=='admin')throw fail('Only the current owner can update this visit.',403);
   const day=String(body.date||''),today=new Date(Date.parse(at)+3*3600000).toISOString().slice(0,10);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T12:00:00Z'))||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day)throw fail('Choose a valid date.');
   if(action==='confirm_visit'){
    if(c.visit)throw fail('This visit is already confirmed.',409);
    if(day<today)throw fail('Choose today or a future visit date.');
    const time=String(body.time||'');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw fail('Choose a valid visit time.');
    const existing=appointments.filter(a=>a.prospectId===p.id&&a.status!=='Cancelled');
    if(existing.length>1||existing.some(a=>a.visitResult))throw fail('This contact already has visits. Ask Operations to check them before confirming.',409);
    c.visit={id:existing[0]?.id||'ready-visit-'+p.id,date:day,time,confirmedAt:at,byName:me.name,byEmail:me.email};type='visit_confirmed';
   }else if(action==='complete_visit'){
    if(!c.visit)throw fail('Confirm the visit first.',409);
    if(c.visit.doneAt)throw fail('This visit is already marked done.',409);
    if(day>today)throw fail('A completed visit cannot be in the future.');
    // Noon EAT represents the chosen visit day for pay; history keeps the real save time.
    c.visit={...c.visit,doneAt:day+'T12:00:00+03:00',doneByName:me.name,doneByEmail:me.email,doneNote:note};type='visit_done';
   }else{
    if(!c.visit?.doneAt)throw fail('Mark the site visit done before recording the quote.',409);
    if(c.quoteSent)throw fail('The quote is already recorded as sent.',409);
    if(day>today||day<c.visit.doneAt.slice(0,10))throw fail('Choose a quote date from the completed visit through today.');
    c.quoteSent={at:day+'T12:00:00+03:00',byName:me.name,byEmail:me.email,reference:text(body.reference,100)};type='quote_sent';
   }
  }else if(action==='return'){
   if(c.ownerId!==me.id&&me.role!=='admin')throw fail('Only the current owner can send this lead back.',403);
   if(!c.ownerId)throw fail('Take this lead before sending it back.',409);
   if(note.length<3)throw fail('Add a reason before sending this lead back.');
   const previous=users.find(u=>u.id===c.previousOwnerId&&office(u)&&u.id!==c.ownerId);
   if(previous){toId=previous.id;toName=previous.name;c.previousOwnerId=c.ownerId;c.ownerId=previous.id;c.state='assigned';}
   else{if(c.visit)throw fail('This visit is already confirmed. Assign it to an office person instead.',409);if(!creator)throw fail('The original salesperson is no longer active. Ask Admin to reassign this lead.');toId=creator.id;toName=creator.name;c.previousOwnerId=c.ownerId;c.ownerId=creator.id;c.state='returned';}
   type='returned';
  }else throw fail('Unknown queue action.');
 }
 c.version++;c.updatedAt=at;c.history.push({id:eventId,type,at,by:me.id,name:me.name||'Staff',toId,toName,note,date:['confirm_visit','complete_visit','quote_sent'].includes(action)?body.date:undefined,time:action==='confirm_visit'?body.time:undefined});return c;
}
function view(c,p,users,me){const creator=users.find(u=>own(p,u));const safe=structuredClone(c);if(!office(me)){if(safe.quoteSent){delete safe.quoteSent.reference;delete safe.quoteSent.byEmail;}if(safe.visit){delete safe.visit.byEmail;delete safe.visit.doneByEmail;}}return {...safe,contact:{id:p.id,business:p.business||'',contact:p.contact||'',phone:p.phone||'',location:p.location||'',leadOnly:p.leadOnly===true,createdBy:p.createdBy||creator?.name||'Sales'},ownerName:users.find(u=>u.id===c.ownerId)?.name||(c.ownerId?'Former team member':'Unassigned'),creatorId:creator?.id||null};}
export function createReadyHandler({store,authorize,now=()=>new Date().toISOString()}){return async request=>{try{
 const auth=await authorize(request),me=auth?.me;if(!allowed(me))return json({ok:false,error:'Site visit access required.'},auth?.status||403);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return json({ok:false,error:'Use this app to update the queue.'},403);
 const prospects=auth.prospects||[],users=auth.users||[];
 if(request.method==='GET'){
  const cases=new Map((await loadReadyCases(store)).map(c=>[c.contactId,c]));
  for(const p of prospects){if(!cases.has(p.id)){const c=legacyCase(p);if(c)cases.set(p.id,c);}}
  const items=[];for(const c of cases.values()){const p=prospects.find(p=>p.id===c.contactId);if(p&&(office(me)||own(p,me)))items.push(view(c,p,users,me));}
  items.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return json({ok:true,items,people:office(me)?users.filter(u=>['operations','teamlead'].includes(u.role)).map(u=>({id:u.id,name:u.name,role:u.role})):[]});
 }
 if(request.method!=='POST')return json({ok:false,error:'Method not allowed.'},405);
 if(Number(request.headers.get('content-length'))>6000)throw fail('Request too large.',413);
 const body=await request.json();if(!valid(body.contactId))throw fail('Choose a saved contact.');
 const p=prospects.find(p=>p.id===body.contactId);if(!p||(!office(me)&&!own(p,me))||(me.role==='teamlead'&&body.action==='request'&&!own(p,me)))throw fail('Contact not found.',404);
 const key='cases/'+p.id,old=await store.getWithMetadata(key,{type:'json'}),previous=old?.data||legacyCase(p);
 if(me.role==='teamlead'&&!own(p,me)&&!previous)throw fail('Contact not found.',404);
 const next=transitionReady(previous,body,me,p,users,now(),auth.appointments||[]);
 if(next!==previous){const result=await store.setJSON(key,next,old?.etag?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(!result?.modified)throw fail('Someone updated this lead first. Refresh the queue to see its owner.',409);}
 return json({ok:true,item:view(next,p,users,me)});
 }catch(e){return json({ok:false,error:e.status?e.message:'Could not load or save the site visit queue.'},e.status||500);}};}
