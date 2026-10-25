import {createHash} from 'node:crypto';
import {draftCostBudget,draftCostEstimate,draftPaymentOptions,DRAFT_CAMERA_COUNTS} from '../../../draft-payment-options.mjs';
export const DRAFT_VERSION='four-camera-options-2026-10-24-v1';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const office=me=>['admin','operations'].includes(me?.role);
const identity=j=>hash([j.prospectId||j.clientId||null,j.prospectId||j.clientId?null:j.business||'']);
export const draftJobCameras=j=>Number(j?.cameraCount??j?.quoteSnapshot?.cameras);
const versionFor=n=>n===4?DRAFT_VERSION:n+'-camera-options-2026-10-24-scaled-v1';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createDraftCostsHandler({store,loadWorkspace,authorize,baseline,now=()=>new Date().toISOString()}){return async request=>{try{
 const auth=await authorize(request);
 if(!office(auth?.me))throw fail('Operations access is needed.',auth?.me?403:auth?.status||401);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)throw fail('Open this page in the app.',403);
 if(!['GET','POST'].includes(request.method))throw fail('Method not allowed.',405);
 let body={};if(request.method==='POST'){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw fail('Use the draft cost form.',415);
  const text=await request.text();if(text.length>4096)throw fail('Request too large.',413);
  try{body=JSON.parse(text);}catch{throw fail('Invalid request.');}
 }
 const jobId=request.method==='POST'?body?.jobId:new URL(request.url).searchParams.get('jobId');
 if(!validId(jobId))throw fail('Choose a saved job.',400);
 const workspace=await loadWorkspace(),job=(workspace.jobs||[]).find(j=>j.id===jobId);
 if(!job)throw fail('Job not found.',404);
 const cameras=draftJobCameras(job);
 if(!DRAFT_CAMERA_COUNTS.includes(cameras))throw fail('Choose a 4, 6, 8 or 12-camera job.',409);
 const old=await store.getWithMetadata('jobs/'+jobId,{type:'json'}),saved=old?.data;
 if(saved&&(saved.clientKey!==identity(job)||saved.optionsVersion!==versionFor(cameras)||(saved.cameras??4)!==cameras))throw fail('This job or draft comparison changed. Ask Admin to review it.',409);
 const budget=draftCostBudget('operations',saved?.budget||baseline,{cameras});
 if(!budget)throw fail('The private cost budget is unavailable. Reconnect and try again.',503);
 const basisHash=hash(budget),item=saved?{jobId,cameras,version:saved.version,costs:saved.costs,budget,options:saved.options,results:saved.results,savedAt:saved.savedAt,savedBy:saved.savedBy,optionsVersion:saved.optionsVersion}:null;
 if(request.method==='GET')return json({ok:true,item,cameras,budget,basisHash});
 if(!Number.isSafeInteger(body.baseVersion)||body.baseVersion<0||!validId(body.requestId))throw fail('Reload the saved draft before saving.');
 const costs={};for(const key of ['direct','care','business']){const n=body.costs?.[key];if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||(key==='direct'&&n===0))throw fail('Enter whole UGX amounts. Materials, delivery and crew must be above 0.');costs[key]=n;}
 const requestHash=hash([jobId,body.baseVersion,body.basisHash,costs]);
 if(saved?.requestId===body.requestId){if(saved.requestHash!==requestHash)throw fail('This save request changed. Reload the draft.',409);return json({ok:true,item,cameras,budget,basisHash});}
 if(body.baseVersion!==(saved?.version||0)||body.basisHash!==basisHash)throw fail('Someone changed this draft or its starting budget. Reload the draft before saving.',409);
 const nextBudget={policy:{...budget.policy,callbacks:costs.care,acquisition:0,overhead:costs.business},packages:{[cameras]:{direct:costs.direct}}};
 const estimate=draftCostEstimate('operations',nextBudget,{cameras});if(!estimate)throw fail('Costs are too large to calculate.');
 const next={jobId,cameras,clientKey:identity(job),version:(saved?.version||0)+1,costs,budget:nextBudget,options:draftPaymentOptions('operations',{cameras}),results:estimate.rows,optionsVersion:versionFor(cameras),savedAt:now(),savedBy:{id:auth.me.id,name:auth.me.name||'Operations'},requestId:body.requestId,requestHash};
 const written=await store.setJSON('jobs/'+jobId,next,saved?{onlyIfMatch:old.etag}:{onlyIfNew:true});
 if(!written.modified)throw fail('Someone saved another change. Reload the draft before saving.',409);
 const {clientKey,requestHash:ignoreHash,requestId:ignoreId,...out}=next;
 return json({ok:true,item:out,cameras,budget:nextBudget,basisHash:hash(nextBudget)});
 }catch(e){return json({ok:false,error:e.status?e.message:'Could not save draft costs. Try again.'},e.status||500);}};}
