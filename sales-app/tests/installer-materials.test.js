import test from 'node:test';import assert from 'node:assert/strict';
import {createJob,applyCommand,materialBalance,materialProblems} from '../installer-model.mjs';
const now='2026-10-22T12:00:00Z',ops={id:'ops',name:'Operations',role:'operations'},crew={id:'crew',name:'Installer',role:'installer'},other={id:'other',role:'installer'};let seq=0;
const make=()=>createJob({id:'stock-job',business:'TEST',siteStaff:{name:'Verisko staff',phone:'000'},address:'TEST',scope:'TEST',equipment:'200 × Cat6 cable (metres)\n4 × 4K bullet camera',locations:['Gate'],assignees:[crew.id],scheduledDate:'2026-10-23'},ops,now,[ops,crew]);
const cmd=(j,action,data={},user=ops,extra={})=>applyCommand(j,{requestId:'material-test-'+(++seq),action,data,baseVersion:j.versions.materials||0,...extra},user,now);
const issued=()=>{let j=make();return cmd(j,'materialIssue',{itemId:j.materials.items[0].id,quantity:200});};
const report=(j,used=165,damaged=0,missing=0)=>cmd(j,'materialReport',{itemId:j.materials.items[0].id,used,damaged,missing,note:damaged||missing?'TEST reason':''},crew);
test('planned amounts autofill once but never claim material was dispatched',()=>{
 const j=make();assert.equal(j.materials.items[0].needed,200);assert.equal(j.materials.items[0].unit,'metres');assert.equal(j.materials.items[0].issued,0);assert.equal(j.materials.items[1].unit,'pieces');assert.ok(materialProblems(j).some(x=>x.includes('full site')));
 assert.throws(()=>cmd(j,'materialAdd',{name:'Cat6 cable',unit:'metres',needed:100}),/on the list/);
});
test('200 sent, 165 used yields 35 to return; warehouse receipts are separate, partial and idempotent',()=>{
 let j=report(issued());let item=j.materials.items[0];assert.equal(materialBalance(item).leftGood,35);assert.equal(item.returnedGood,0);
 const command={action:'materialReceive',requestId:'unique-warehouse-receipt',baseVersion:j.versions.materials,data:{itemId:item.id,good:20,damaged:0}};
 j=applyCommand(j,command,ops,now);assert.equal(materialBalance(j.materials.items[0]).leftGood,15);assert.deepEqual(applyCommand(j,command,ops,now),j);
 j=cmd(j,'materialReceive',{itemId:item.id,good:15,damaged:0});assert.equal(j.materials.items[0].returnedGood,35);assert.equal(materialBalance(j.materials.items[0]).leftGood,0);
 assert.equal(j.materials.movements.filter(x=>x.action==='materialReceive').length,2);
});
test('negative, excessive, blank, fractional pieces and over-use are rejected on the server',()=>{
 let j=issued(),id=j.materials.items[0].id;
 for(const quantity of [-1,NaN,Infinity,'5',0,1000001])assert.throws(()=>cmd(j,'materialIssue',{itemId:id,quantity}),/valid|large/);
 assert.throws(()=>cmd(j,'materialIssue',{itemId:j.materials.items[1].id,quantity:1.5}),/whole/);
 assert.throws(()=>report(j,201),/do not match/);assert.throws(()=>report(j,160,20,30),/do not match/);
 assert.throws(()=>cmd(j,'materialReceive',{itemId:id,good:10,damaged:0}),/Wait for/);
 j=report(j);assert.throws(()=>cmd(j,'materialReceive',{itemId:id,good:36,damaged:0}),/more than/);
});
test('damaged returns never enter good stock, and missing items need Operations review',()=>{
 let j=report(issued(),160,5,2),id=j.materials.items[0].id;j=cmd(j,'materialConfirm');
 assert.equal(materialBalance(j.materials.items[0]).leftGood,33);assert.equal(materialBalance(j.materials.items[0]).leftDamaged,5);
 assert.ok(materialProblems(j,true).some(x=>x.includes('missing')));
 assert.throws(()=>cmd(j,'materialReceive',{itemId:id,good:33,damaged:5,acceptLoss:true}),/note/);
 j=cmd(j,'materialReceive',{itemId:id,good:33,damaged:5,acceptLoss:true,note:'Operations reviewed TEST missing pieces'});
 assert.equal(j.materials.items[0].returnedGood,33);assert.equal(j.materials.items[0].returnedDamaged,5);assert.deepEqual(materialProblems(j,true),[]);
 assert.throws(()=>report(j,199,0,0),/do not match/);
});
test('only Operations sends and receives; assigned installer reports use; stale reports conflict',()=>{
 const j=issued(),id=j.materials.items[0].id;
 for(const user of [crew,{id:'supervisor',role:'supervisor'}])assert.throws(()=>cmd(j,'materialReceive',{itemId:id,good:0,damaged:0},user),/Only Operations/);
 assert.throws(()=>cmd(j,'materialReport',{itemId:id,used:1,damaged:0,missing:0},ops),/assigned installer/);
 assert.throws(()=>cmd(j,'materialReport',{itemId:id,used:1,damaged:0,missing:0},other),/not assigned/);
 assert.throws(()=>cmd(j,'materialReport',{itemId:id,used:1,damaged:0,missing:0},crew,{baseVersion:0}),e=>e.status===409);
});
test('sending more invalidates the last count and balances include prior returns',()=>{
 let j=report(issued()),id=j.materials.items[0].id;j=cmd(j,'materialReceive',{itemId:id,good:35,damaged:0});j=cmd(j,'materialIssue',{itemId:id,quantity:20});
 assert.equal(materialBalance(j.materials.items[0]).checked,false);j=report(j,180);assert.equal(materialBalance(j.materials.items[0]).leftGood,5);
});
test('tools must return and cannot be reported as fitted or consumed',()=>{
 let j=make();j=cmd(j,'materialAdd',{name:'Drill',unit:'pieces',kind:'tool',needed:1});const id=j.materials.items.at(-1).id;j=cmd(j,'materialIssue',{itemId:id,quantity:1});
 assert.throws(()=>cmd(j,'materialReport',{itemId:id,used:1,damaged:0,missing:0},crew),/Tools must come back/);
 j=cmd(j,'materialReport',{itemId:id,used:0,damaged:0,missing:0},crew);assert.equal(materialBalance(j.materials.items.at(-1)).leftGood,1);
});
test('installer can submit with returns pending but final approval waits for warehouse receipt',()=>{
 let j=report(issued());j=cmd(j,'materialConfirm');assert.deepEqual(materialProblems(j),[]);assert.ok(materialProblems(j,true).some(x=>x.includes('receive')));
 j.status='Submitted';j=cmd(j,'materialReceive',{itemId:j.materials.items[0].id,good:35,damaged:0});assert.deepEqual(materialProblems(j,true),[]);
 j.status='Completed';assert.throws(()=>cmd(j,'materialReceive',{itemId:j.materials.items[0].id,good:1,damaged:0}),/read-only/);
});
test('Operations returns incorrect amounts to installer without deleting earlier counts',()=>{
 let j=report(issued());j.status='Submitted';const count=j.materials.movements.length;
 j=cmd(j,'materialReturn',{itemId:j.materials.items[0].id,note:'Count cable again'});assert.equal(j.status,'Needs correction');assert.equal(materialBalance(j.materials.items[0]).checked,false);assert.equal(j.materials.items[0].correction.note,'Count cable again');
 j=report(j,170);assert.equal(j.materials.items[0].correction,null);assert.equal(materialBalance(j.materials.items[0]).leftGood,30);assert.equal(j.materials.movements.length,count+2);
});
test('metres allow exact two-decimal amounts; unknown old notes do not become stock',()=>{
 let j=issued();j=report(j,165.25);assert.equal(materialBalance(j.materials.items[0]).leftGood,34.75);
 const old=make();delete old.materials;old.equipment='A few cables and cameras';assert.deepEqual(materialProblems(old,true),[]);
 const activated=cmd(old,'materialAdd',{name:'Tester',unit:'sets',kind:'tool',needed:1});assert.equal(activated.materials.items.length,1);assert.equal(activated.materials.items[0].issued,0);
});
