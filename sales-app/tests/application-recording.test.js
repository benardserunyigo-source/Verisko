import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../application-model.mjs';

// Run the real page controller against synthetic DOM, recorder and network.
// No camera, microphone, personal information or production writes are used.
async function page({failChunk=false}={}){
 const nodes=new Map(),calls=[];let clock=10000,recording;
 const node=key=>{if(!nodes.has(key))nodes.set(key,{hidden:false,disabled:false,checked:false,value:'',textContent:'',addEventListener(){},getTracks:()=>[],play:async()=>{}});return nodes.get(key)};
 node('#consent').checked=true;
 const bytes=new Uint8Array(1000);bytes.set([0x1a,0x45,0xdf,0xa3]);
 class Recorder{static isTypeSupported(){return true}constructor(){recording=this;this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob([bytes])});this.onstop()}}
 class Clock extends Date{static now(){return clock}}
 const context=vm.createContext({...model,QUESTIONS:model.SIMPLE_QUESTIONS,FORM_VERSION:model.SIMPLE_VERSION,Blob,URL,AbortSignal,Date:Clock,console,FormData:class{},MediaRecorder:Recorder,
  document:{querySelector:node,querySelectorAll:()=>[]},window:{MediaRecorder:Recorder,addEventListener(){},scrollTo(){}},
  navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},setInterval:()=>1,clearInterval(){},
  fetch:async url=>{const action=new URL(url,'https://test.local').searchParams.get('action');calls.push(action);if(action==='chunk'&&failChunk){failChunk=false;return {ok:false,status:503,json:async()=>({error:'TEST network outage'})}}return {ok:true,json:async()=>action==='create'?{id:'test-session',token:'test-token'}:action==='complete'?{reference:'TEST-APP-1'}:{ok:true}}}
 });
 const source=(await fs.readFile(new URL('../apply.mjs',import.meta.url),'utf8')).replace(/^import .*?;\n/,'');
 vm.runInContext(source,context);
 vm.runInContext(`answers=${JSON.stringify({formVersion:model.SIMPLE_VERSION,fullName:'TEST ONLY',phone:'0772123456',area:'Nakawa',university:'MUBS',course:'Commerce',study:'Year 3',availability:'Yes, for all three months',startDate:'Within 1 week',approach:model.OPTIONS.approach[0],motivation:model.OPTIONS.motivation[0]})}`,context);
 const settle=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve))};
 return {node,calls,settle,async record(){await node('#record').onclick();clock+=3000;recording.stop();await settle()}};
}
test('stopping a recording automatically uploads; Submit only finalizes',async()=>{
 const p=await page();await p.record();assert.deepEqual(p.calls,['create','chunk']);assert.match(p.node('#upload-status').textContent,/Video uploaded/);assert.equal(p.node('#send').disabled,false);await p.node('#send').onclick();assert.deepEqual(p.calls,['create','chunk','complete']);assert.equal(p.node('#reference').textContent,'TEST-APP-1');
});
test('upload failure preserves the recording, blocks Submit and resumes the same session',async()=>{
 const p=await page({failChunk:true});await p.record();assert.equal(p.node('#send').disabled,true);assert.equal(p.node('#retry-upload').hidden,false);await p.node('#send').onclick();assert.equal(p.calls.includes('complete'),false);await p.node('#retry-upload').onclick();assert.deepEqual(p.calls,['create','chunk','chunk']);assert.equal(p.node('#send').disabled,false);
});
test('retaking a video creates a new draft and consent is required before recording',async()=>{
 const p=await page();p.node('#consent').checked=false;await p.node('#record').onclick();assert.deepEqual(p.calls,[]);p.node('#consent').checked=true;await p.record();await p.record();assert.deepEqual(p.calls,['create','chunk','create','chunk']);
});
