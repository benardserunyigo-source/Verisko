import {applyCommand} from './installer-model.mjs?v=129';
export const requestId=()=>crypto.randomUUID();
// One durable store. Every key is partitioned by the signed-in account.
export function openOfflineStore(factory=indexedDB){
 return new Promise((resolve,reject)=>{const r=factory.open('verisko-installer-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);});
}
export async function records(db,key,value){
 return new Promise((resolve,reject)=>{const tx=db.transaction('records',value===undefined?'readonly':'readwrite'),store=tx.objectStore('records');let out;const r=value===undefined?store.get(key):store.put(value,key);r.onsuccess=()=>{out=r.result;};tx.oncomplete=()=>resolve(out);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Offline save failed.'));});
}
export class InstallerClient {
 constructor({user,token,onChange=()=>{},fetcher=(...args)=>fetch(...args),dbFactory=indexedDB}){Object.assign(this,{user,token,onChange,fetcher,dbFactory});this.jobs=[];this.availableJobs=[];this.queue=[];this.staff=[];this.reviewers=[];this.people=[];this.sourceJobs=[];this.busy=false;this.message='';}
 async init(){this.db=await openOfflineStore(this.dbFactory);this.key='account/'+this.user.id;const saved=await records(this.db,this.key)||{};Object.assign(this,{jobs:saved.jobs||[],availableJobs:saved.availableJobs||[],queue:saved.queue||[],reviewers:saved.reviewers||[],staff:saved.staff||[],people:saved.people||[],sourceJobs:saved.sourceJobs||[]});}
 async persist(){await records(this.db,this.key,{jobs:this.jobs,availableJobs:this.availableJobs,queue:this.queue,reviewers:this.reviewers,staff:this.staff,people:this.people,sourceJobs:this.sourceJobs});}
 async api(body,query=''){
  const token=await this.token(),r=await this.fetcher('/api/installer'+query,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await r.json();if(!r.ok){const e=new Error(result.error||'Sync failed.');e.status=r.status;throw e;}return result;
 }
 local(jobId){const original=this.jobs.find(j=>j.id===jobId);if(!original)return null;let out=original;for(const item of this.queue.filter(q=>q.jobId===jobId)){try{const command=item.command.action==='evidence'?{...item.command,data:{...item.command.data,hash:'pending'}}:item.command;out=applyCommand(out,command,this.user,item.at);}catch{/* conflict stays queued; never invent approval */}}return out;}
 async reloadSaved(){const saved=await records(this.db,this.key);if(saved)Object.assign(this,{jobs:saved.jobs,availableJobs:saved.availableJobs||[],queue:saved.queue,reviewers:saved.reviewers||[],staff:saved.staff,people:saved.people,sourceJobs:saved.sourceJobs});}
 async lock(fn){
  if(!navigator.locks)throw new Error('Use a current Chrome browser or the Android app for reliable offline saving.');
  return navigator.locks.request(this.key,{ifAvailable:true},async lock=>{if(!lock)throw new Error('Another tab is saving installation work. Use one tab and try again.');await this.reloadSaved();return fn();});
 }
 async save(jobId,command){await this.lock(()=>this.saveLocked(jobId,command));return this.sync();}
 async online(jobId,command){return this.lock(()=>this.onlineLocked(jobId,command));}
 async sync(){if(this.busy)return;try{return await this.lock(()=>this.syncLocked());}catch(e){this.message=e.message;this.onChange();}}
 async saveLocked(jobId,command){
  if(this.busy)throw new Error('Please wait while we send your work.');
  const at=new Date().toISOString();command={...command,requestId:requestId()};
  const check=command.action==='evidence'?{...command,data:{...command.data,hash:'pending'}}:command;
  applyCommand(this.local(jobId),check,this.user,at);
  const item={jobId,command,at};this.queue.push(item);
  try{await this.persist();}catch(e){this.queue.pop();throw new Error('Could not save on this phone. Free storage before continuing.');}
  this.message='Saved on this phone · waiting to send';this.onChange();return;
 }
 async onlineLocked(jobId,command){
  if(this.queue.length)throw new Error('Send all saved work and photos first.');
  if(this.busy)throw new Error('Please wait while we send your work.');
  const result=await this.api({jobId,command:{...command,requestId:requestId()}});
  const index=this.jobs.findIndex(j=>j.id===result.job.id);if(index<0)this.jobs.push(result.job);else this.jobs[index]=result.job;
  this.availableJobs=this.availableJobs.filter(j=>j.id!==result.job.id);
  await this.persist();this.message='All work sent';this.onChange();return result.job;
 }
 async syncLocked(){
  if(this.busy)return;this.busy=true;this.message='Sending saved work…';this.onChange();
  try{
   while(this.queue.length){
    const item=this.queue[0];const result=await this.api({jobId:item.jobId,command:item.command});
    this.jobs=this.jobs.map(j=>j.id===result.job.id?result.job:j);if(item.command.action==='evidence')await records(this.db,this.key+'/photo/'+item.jobId+'/'+item.command.data.id,item.command.data.image);this.queue.shift();await this.persist();
   }
   const result=await this.api();this.jobs=result.jobs;this.availableJobs=result.availableJobs||[];this.staff=result.staff;this.reviewers=result.reviewers||[];this.people=result.people;this.sourceJobs=result.sourceJobs;await this.persist();this.message='All work sent · '+new Date().toLocaleTimeString();
  }catch(e){this.message=(e.status===409?'Sync conflict: ':e.status===403||e.status===404?'Access changed: ':'Not synchronized: ')+e.message;
   if(e.status===403){this.jobs=[];this.availableJobs=[];this.staff=[];this.reviewers=[];this.people=[];this.sourceJobs=[];await this.persist();}
   // On a conflict, fetch the latest assigned records but retain the exact queued command.
   if(e.status===409||e.status===403||e.status===404)try{const fresh=await this.api();this.jobs=fresh.jobs;this.availableJobs=fresh.availableJobs||[];await this.persist();}catch{}
  }finally{this.busy=false;this.onChange();}
 }
 async discardFirst(){if(this.busy)return;await this.lock(async()=>{this.queue.shift();await this.persist();});await this.sync();}
 async photo(jobId,id){
  if(!this.jobs.some(j=>j.id===jobId))throw new Error('This job is no longer available to this account.');
  const queued=this.queue.find(q=>q.jobId===jobId&&q.command.action==='evidence'&&q.command.data.id===id);if(queued)return queued.command.data.image;
  const key=this.key+'/photo/'+jobId+'/'+id;const saved=await records(this.db,key);if(saved)return saved;
  const token=await this.token(),r=await this.fetcher('/api/installer?jobId='+encodeURIComponent(jobId)+'&photo='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw new Error('Photo unavailable or access changed.');
  const blob=await r.blob();const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});await records(this.db,key,data);return data;
 }
 async cachePhotos(){for(const j of this.jobs)for(const e of j.evidence)try{await this.photo(j.id,e.id);}catch{} }
}
export async function cameraPhoto(file){
 if(!file||!file.type.startsWith('image/'))throw new Error('Choose an image.');
 const image=await createImageBitmap(file,{imageOrientation:'from-image'});const scale=Math.min(1,1400/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();
 const data=canvas.toDataURL('image/jpeg',.78);if(data.length>1500000)throw new Error('Photo too large. Retake it closer or choose a smaller image.');return data;
}

// One GPS reading per tap. Never start a watch or a location timer.
export function captureWorkLocation(geo=navigator.geolocation){
 return new Promise((resolve,reject)=>{if(!geo)return reject(new Error('Location is not available. Use the Android app or Chrome with location turned on.'));geo.getCurrentPosition(p=>{if(p.coords.accuracy>1000)return reject(new Error('GPS signal is weak. Move outside and try again.'));resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy});},()=>reject(new Error('Allow location for this app, turn on GPS, and try again.')),{enableHighAccuracy:true,maximumAge:0,timeout:20000});});
}
