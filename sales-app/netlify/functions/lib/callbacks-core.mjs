import {callbackProofKey,callbackCashStatus} from './callback-cash.mjs';
import {imageData} from './installer-core.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(m,status=400)=>{throw Object.assign(new Error(m),{status});};
const valid=v=>typeof v==='string'&&/^[A-Za-z0-9-]{1,100}$/.test(v);
const text=(v,n=1500)=>String(v||'').trim().slice(0,n);
const office=u=>['admin','operations'].includes(u?.role);
const active=u=>u&&['admin','operations','teamlead','sales','installer'].includes(u.role)&&u.active!==false&&!u.disabled;
const read=(c,u)=>office(u)||c.assigneeId===u.id;
export async function callbackRecords(store){const a=[];for await(const page of store.list({prefix:'cases/',paginate:true}))for(const b of page.blobs){const c=await store.get(b.key,{type:'json'});if(c)a.push(c);}return a;}
export function createCallbacksHandler({store,authorize,loadJobs,now=()=>new Date().toISOString()}){
 return async req=>{try{
 const auth=await authorize(req),me=auth.me;if(!active(me))return json({ok:false,error:'Sign in to open callbacks.'},auth.status||403);
 const url=new URL(req.url);const id=url.searchParams.get('id');
 if(req.method==='GET'){
  if(url.searchParams.has('cashProof')){if(!office(me))fail('Cash receipt access required.',403);const proof=url.searchParams.get('cashProof');const cases=await callbackRecords(store);for(const c of cases){const e=c.expenses.find(e=>callbackProofKey(c,e)===proof);if(e){const p=await store.get('photos/'+c.id+'/'+e.proofId,{type:'json'});if(!p)fail('Receipt unavailable.',404);return json({ok:true,image:'data:'+p.type+';base64,'+p.base64});}}fail('Receipt not found.',404);}
  if(id){if(!valid(id))fail('Invalid callback.');const c=await store.get('cases/'+id,{type:'json'});if(!c||!read(c,me))fail('Callback not found or not assigned.',404);const photo=url.searchParams.get('photo');if(photo){if(!valid(photo)||!c.photos.some(p=>p.id===photo))fail('Photo not found.',404);const p=await store.get('photos/'+id+'/'+photo,{type:'json'});if(!p)fail('Photo unavailable.',404);return json({ok:true,image:'data:'+p.type+';base64,'+p.base64});}return json({ok:true,item:callbackCashStatus(c,auth.transactions)});}
  const items=(await callbackRecords(store)).filter(c=>read(c,me)).map(c=>callbackCashStatus(c,auth.transactions));const jobs=office(me)?(await loadJobs()).filter(j=>j.status==='Completed').map(j=>({id:j.id,business:j.business,address:j.address||'',sourceId:j.sourceId||'',contactId:j.readyContactId||''})):[];
  return json({ok:true,items,jobs,people:office(me)?auth.users.filter(active).map(u=>({id:u.id,name:u.name,role:u.role})):[]});
 }
 if(req.method!=='POST')return json({ok:false,error:'Method not allowed.'},405);
 if(Number(req.headers.get('content-length'))>1800000)fail('Photo too large.',413);
 const b=await req.json();if(!valid(b.id)||!valid(b.requestId)||b.requestId.length<8)fail('A callback and request number are required.');
 const key='cases/'+b.id;for(let attempt=0;attempt<4;attempt++){
 const old=await store.getWithMetadata(key,{type:'json'});const c=old?structuredClone(old.data):null;
 if(c&&!read(c,me))fail('Callback not found or not assigned.',404);
 if(c?.requests.some(r=>r.id===b.requestId&&r.by===me.id))return json({ok:true,item:c});
 if(c?.requests.some(r=>r.id===b.requestId))fail('Request already used.',409);
 let next=c;const d=b.data||{},at=now();
 if(b.action==='create'){
  if(!office(me))fail('Only Operations can open a callback.',403);if(c)fail('This callback already exists.',409);
  const job=(await loadJobs()).find(j=>j.id===d.jobId&&j.status==='Completed');if(!job)fail('Choose a completed installation.');
  const person=auth.users.find(u=>u.id===d.assigneeId&&active(u));if(!person)fail('Choose an active staff member.');if(!text(d.problem))fail('Say what needs fixing.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.due||''))fail('Choose a visit date.');
  next={id:b.id,jobId:job.id,sourceId:job.sourceId||'',contactId:job.readyContactId||'',business:job.business,address:job.address||'',siteContact:job.siteStaff?.name||'',sitePhone:job.siteStaff?.phone||'',problem:text(d.problem),type:text(d.type,80)||'Other',due:d.due,assigneeId:person.id,assigneeName:person.name,status:'Assigned',version:0,createdAt:at,createdBy:me.id,photos:[],expenses:[],history:[],requests:[]};
 }else{
  if(!c)fail('Callback not found.',404);if(b.version!==c.version)fail('Someone updated this callback. Refresh and try again.',409);
  if(c.status==='Closed'&&b.action!=='reopen')fail('This callback is closed. Operations can reopen it.',409);
  const worker=c.assigneeId===me.id;
  if(['photo','expense','voidExpense','report'].includes(b.action)&&!['Assigned','In progress','Needs fix'].includes(c.status))fail('Operations must return this callback before more work is added.',409);
  if(b.action==='assign'){
   if(!office(me))fail('Only Operations can assign callbacks.',403);const person=auth.users.find(u=>u.id===d.assigneeId&&active(u));if(!person)fail('Choose an active staff member.');if(!/^\d{4}-\d{2}-\d{2}$/.test(d.due||''))fail('Choose a visit date.');next.assigneeId=person.id;next.assigneeName=person.name;next.due=d.due;next.status='Assigned';next.report=null;next.proofAfter=at;next.proofAfterVersion=c.version+1;
  }else if(b.action==='start'){
   if(!worker)fail('Only the assigned person can start this callback.',403);if(!['Assigned','Needs fix'].includes(c.status))fail('This callback has already started.',409);next.status='In progress';
  }else if(b.action==='photo'){
   if(!worker&&!office(me))fail('Only the assigned person can add proof.',403);if(!['before','fixed','receipt'].includes(d.kind)||!valid(d.id))fail('Choose the photo type.');if(c.photos.some(p=>p.id===d.id))fail('Photo already saved.',409);
   const image=imageData(d.image);const pk='photos/'+b.id+'/'+d.id;const put=await store.setJSON(pk,image,{onlyIfNew:true});if(!put.modified){const existing=await store.get(pk,{type:'json'});if(existing?.hash!==image.hash)fail('Photo number already used.',409);}next.photos.push({id:d.id,kind:d.kind,by:me.id,at,version:c.version+1,hash:image.hash,caption:text(d.caption,300)});
  }else if(b.action==='expense'){
   if(!worker&&!office(me))fail('Only the assigned person can record a cost.',403);if(!Number.isSafeInteger(d.amount)||d.amount<=0||d.amount>100000000)fail('Enter a whole UGX cost above zero.');if(!text(d.note,300))fail('Say what the cost was for.');if(!c.photos.some(p=>p.id===d.proofId&&p.kind==='receipt'))fail('Add a receipt photo first.');const date=d.date||at.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))fail('Choose the cost date.');next.expenses.push({id:b.requestId,date,amount:d.amount,note:text(d.note,300),proofId:d.proofId,by:me.id,at});
  }else if(b.action==='voidExpense'){
   if(!office(me))fail('Only Operations can correct a cost.',403);const e=next.expenses.find(e=>e.id===d.expenseId);if(!e||e.voided)fail('Cost not found.');if(!text(d.reason))fail('Give a reason.');e.voided={by:me.id,at,reason:text(d.reason)};
  }else if(b.action==='report'){
   if(!worker)fail('Only the assigned person can send the fix.',403);if(!text(d.fix))fail('Say what you fixed.');if(!d.tested||!d.costsChecked)fail('Check the system and the costs first.');const proof=c.photos.find(p=>p.id===d.proofId&&p.kind==='fixed'&&p.by===me.id&&(!c.proofAfterVersion||p.version>c.proofAfterVersion));if(!proof)fail('Add a finished-work photo for this fix.');if(c.report?.proofId===proof.id&&c.status==='Needs fix')fail('Add a new photo after fixing the problem.');next.report={fix:text(d.fix),proofId:proof.id,tested:true,costsChecked:true,by:me.id,at};next.status='Waiting for review';
  }else if(['close','return','reopen'].includes(b.action)){
   if(!office(me))fail('Only Operations can review a callback.',403);
   if(b.action==='reopen'){if(c.status!=='Closed')fail('This callback is already open.',409);if(!text(d.reason))fail('Say why it is being reopened.');next.status='Needs fix';delete next.closedAt;}
   else{if(c.status!=='Waiting for review')fail('Wait for the assigned person to send proof.',409);if(b.action==='close'){if(d.checked!==true)fail('Confirm you checked the fix and proof.');next.status='Closed';next.closedAt=at;next.closedBy=me.id;}else{if(!text(d.reason))fail('Say what still needs fixing.');next.status='Needs fix';}}next.reviewNote=text(d.reason);if(b.action!=='close'){next.proofAfter=at;next.proofAfterVersion=c.version+1;}
  }else fail('Choose a valid callback action.');
 }
 next.version++;next.updatedAt=at;next.requests.push({id:b.requestId,by:me.id});next.history.push({id:b.requestId,action:b.action,by:me.id,name:me.name,at,note:text(d.reason||d.fix||d.note,1500)});
 const write=await store.setJSON(key,next,old?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(write.modified)return json({ok:true,item:next});
 }fail('Someone else is saving. Refresh and try again.',409);
 }catch(e){return json({ok:false,error:e.message||'Could not save the callback.'},e.status||500);}};
}
