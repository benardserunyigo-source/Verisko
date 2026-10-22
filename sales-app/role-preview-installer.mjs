import {seedDemo,sampleDemoImage,demoActors} from './installer-demo.mjs?v=109';
import {installerJobView} from './installer-model.mjs?v=109';
// A read-only in-memory client uses the same installer screen and role projection.
export function previewInstallerClient(context){
 const image=sampleDemoImage(),[ops,installer]=demoActors('role-preview');
 const supervisor={id:'preview-supervisor',name:'DEMO Supervisor',role:'supervisor'};
 const user=context.role==='installer'?installer:context.role==='supervisor'?supervisor:ops;
 const seed=seedDemo('role-preview',image);seed.job.assignees=[installer.id];seed.job.supervisorIds=[supervisor.id];
 const job=installerJobView(seed.job,user);
 return {user,queue:[],jobs:[job],staff:context.role==='operations'?[installer]:[],reviewers:[],people:[ops,installer,supervisor].map(({id,name})=>({id,name})),sourceJobs:[],message:'Preview only · sample installation',
  init:async()=>{},async sync(){this.onChange?.();},cachePhotos:async()=>{},local:id=>id===job.id?structuredClone(job):null,
  photo:async()=>image,command:async()=>{throw new Error('Preview only. Changes are turned off.');}};
}
