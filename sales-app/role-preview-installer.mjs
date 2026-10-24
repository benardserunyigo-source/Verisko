import {seedDemo,sampleDemoImage,demoActors} from './installer-demo.mjs?v=130';
import {installerJobView} from './installer-model.mjs?v=130';
// A read-only in-memory client uses the same installer screen and role projection.
export function previewInstallerClient(context){
 const image=sampleDemoImage(),[ops,installer]=demoActors('role-preview');
 const lead={id:'preview-teamlead',name:'DEMO Team Lead',role:'teamlead'};
 const user=context.role==='installer'?installer:context.role==='teamlead'?context.user:ops;
 const seed=seedDemo('role-preview',image);seed.job.assignees=[installer.id];seed.job.supervisorIds=[ops.id,lead.id];
 const job=installerJobView(seed.job,user);
 return {user,queue:[],jobs:[job],availableJobs:[],staff:context.role==='operations'?[installer]:[],reviewers:context.role==='operations'?[ops,lead]:[],people:[ops,installer,lead].map(({id,name})=>({id,name})),sourceJobs:[],message:'Preview only · sample installation',
  init:async()=>{},async sync(){this.onChange?.();},cachePhotos:async()=>{},local:id=>id===job.id?structuredClone(job):null,
  photo:async()=>image,command:async()=>{throw new Error('Preview only. Changes are turned off.');}};
}
