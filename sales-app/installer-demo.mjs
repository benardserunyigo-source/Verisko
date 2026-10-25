// Interactive training data stays on this browser. This transport never calls fetch.
import {createJob,applyCommand,canRead,manager,installerJobView} from './installer-model.mjs?v=145';
import {openOfflineStore,records} from './installer-client.mjs?v=145';
export const DEMO_JOB_ID='demo-installation';
export function demoActors(ownerId){return [{id:'demo-ops-'+ownerId,name:'DEMO Operations',role:'operations'},{id:'demo-installer-'+ownerId,name:'DEMO Installer',role:'installer'}];}
export function sampleDemoImage(kind='reference'){
 const canvas=document.createElement('canvas');canvas.width=900;canvas.height=540;const c=canvas.getContext('2d');
 c.fillStyle='#edf6fb';c.fillRect(0,0,900,540);c.fillStyle='#16266b';c.font='bold 30px sans-serif';c.fillText('DEMO ONLY · '+kind.toUpperCase(),40,60);
 c.font='20px sans-serif';c.fillText('Illustrated sample evidence. Not a real site photo.',40,100);
 c.strokeStyle='#16266b';c.lineWidth=8;c.beginPath();c.moveTo(100,330);c.lineTo(100,200);c.lineTo(620,200);c.lineTo(620,300);c.stroke();
 c.fillStyle='#fff';c.fillRect(50,300,180,100);c.strokeRect(50,300,180,100);c.fillRect(580,300,220,90);c.strokeRect(580,300,220,90);c.fillStyle='#16266b';c.beginPath();c.arc(690,345,24,0,Math.PI*2);c.fill();
 c.font='20px sans-serif';c.fillText('NVR',100,450);c.fillText('Continuous cable route',270,250);c.fillText('Camera / mounting',575,450);c.font='17px sans-serif';c.fillText('Training placeholder · use actual approved examples on real jobs.',40,510);
 return canvas.toDataURL('image/jpeg',.8);
}
export function seedDemo(ownerId,image,now=new Date().toISOString()){
 const [ops,installer]=demoActors(ownerId),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Kampala',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 let job=createJob({id:DEMO_JOB_ID,business:'DEMO · Kampala Shop',siteStaff:{name:'DEMO Verisko staff',phone:'DEMO · no phone call'},address:'DEMO · Ntinda, Kampala (fictional site)',scope:'Two cameras: front gate and reception. Demonstrate live image, recording, playback, coverage and remote access.',equipment:'2 × 4K bullet camera\n1 × NVR\n100 × Cat6 cable (metres)',instructions:'TRAINING ONLY. Operations assigns the job first. Installer captures evidence and submits. Operations performs the final technical review.',assignees:[installer.id],scheduledDate:date,locations:['Front gate','Reception'],remoteIncluded:true},ops,now,[ops,installer]);
 for(const item of job.materials.items)job=applyCommand(job,{action:'materialIssue',requestId:'demo-issue-'+item.id,baseVersion:job.versions.materials||0,data:{itemId:item.id,quantity:item.needed,note:'DEMO dispatch only'}},ops,now);
 job=applyCommand(job,{action:'materialConfirm',requestId:'demo-materials-confirm',baseVersion:job.versions.materials||0},ops,now);
 job=applyCommand(job,{action:'installerPay',requestId:'demo-pay-seed',baseVersion:0,data:{payments:[{installerId:installer.id,amount:350000,note:'DEMO example only. Agreed total for this installation.'}]}},ops,now);
 job=applyCommand(job,{action:'installerPayment',requestId:'demo-payment-seed',baseVersion:job.versions.installerPay,data:{installerId:installer.id,amount:100000,paidOn:date,method:'Cash',reference:'',note:'DEMO ONLY: sample part payment.'}},ops,now);
 job.assignees=[]; // Assignment is the first interactive step; no real crew accounts are created.
 job=applyCommand(job,{action:'pilot',requestId:'demo-pilot-seed',baseVersion:0,data:{cableMethods:'DEMO: continuous runs; request approval for any join. Training example only.',weather:'DEMO placeholder. Real jobs require Operations-approved weather protection.',mounting:'DEMO placeholder. Real jobs require surface-appropriate fixings and manufacturer guidance.',approvalCover:'DEMO Operations',backup:'DEMO Operations',confirmed:true}},ops,now);
 job=applyCommand(job,{action:'evidence',requestId:'demo-reference-seed',data:{id:'demo-reference',kind:'reference',hash:'demo-reference-placeholder'}},ops,now);
 return {job,photos:{'demo-reference':image}};
}
export function createDemoTransport({ownerId,load,save,image,lock=fn=>fn(),now=()=>new Date().toISOString()}){
 const actors=demoActors(ownerId);
 async function state(){let s=await load();if(!s){s=seedDemo(ownerId,image,now());await save(s);}return s;}
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 return {
  actors,
  async reset(){return lock(async()=>save(seedDemo(ownerId,image,now())));},
  async snapshot(){return state();},
  fetcher(role){const actor=actors[role==='installer'?1:0];return async(path,options={})=>lock(async()=>{try{
   const s=await state(),url=new URL(path,'https://demo.invalid');
   if(url.pathname!=='/api/installer')return response({error:'Demo requests stay in the demo.'},400);
   if(!options.body){
    if(url.searchParams.has('photo')){const id=url.searchParams.get('photo');if(!canRead(s.job,actor)||!s.job.evidence.some(e=>e.id===id))return response({error:'Not assigned.'},403);const value=s.photos[id];if(!value)return response({error:'Sample photo unavailable.'},404);const bytes=Uint8Array.from(atob(value.split(',')[1]),x=>x.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':'image/jpeg'}});}
    return response({ok:true,jobs:canRead(s.job,actor)?[installerJobView(s.job,actor)]:[],staff:manager(actor)?[actors[1]]:[],reviewers:manager(actor)?[{id:actors[0].id,name:actors[0].name,role:'operations'}]:[],people:actors.map(({id,name})=>({id,name})),sourceJobs:[]});
   }
   const body=JSON.parse(options.body),command=body.command;
   if(body.jobId!==DEMO_JOB_ID||command.action==='create')return response({error:'Use the supplied demo installation.'},400);
   if(command.action==='plan'&&command.data.assignees.some(id=>id!==actors[1].id))return response({error:'Assign the demo installer only.'},400);
   let photo;
   if(command.action==='evidence'){
    photo=command.data.image;if(!/^data:image\/jpeg;base64,/.test(photo||''))return response({error:'Choose a JPEG sample or captured image.'},400);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(photo)))).map(x=>x.toString(16).padStart(2,'0')).join('');
    command.data={...command.data,hash};delete command.data.image;
   }
   s.job=applyCommand(s.job,command,actor,now());if(photo)s.photos[command.data.id]=photo;await save(s);return response({ok:true,job:installerJobView(s.job,actor)});
  }catch(e){return response({ok:false,error:e.message},e.status||400);}});}
 };
}
export async function browserDemo(ownerId){
 const db=await openOfflineStore(),key='demo-server-payments/'+ownerId;
 return createDemoTransport({ownerId,image:sampleDemoImage(),load:()=>records(db,key),save:value=>records(db,key,value),lock:fn=>navigator.locks.request(key,fn)});
}
