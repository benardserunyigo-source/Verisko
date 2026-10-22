import {seedDemo,sampleDemoImage,demoActors} from './installer-demo.mjs?v=110';
import {installerJobView} from './installer-model.mjs?v=110';
// A read-only in-memory client uses the same installer screen and role projection.
export function previewInstallerClient(context){
 const image=sampleDemoImage(),[ops,installer]=demoActors('role-preview');
 const supervisor={id:'preview-supervisor',name:'DEMO Supervisor',role:'supervisor'};
 const user=context.role==='installer'?installer:context.role==='supervisor'?supervisor:context.role==='teamlead'?context.user:ops;
 const seed=seedDemo('role-preview',image);seed.job.assignees=[installer.id];seed.job.supervisorIds=[supervisor.id,user.id];
 const job=installerJobView(seed.job,user);
 return {user,queue:[],jobs:[job],availableJobs:[],staff:context.role==='operations'?[installer]:[],reviewers:context.role==='operations'?[ops,{...context.user,role:'teamlead',id:'preview-teamlead',name:'DEMO Team Lead'},supervisor]:[],people:[ops,installer,supervisor,...(context.role==='teamlead'?[context.user]:[])].map(({id,name})=>({id,name})),sourceJobs:[],message:'Preview only · sample installation',
  init:async()=>{},async sync(){this.onChange?.();},cachePhotos:async()=>{},local:id=>id===job.id?structuredClone(job):null,
  photo:async()=>image,command:async()=>{throw new Error('Preview only. Changes are turned off.');}};
}
