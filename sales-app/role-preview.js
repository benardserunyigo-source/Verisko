/* Fictional screen previews. No real session, network API or device storage is used. */
(function(root){
 'use strict';
 var roles={sales:'Sales',teamlead:'Team Lead',operations:'Operations',installer:'Installer'};
 function create(role,now){
  if(!roles[role])throw new Error('Choose a team role from the list.');
  var at=now||new Date().toISOString(),day=at.slice(0,10);
  var users=['admin','operations','sales','teamlead','installer'].map(function(r){return {id:'preview-'+r,name:'DEMO '+(roles[r]||'Admin'),email:r+'@preview.invalid',role:r,created:at};});
  var me=users.find(function(u){return u.role===role;});
  var prospects=[{id:'preview-shop',business:'DEMO · Kampala Shop',contact:'Sample shop owner',phone:'DEMO — no calls',location:'DEMO · Ntinda, Kampala',vertical:'Retail shop',source:'Cold visit',stage:'Qualified',createdBy:'DEMO Sales',createdByEmail:'sales@preview.invalid',created:day,reviewStatus:'approved',qualStatus:'approved',followUp:day,nextAction:'Confirm the visit',followUps:[{at:at,by:'DEMO Sales',byEmail:'sales@preview.invalid',note:'DEMO: Client asked about four cameras.'}]},{id:'preview-school',business:'DEMO · School enquiry',contact:'Sample school contact',phone:'DEMO — no calls',location:'DEMO · Kampala',vertical:'School',stage:'New prospect',leadOnly:true,createdBy:'DEMO Operations',createdByEmail:'operations@preview.invalid',created:day,followUp:day,nextAction:'Call back',followUps:[]}];
  var leadContact=Object.assign({},prospects[1],{id:'preview-teamlead-contact',business:'DEMO · Team Lead follow-up',createdBy:me.name,createdByEmail:me.email});
  var data={users:role==='operations'?users.map(function(u){return ['sales','installer','operations'].includes(u.role)?u:{id:u.id,name:u.name,role:u.role};}):role==='teamlead'?users.filter(function(u){return ['admin','operations','sales','teamlead'].includes(u.role);}).map(function(u){return u.id===me.id?u:{id:u.id,name:u.name,role:u.role};}):[{id:users[0].id,name:users[0].name,role:'admin'},me],prospects:role==='sales'?[prospects[0]]:role==='teamlead'?[prospects[0],leadContact]:role==='operations'?prospects:[],appointments:['installer'].includes(role)?[]:[{id:'preview-visit',prospectId:'preview-shop',date:day,time:'10:00',status:'Confirmed',assignedTo:'preview-operations',createdByEmail:'sales@preview.invalid'}],jobs:[],quotes:[],installations:[],transactions:[],technicians:[],training:{},config:{commissionRule:4,payScheme:4,schemeStart:'2026-10-12',commissionPerSale:100000,perVisit:5000,floatAmount:20000,floatMinBookings:2,floatGraceDays:14,floatStart:'2026-10-12'}};
  if(role==='operations')data.transactions=[{id:'preview-cash-in',direction:'in',amount:500000,date:day,category:'Float top-up',method:'Cash',status:'approved',note:'DEMO float only',createdBy:'DEMO Admin',createdByEmail:'admin@preview.invalid',createdAt:at},{id:'preview-cash-out',direction:'out',amount:50000,date:day,category:'Transport',method:'Cash',status:'pending',note:'DEMO travel cost only',createdBy:'DEMO Operations',createdByEmail:'operations@preview.invalid',createdAt:at}];
  var memory=new Map([['verisko_sales_app_v1',JSON.stringify(data)],['verisko_sales_settings_v1',JSON.stringify({user:me,auth:{access_token:'preview-no-real-session',email:me.email},onboarded:true})]]);
  var storage={getItem:function(k){return memory.get(k)||null;},setItem:function(k,v){memory.set(k,String(v));},removeItem:function(k){memory.delete(k);},clear:function(){memory.clear();}};
  function reply(b,status){return new Response(JSON.stringify(b),{status:status||200,headers:{'Content-Type':'application/json'}});}
  return {role:role,label:roles[role],user:me,users:users,data:data,storage:storage,
   fetch:async function(input,options){
    var url=new URL(typeof input==='string'?input:input.url,'https://preview.invalid'),method=(options&&options.method||input&&input.method||'GET').toUpperCase();
    if(method!=='GET')return reply({ok:false,error:'Preview only. Changes are turned off.'},403);
    if(url.pathname==='/api/data')return reply({ok:true,data:JSON.parse(JSON.stringify(data)),catalogue:root.VeriskoPriceCatalogue&&root.VeriskoPriceCatalogue.catalogue});
    if(url.pathname==='/api/installer'&&url.searchParams.has('summary'))return reply({pendingIds:[],corrections:0,submitted:0});
    if(url.pathname==='/api/applications')return reply({ok:true,applications:[],cursor:null});
    return reply({ok:false,error:'This action is not available in the preview.'},403);
   }};
 }
 var api={roles:roles,create:create,canLaunch:function(user,preview){return user&&user.role==='admin'&&!preview;}};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.VeriskoRolePreview=api;
 if(!root.document)return;
 var role=new URLSearchParams(root.location.search).get('rolePreview');if(!roles[role])return;
 var context=create(role);
 // Overrides belong only to this separate preview frame. Never read the real stores.
 Object.defineProperty(root,'localStorage',{value:context.storage,configurable:true});
 Object.defineProperty(root,'sessionStorage',{value:context.storage,configurable:true});
 Object.defineProperty(root,'indexedDB',{get:function(){throw new Error('Preview does not use device storage.');},configurable:true});
 root.fetch=context.fetch;api.active=context;
 var allowed='[data-section],[data-nav-view],[data-view],[data-more],[data-xc-toggle],[data-new],[data-edit-lead],#primaryAction,#iwCancel,[data-installation-work],[data-preview-info],[data-iw-open],[data-iw-back],[data-iw-camera],[data-iw-photo],[data-edit],#userChip,[data-close],[data-open-leads],[data-lead-filter],[data-followup-filter]';
 function block(e){var el=e.target.closest&&e.target.closest('button,a,input,select,textarea');if(!el)return;
  if(el.matches('[data-preview-info]')){e.preventDefault();return;}
  if(el.matches('a')||el.matches('button')&&!el.matches(allowed)){e.preventDefault();e.stopImmediatePropagation();}
 }
 document.addEventListener('click',block,true);
 document.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();},true);
 function mark(){document.querySelectorAll('button,input,select,textarea').forEach(function(el){if(el.matches('button')){if(!el.matches(allowed))el.disabled=true;}else if(!el.closest('.filters')&&!el.matches('[type=search],#iwQueue,#jobFilter,#prospectFilter,#visitFilter'))el.disabled=true;});}
 new MutationObserver(mark).observe(document.body,{childList:true,subtree:true});
 var banner=document.createElement('aside');banner.className='role-preview-notice';banner.setAttribute('role','status');banner.textContent='PREVIEW · '+context.label+' · Sample data · View only';document.body.prepend(banner);
 document.body.classList.add('role-preview-active');
})(typeof window!=='undefined'?window:globalThis);
