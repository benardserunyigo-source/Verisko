import {createHash} from 'node:crypto';
import {allowed,manager,canSuperviseSite,canRead,createJob,applyCommand,installerJobView} from '../../../installer-model.mjs';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers});
const valid=v=>typeof v==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(v);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function imageData(value){
 const m=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(value||'');if(!m||value.length>1500000)throw fail('Use a JPEG or PNG photo under 1 MB.');
 const bytes=Buffer.from(m[2],'base64');
 if(bytes.length<8||(m[1]==='jpeg'?bytes[0]!==255||bytes[1]!==216:bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'))throw fail('Invalid photo bytes.');
 return {type:'image/'+m[1],base64:m[2],hash:createHash('sha256').update(bytes).digest('hex')};
}
export function createInstallerHandler({store,authorize,now=()=>new Date().toISOString()}){
 return async request=>{try{
  const auth=await authorize(request),me=auth.me,ops=['admin','operations'].includes(me?.role);if(!me||!allowed(me))return json({ok:false,error:'Installation access required.'},auth.status||403);
  const url=new URL(request.url),id=url.searchParams.get('jobId');
  if(request.method==='GET'){
   if(id){
    if(!valid(id))throw fail('Invalid job ID.');const j=await store.get('jobs/'+id,{type:'json'});if(!j||!canRead(j,me))throw fail('Job not found or not assigned.',404);
    const photo=url.searchParams.get('photo');if(photo){if(!valid(photo)||!j.evidence.some(e=>e.id===photo))throw fail('Evidence not found.',404);const p=await store.get('photos/'+id+'/'+photo,{type:'json'});if(!p)throw fail('Photo unavailable.',404);return new Response(Buffer.from(p.base64,'base64'),{headers:{'Content-Type':p.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
    return json({ok:true,job:installerJobView(j,me)});
   }
   const jobs=[],availableJobs=[];for await(const page of store.list({prefix:'jobs/',paginate:true})){for(const b of page.blobs){const j=await store.get(b.key,{type:'json'});if(j&&canRead(j,me))jobs.push(j);else if(j&&me.role==='teamlead'&&j.status!=='Completed')availableJobs.push({id:j.id,business:j.business,scheduledDate:j.scheduledDate,status:j.status,planVersion:j.versions?.plan||0});}}
   if(url.searchParams.get('summary')==='1'){
    if(!manager(me))throw fail('Supervisor access required.',403);
    return json({ok:true,pendingIds:jobs.flatMap(j=>j.exceptions.filter(e=>e.status==='pending').map(e=>e.id)),corrections:jobs.reduce((n,j)=>n+j.exceptions.filter(e=>e.status==='correction').length+j.cameras.reduce((n,c)=>n+Object.values(c.corrections||{}).filter(v=>v.status==='open').length,0),0),submitted:jobs.filter(j=>j.status==='Submitted').length});
   }
   const staff=(auth.users||[]).filter(u=>u.role==='installer').map(u=>({id:u.id,name:u.name}));
   return json({ok:true,availableJobs,jobs:jobs.map(j=>installerJobView(j,me)),staff:ops?staff:[],reviewers:ops?(auth.users||[]).filter(canSuperviseSite).map(u=>({id:u.id,name:u.name,role:u.role})):[],people:(auth.users||[]).filter(u=>ops||u.id===me.id||jobs.some(j=>j.assignees.includes(u.id)||(j.supervisorIds||[]).includes(u.id)||j.history.some(h=>h.by===u.id))).map(u=>({id:u.id,name:u.name})),sourceJobs:ops?(auth.sourceJobs||[]):[]});
  }
  if(request.method!=='POST')return json({ok:false,error:'Method not allowed.'},405);
  if(Number(request.headers.get('content-length'))>1800000)throw fail('Request too large.',413);
  const body=await request.json();if(!valid(body.jobId))throw fail('Invalid job ID.');
  const key='jobs/'+body.jobId,cmd=body.command||{};
  for(let attempt=0;attempt<4;attempt++){
   const old=await store.getWithMetadata(key,{type:'json'});let j;
   if(cmd.action==='create'){
    if(!ops)throw fail('Only Operations can create an installation.',403);
    if(old){if(old.data.requests.includes(cmd.requestId))return json({ok:true,job:installerJobView(old.data,me)});throw fail('This job already has an installer record. Open it instead.',409);}
    if(!/^[a-zA-Z0-9-]{8,100}$/.test(cmd.requestId||''))throw fail('Request ID required.');
    if(cmd.data?.sourceId&&body.jobId!=='source-'+cmd.data.sourceId)throw fail('Use the existing job installation record.');
    if(cmd.data?.sourceId&&!(auth.sourceJobs||[]).some(x=>x.id===cmd.data.sourceId))throw fail('Source job not found.');
    j=createJob({...cmd.data,id:body.jobId},me,now(),auth.users);j.requests.push(cmd.requestId);j.history.push({id:cmd.requestId,action:'create',by:me.id,name:me.name,at:now()});
   }else{
    if(!old||!canRead(old.data,me)&&!(cmd.action==='superviseSelf'&&['admin','operations','teamlead'].includes(me.role)))throw fail('Job not found or no longer assigned.',404);
    if(cmd.action==='plan'&&cmd.data?.supervisorIds!==undefined&&(!Array.isArray(cmd.data.supervisorIds)||cmd.data.supervisorIds.some(id=>!auth.users.some(u=>u.id===id&&canSuperviseSite(u)))))throw fail('Choose Operations, a Team Lead, Admin or a Supervisor for this site.');
    if(cmd.action==='plan'&&(!Array.isArray(cmd.data?.assignees)||cmd.data.assignees.some(id=>!auth.users.some(u=>u.id===id&&u.role==='installer'))))throw fail('Assign Installer accounts only.');
    if(cmd.action==='evidence'){
     if(!valid(cmd.data?.id))throw fail('Invalid evidence ID.');const image=imageData(cmd.data.image);
     const imageKey='photos/'+body.jobId+'/'+cmd.data.id;
     // Authorize and validate the intended attachment before storing bytes.
     const clean={...cmd,data:{id:cmd.data.id,kind:cmd.data.kind,cameraId:cmd.cameraId||'',caption:cmd.data.caption,hash:image.hash}};
     j=applyCommand(old.data,clean,me,now());
     const put=await store.setJSON(imageKey,image,{onlyIfNew:true});
     if(!put.modified){const existing=await store.get(imageKey,{type:'json'});if(existing?.hash!==image.hash)throw fail('Evidence ID collision.',409);}
    }else j=applyCommand(old.data,cmd,me,now());
   }
   const write=await store.setJSON(key,j,old?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(write.modified)return json({ok:true,job:installerJobView(j,me)});
  }
  throw fail('Someone else updated this job. Sync and try again.',409);
 }catch(e){return json({ok:false,error:e.message||'Installation request failed.'},e.status||500);}};
}
