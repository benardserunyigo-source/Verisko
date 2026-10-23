import fs from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';
import {createClientWorkHandler} from '../netlify/functions/lib/client-work-core.mjs';
import {FieldMemoryStore} from './helpers/field-fixture.mjs';import {elapsed} from '../client-work-ui.mjs';
function fixture(){let clock=Date.parse('2026-10-23T07:00:00Z'),n=0;const store=new FieldMemoryStore(),users=['sales','teamlead','operations','admin','installer','other'].map(role=>({id:role,role:role==='other'?'sales':role,name:'TEST '+role,email:role+'@test.invalid'})),prospects=[{id:'client',business:'TEST Shop',createdByEmail:'sales@test.invalid',leadOnly:true},{id:'other-client',business:'TEST Second shop',createdByEmail:'sales@test.invalid',leadOnly:true}],cases=[{contactId:'client'}];
 const handler=createClientWorkHandler({store,now:()=>clock,authorize:async r=>({me:users.find(u=>u.id===r.headers.get('authorization')),prospects,cases})});
 const position=()=>({lat:.3,lng:32.5,accuracy:12,at:new Date(clock).toISOString()});const call=(role,body,query='?contactId=client')=>handler(new Request('https://test/api/client-work'+query,{method:body?'POST':'GET',headers:{authorization:role},...(body?{body:JSON.stringify({contactId:'client',requestId:'visit-request-'+(++n),...body})}:{})}));return {store,call,position,advance:ms=>clock+=ms,handler,prospects};}
test('Sales and office staff record their own visits, server time and start/finish locations',async()=>{
 const f=fixture();for(const role of ['sales','teamlead','operations']){const r=await f.call(role,{action:'start',position:f.position(),userId:'FORGED'});assert.equal(r.status,200);const {session}=await r.json();assert.equal(session.userId,role);f.advance(35*60000);const end=await f.call(role,{action:'finish',sessionId:session.id,position:f.position()});assert.equal(end.status,200);const s=(await end.json()).session;assert.equal(s.durationSeconds,2100);assert.equal(s.finish.position.lat,.3);assert.equal(elapsed(s.start.at,s.finish.at),'35 min');}
 const ops=await(await f.call('operations')).json();assert.equal(ops.sessions.length,3);assert.equal((await(await f.call('sales')).json()).sessions.length,1);assert.equal((await(await f.call('teamlead')).json()).sessions.length,1);
});
test('only one visit runs per person, and retries or simultaneous starts cannot duplicate visits',async()=>{
 const f=fixture(),body={action:'start',requestId:'repeat-visit-id',position:f.position()};assert.equal((await f.call('sales',body)).status,200);assert.equal((await f.call('sales',body)).status,200);assert.equal((await f.call('sales',{action:'start',contactId:'other-client',position:f.position()})).status,409);assert.equal((await f.call('sales',{...body,contactId:'other-client'})).status,409);
 const started=(await(await f.call('sales')).json()).current;const finish={action:'finish',requestId:'repeat-finish-id',sessionId:started.id,position:f.position()};assert.equal((await f.call('sales',finish)).status,200);assert.equal((await f.call('sales',finish)).status,200);assert.equal((await(await f.call('sales')).json()).sessions.length,1);
 const result=await Promise.all([f.call('teamlead',{action:'start',position:f.position()}),f.call('teamlead',{action:'start',position:f.position()})]);assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
});
test('unrelated Sales, Installers, forged finishes and cross-origin writes cannot access visit locations',async()=>{
 const f=fixture();assert.equal((await f.call('other')).status,404);assert.equal((await f.call('installer')).status,403);assert.equal((await f.call('unknown')).status,401);assert.equal((await f.call('teamlead',null,'?contactId=other-client')).status,404);
 const s=(await(await f.call('sales',{action:'start',position:f.position()})).json()).session;assert.equal((await f.call('operations',{action:'finish',sessionId:s.id,position:f.position()})).status,409);const r=await f.handler(new Request('https://test/api/client-work',{method:'POST',headers:{authorization:'sales',origin:'https://wrong.test'},body:'{}'}));assert.equal(r.status,403);
});
test('start needs fresh accurate GPS; finish can clearly record unavailable GPS without trapping staff',async()=>{
 const f=fixture();assert.equal((await f.call('sales',{action:'start'})).status,400);assert.equal((await f.call('sales',{action:'start',position:{...f.position(),accuracy:151}})).status,400);assert.equal((await f.call('sales',{action:'start',position:{...f.position(),at:'2026-01-01T00:00:00Z'}})).status,400);
 const s=(await(await f.call('sales',{action:'start',position:f.position()})).json()).session;f.advance(60000);assert.equal((await f.call('sales',{action:'finish',sessionId:s.id})).status,400);const r=await f.call('sales',{action:'finish',sessionId:s.id,locationUnavailable:'GPS unavailable; staff confirmed.'});assert.equal(r.status,200);const end=(await r.json()).session;assert.equal(end.finish.position,null);assert.equal(end.durationSeconds,60);assert.match(end.finish.locationUnavailable,/GPS/);
});
test('staff can finish their own running visit after contact reassignment, but cannot begin another there',async()=>{
 const f=fixture(),s=(await(await f.call('sales',{action:'start',position:f.position()})).json()).session;f.prospects[0].createdByEmail='other@test.invalid';assert.equal((await f.call('sales')).status,404);assert.equal((await f.call('sales',{action:'finish',sessionId:s.id,position:f.position()})).status,200);assert.equal((await f.call('sales',{action:'start',position:f.position()})).status,404);
});


test('visit API rewrite is before the website fallback',()=>{const routes=fs.readFileSync(new URL('../_redirects',import.meta.url),'utf8').split('\n');assert.ok(routes.indexOf('/api/client-work /.netlify/functions/client-work 200')<routes.findIndex(r=>r.startsWith('/* ')));});
