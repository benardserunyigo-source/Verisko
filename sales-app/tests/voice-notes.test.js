import test from 'node:test';import assert from 'node:assert/strict';
import {createVoiceHandler,canUseVoice,decodeVoice,projectVoice,loadVoiceNotes} from '../netlify/functions/lib/voice-notes-core.mjs';
import {VoiceRecorder} from '../voice-recorder.mjs';
import {FieldMemoryStore} from './helpers/field-fixture.mjs';
import {journeyFixture} from './helpers/journey-fixture.mjs';
const roles=['admin','operations','teamlead','sales','installer'],users=roles.map(role=>({id:role,name:'TEST '+role,role,email:role+'@test.invalid'}));users.push({id:'other',name:'TEST Other Sales',role:'sales',email:'other@test.invalid'});
const p={id:'client',business:'TEST Shop',phone:'0772111222',location:'TEST Kampala',leadOnly:true,createdByEmail:'sales@test.invalid'},audio=Buffer.concat([Buffer.from('1a45dfa3','hex'),Buffer.alloc(20)]).toString('base64'),at='2026-10-23T10:00:00Z';
function fixture(){const store=new FieldMemoryStore(),cases=[],prospects=[p,{...p,id:'other-client',createdByEmail:'other@test.invalid'}];let n=0;const handler=createVoiceHandler({store,now:()=>at,authorize:async req=>({me:users.find(u=>u.id===req.headers.get('authorization')),prospects,cases})});
 const call=async(role,body,query='?contactId=client')=>{const r=await handler(new Request('https://test/api/voice-notes'+query,{method:body?'POST':'GET',headers:{authorization:role},...(body?{body:JSON.stringify({contactId:'client',requestId:'voice-note-'+(++n),audio,mimeType:'audio/webm;codecs=opus',durationSeconds:15,caption:'TEST Client wants a site visit.',...body})}:{})}));return r;};return {store,cases,prospects,handler,call};}
test('private saved contacts and shared queue contacts have the correct voice access',async()=>{
 const f=fixture();for(const role of ['admin','operations','sales'])assert.equal((await f.call(role)).status,200);assert.equal((await f.call('teamlead')).status,404);assert.equal((await f.call('other')).status,404);assert.equal((await f.call('installer')).status,403);assert.equal((await f.call('unknown')).status,401);
 f.cases.push({contactId:'client'});assert.equal((await f.call('teamlead')).status,200);assert.equal((await f.call('other')).status,404);
 assert.equal(canUseVoice({...p,handoffTo:'operations',handoffAt:at},users[2]),true);assert.equal(canUseVoice({...p,handoffTo:'operations',handoffAt:at},users.at(-1)),false);
});
test('each allowed staff role records with server attribution; shared staff can listen, outsiders cannot',async()=>{
 const f=fixture();f.cases.push({contactId:'client'});const ids=[];
 for(const role of ['sales','teamlead','operations']){const r=await f.call(role,{by:'FORGED',byEmail:'forged',at:'2020-01-01'});assert.equal(r.status,200);const body=await r.json();assert.equal(body.note.byId,role);assert.equal(body.note.byEmail,role+'@test.invalid');assert.equal(body.note.at,at);ids.push(body.note.id);}
 for(const role of ['sales','teamlead','operations','admin']){const list=await(await f.call(role)).json();assert.equal(list.notes.length,3);assert.ok(!JSON.stringify(list).includes(audio));const play=await f.call(role,null,'?contactId=client&id='+ids[0]);assert.equal(play.status,200);assert.equal(play.headers.get('content-type'),'audio/webm');assert.equal(play.headers.get('cache-control'),'no-store');assert.equal((await play.arrayBuffer()).byteLength,24);}
 for(const role of ['other','installer'])assert.notEqual((await f.call(role,null,'?contactId=client&id='+ids[0])).status,200);
 assert.equal((await f.call('sales',null,'?contactId=other-client&id='+ids[0])).status,404);
});
test('retries append once, simultaneous notes both survive, and request reuse cannot change a recording',async()=>{
 const f=fixture(),requestId='retry-same-voice';assert.equal((await f.call('sales',{requestId})).status,200);assert.equal((await f.call('sales',{requestId})).status,200);assert.equal((await(await f.call('sales')).json()).notes.length,1);
 assert.equal((await f.call('sales',{requestId,caption:'Changed'})).status,409);assert.equal((await f.call('operations',{requestId})).status,409);
 const results=await Promise.all([f.call('sales',{requestId:'concurrent-voice-one'}),f.call('operations',{requestId:'concurrent-voice-two'})]);assert.deepEqual(results.map(r=>r.status),[200,200]);assert.equal((await(await f.call('sales')).json()).notes.length,3);
});
test('invalid audio, oversized recordings, excess duration and cross-origin requests are rejected',async()=>{
 const f=fixture();for(const body of [{audio:'notbase64!'},{mimeType:'text/html'},{audio:Buffer.alloc(24).toString('base64')},{durationSeconds:121},{durationSeconds:0},{audio:'A'.repeat(2800001)}])assert.equal((await f.call('sales',body)).status,400);
 const r=await f.handler(new Request('https://test/api/voice-notes',{method:'POST',headers:{authorization:'sales',origin:'https://evil.test'},body:'{}'}));assert.equal(r.status,403);assert.equal(f.store.rows.size,0);
 assert.equal(decodeVoice({audio:Buffer.from('OggS123456789012').toString('base64'),mimeType:'audio/ogg',durationSeconds:1}).mimeType,'audio/ogg');assert.equal(decodeVoice({audio:Buffer.from('1234ftyp12345678').toString('base64'),mimeType:'audio/mp4',durationSeconds:1}).mimeType,'audio/mp4');
});
test('canonical voice interactions project once and survive stale or forged contact saves',async()=>{
 const f=await journeyFixture();assert.equal((await f.save('sales',d=>d.prospects.push({...p,followUps:[{at,byEmail:p.createdByEmail,note:'Typed note'}]}))).status,200);
 const store=f.storeFor('verisko-voice-notes'),handler=createVoiceHandler({store,now:()=>at,authorize:async()=>({me:f.users.find(u=>u.id==='sales'),prospects:(await f.raw()).prospects,cases:[]})});
 const r=await handler(new Request('https://test/api/voice-notes',{method:'POST',body:JSON.stringify({contactId:'client',requestId:'real-voice-note',audio,mimeType:'audio/webm',durationSeconds:10})}));assert.equal(r.status,200);
 let d=await f.workspace('sales');assert.equal(d.prospects[0].followUps.length,2);assert.equal(d.prospects[0].followUps[1].voiceNoteId,'real-voice-note');
 assert.equal((await f.save('sales',d=>{d.prospects[0].followUps=[];d.prospects[0].followUps.push({id:'voice-forged',voiceNoteId:'forged',at,byEmail:p.createdByEmail,note:'FORGED'});})).status,200);
 d=await f.workspace('sales');assert.equal(d.prospects[0].followUps.length,2);assert.equal(d.prospects[0].followUps.some(f=>f.voiceNoteId==='forged'),false);assert.equal((await loadVoiceNotes(store)).length,1);assert.equal(projectVoice(d,await loadVoiceNotes(store)).prospects[0].followUps.length,2);
});
function recorderFixture(){let clock=0,tick,stops=0;const stopped=[],errors=[];class FakeRecorder{static isTypeSupported(m){return m.startsWith('audio/webm');}constructor(stream,opts){this.mimeType=opts.mimeType;this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['TEST'],{type:this.mimeType})});this.onstop();}}
 const capture=new VoiceRecorder({devices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stops++;}}]})},Recorder:FakeRecorder,now:()=>clock,setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>{},onStop:r=>stopped.push(r),onError:e=>errors.push(e)});return {capture,stopped,errors,advance:n=>clock+=n,tick:()=>tick(),stops:()=>stops};}
test('recorder stops at two minutes and releases microphone tracks',async()=>{const f=recorderFixture();await f.capture.start();f.advance(120000);f.tick();assert.equal(f.stopped.length,1);assert.equal(f.stopped[0].durationSeconds,120);assert.ok(f.stops()>0);f.capture.dispose();assert.equal(f.stopped.length,1);});
test('closing during recording or a pending microphone request releases tracks and creates no draft',async()=>{
 const f=recorderFixture();await f.capture.start();f.capture.dispose();assert.equal(f.stopped.length,0);assert.ok(f.stops()>0);
 let resolve,stopped=0;const r=new VoiceRecorder({devices:{getUserMedia:()=>new Promise(ok=>resolve=ok)},Recorder:class{}});const pending=r.start();r.dispose();resolve({getTracks:()=>[{stop(){stopped++;}}]});await pending;assert.equal(stopped,1);
});
test('microphone denial gives a clear retry message',async()=>{const r=new VoiceRecorder({devices:{getUserMedia:async()=>{throw Object.assign(new Error('denied'),{name:'NotAllowedError'});}},Recorder:class{}});await assert.rejects(()=>r.start(),/Allow the microphone/);});
