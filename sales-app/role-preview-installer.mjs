import {seedDemo,sampleDemoImage,demoActors} from './installer-demo.mjs?v=108';
import {installerJobView} from './installer-model.mjs?v=108';
// A read-only in-memory client uses the same installer screen and role projection.
export function previewInstallerClient(context){
 const image=sampleDemoImage(),[ops,installer]=demoActors('role-preview');
 const user=context.role==='installer'?installer:ops;
 const seed=seedDemo('role-preview',image);seed.job.assignees=[installer.id];
 const job=installerJobView(seed.job,user);
 return {user,queue:[],jobs:[job],staff:context.role==='operations'?[installer]:[],reviewers:[],people:[ops,installer].map(({id,name})=>({id,name})),sourceJobs:[],message:'Preview only · sample installation',
  init:async()=>{},async sync(){this.onChange?.();},cachePhotos:async()=>{},local:id=>id===job.id?structuredClone(job):null,
  photo:async()=>image,command:async()=>{throw new Error('Preview only. Changes are turned off.');}};
}
