import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../navigation.js',import.meta.url),'utf8'),ctx);const nav=ctx.VeriskoNavigation;
test('staff have four stable sections; every page belongs to one section',()=>{
 for(const role of ['admin','operations','teamlead','sales']){
  assert.equal(nav.sections(role).map(s=>s.label).join(','),role==='sales'?'Home,Contacts,My work,My pay':'Home,Contacts,Jobs,More');
  for(const s of nav.sections(role)){assert.ok(nav.allowed(role,nav.first(role,s.id)));for(const p of nav.views(role,s.id))assert.equal(nav.group(role,p.id),s.id);}
  assert.equal(nav.group(role,'field'),role==='sales'?'work':'home');assert.equal(nav.group(role,'prices'),'contacts');assert.equal(nav.group(role,'visits'),'work');assert.equal(nav.group(role,'support'),'more');
 }
});
test('Sales and Team Lead cannot navigate into office finance or administration',()=>{
 for(const role of ['sales','teamlead'])for(const p of ['jobs','cashflow','settings','applications'])assert.equal(nav.allowed(role,p),false);
 assert.equal(nav.allowed('sales','installwork'),false);assert.equal(nav.allowed('teamlead','installwork'),true);
 assert.equal(nav.allowed('operations','settings'),false);assert.equal(nav.allowed('operations','cashflow'),true);assert.equal(nav.allowed('admin','settings'),true);
});
test('installers see only own-job entry points and help, no contacts, sales tracking or finance',()=>{
 assert.equal(nav.sections('installer').map(s=>s.label).join(','),'Home,Jobs,More');
 assert.equal(nav.views('installer').map(p=>p.id).join(','),'installerhome,installwork,more,installerhelp');
 for(const p of ['today','dashboard','field','leads','prospects','prices','visits','cashflow','jobs','settings','support'])assert.equal(nav.allowed('installer',p),false);
});
test('unknown and removed roles have no navigation access',()=>{
 for(const r of [undefined,'','supervisor','owner','other']){assert.equal(nav.views(r).length,0);assert.equal(nav.sections(r).length,0);assert.equal(nav.first(r,'home'),null);assert.equal(nav.group(r,'settings'),null);assert.equal(nav.allowed(r,'more'),false);}
});
test('only Operations and Admin have the materials and buying page',()=>{for(const role of ['admin','operations'])assert.equal(nav.allowed(role,'materials'),true);for(const role of ['sales','teamlead','installer'])assert.equal(nav.allowed(role,'materials'),false);});

test('Sales has direct entries for saved contacts, sent contacts and pay while other roles keep their normal layout',()=>{
 assert.equal(nav.first('sales','contacts'),'leads');assert.equal(nav.first('sales','work'),'ready');assert.equal(nav.first('sales','more'),'dashboard');assert.equal(nav.group('sales','dashboard'),'more');assert.equal(nav.group('sales','ready'),'work');assert.equal(nav.group('operations','ready'),'contacts');
});
