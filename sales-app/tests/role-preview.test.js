import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {previewInstallerClient} from '../role-preview-installer.mjs';
const source=fs.readFileSync(new URL('../role-preview.js',import.meta.url),'utf8');
function api(){const context={Response,URL,Map};vm.createContext(context);vm.runInContext(source,context);return context.VeriskoRolePreview;}
test('only Admin gets the preview launcher; preview roles cannot include Admin',()=>{
 const a=api();for(const role of ['admin','operations','sales','installer','teamlead','supervisor'])assert.equal(!!a.canLaunch({role},false),role==='admin');
 assert.equal(a.canLaunch({role:'admin'},true),false);assert.throws(()=>a.create('admin'),/Choose/);
});
test('preview storage and changes stay in memory without a real session',async()=>{
 const a=api(),sales=a.create('sales','2026-10-22T12:00:00Z'),ops=a.create('operations');
 assert.equal(sales.user.role,'sales');assert.ok(sales.data.prospects.every(p=>p.createdByEmail===sales.user.email));assert.equal(sales.data.transactions.length,0);assert.equal(sales.data.jobs.length,0);assert.equal(ops.data.prospects.length,2);assert.equal(ops.data.transactions.length,2);
 sales.storage.setItem('test','draft');assert.equal(ops.storage.getItem('test'),null);assert.equal(a.create('sales').storage.getItem('test'),null);assert.equal(JSON.parse(sales.storage.getItem('verisko_sales_settings_v1')).auth.refresh_token,undefined);
 for(const path of ['/api/data','/api/auth','/api/installer','/api/receipt','https://example.invalid/api/auth'])assert.equal((await sales.fetch(path,{method:'POST',body:'{}'})).status,403);
 assert.equal((await sales.fetch('https://example.invalid/private')).status,403);
 const data=await(await sales.fetch('/api/data')).json();assert.equal(data.ok,true);assert.equal(data.pricing,undefined);data.data.prospects[0].business='MUTATED';assert.notEqual(sales.data.prospects[0].business,'MUTATED');
});
test('preview bootstrap never reads real device storage and replaces network transport',()=>{
 let reads=0;const listeners={};const win={location:{search:'?rolePreview=sales'},document:{body:{prepend(){},classList:{add(){}}},addEventListener(type,fn){listeners[type]=fn;},querySelectorAll(){return [];},createElement(){return {setAttribute(){}};}},get localStorage(){reads++;throw new Error('Real storage must not be read');},fetch(){throw new Error('Real fetch must not be called');}};
 const context={window:win,document:win.document,URLSearchParams,URL,Response,Map,MutationObserver:class{observe(){}}};vm.createContext(context);vm.runInContext(source,context);
 assert.equal(reads,0);assert.equal(win.VeriskoRolePreview.active.user.role,'sales');assert.equal(win.fetch,win.VeriskoRolePreview.active.fetch);assert.equal(JSON.parse(win.localStorage.getItem('verisko_sales_settings_v1')).user.role,'sales');assert.equal(typeof listeners.submit,'function');assert.throws(()=>win.indexedDB,/Preview does not use device storage/);assert.equal(win.sessionStorage,win.localStorage);
});
test('installer preview reuses the real payment projection without offline storage or APIs',async()=>{
 // Canvas is only used to draw a fictional reference image.
 const saved=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}}),toDataURL:()=> 'data:image/jpeg;base64,AA=='})};
 try{const a=api(),installer=previewInstallerClient(a.create('installer')),ops=previewInstallerClient(a.create('operations'));await installer.init();await installer.sync();assert.equal(installer.db,undefined);assert.equal(installer.staff.length,0);assert.equal(installer.jobs[0].assignees.length,1);assert.equal(Object.keys(installer.jobs[0].installerPay).length,1);assert.equal(ops.staff.length,1);assert.match(installer.jobs[0].business,/DEMO/);await assert.rejects(installer.command(),/Preview only/);}finally{globalThis.document=saved;}
});
test('a missing preview bootstrap fails closed before workspace or credentials are read',()=>{
 let reads=0;const body={};const context={window:{},document:{body},location:{search:'?rolePreview=sales'},URLSearchParams,get localStorage(){reads++;throw new Error('Real credentials must not be read');}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),context);assert.equal(reads,0);assert.match(body.textContent,/Preview could not load/);
});
test('a blocked storage override cannot leave preview active with real storage',()=>{
 const win={document:{},location:{search:'?rolePreview=sales'}};Object.defineProperty(win,'localStorage',{value:{},configurable:false});
 const context={window:win,URLSearchParams,Map};vm.createContext(context);assert.throws(()=>vm.runInContext(source,context));assert.equal(win.VeriskoRolePreview.active,undefined);
});
test('Team Lead preview shows shared sales and own saved contacts without finance or other private leads',async()=>{
 const a=api(),lead=a.create('teamlead');assert.equal(lead.user.role,'teamlead');assert.equal(lead.label,'Team Lead');
 assert.ok(lead.data.prospects.some(p=>p.createdByEmail==='sales@preview.invalid'));assert.ok(lead.data.prospects.some(p=>p.leadOnly&&p.createdByEmail===lead.user.email));assert.ok(!lead.data.prospects.some(p=>p.id==='preview-school'));
 assert.equal(lead.data.transactions.length,0);assert.equal(lead.data.jobs.length,0);assert.ok(lead.data.users.filter(u=>u.id!==lead.user.id).every(u=>!u.email));assert.equal((await lead.fetch('/api/data',{method:'POST'})).status,403);
});
test('Supervisor is not an available preview or staff role',()=>{const a=api();assert.equal(a.roles.supervisor,undefined);assert.throws(()=>a.create('supervisor'),/Choose a team role/);assert.ok(!a.create('operations').users.some(u=>u.role==='supervisor'));});

test('Team Lead installation preview keeps its role and receives review access without crew pay',()=>{
 const saved=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}}),toDataURL:()=> 'data:image/jpeg;base64,AA=='})};
 try{const client=previewInstallerClient(api().create('teamlead'));assert.equal(client.user.role,'teamlead');assert.ok(client.jobs[0].supervisorIds.includes(client.user.id));assert.equal(Object.keys(client.jobs[0].installerPay).length,0);assert.equal(client.jobs[0].installerPayments.length,0);assert.equal(client.staff.length,0);assert.equal(client.reviewers.length,0);}finally{globalThis.document=saved;}
});
