import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {draftPaymentOptions,draftComparisonHtml} from '../draft-payment-options.mjs';
test('four draft plans reconcile their upfront, monthly and total in 10k increments',()=>{
 const rows=draftPaymentOptions('operations');assert.equal(rows.length,4);
 assert.deepEqual(rows.map(p=>p.total),[4700000,5120000,5600000,5120000]);
 for(const p of rows){assert.equal(p.total,p.upfront+p.monthly*p.months);assert.ok(p.draft);for(const v of [p.upfront,p.monthly,p.total])assert.equal(v%10000,0);}
 assert.equal(rows[3].owns,false);assert.equal(rows[3].months,12);
});
test('draft review is office-only and cannot alter current customer prices or quote rules',()=>{
 const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../navigation.js',import.meta.url),'utf8'),context);
 for(const role of ['admin','operations']){assert.equal(context.VeriskoNavigation.allowed(role,'draftplans'),true);assert.equal(draftPaymentOptions(role).length,4);}
 for(const role of ['sales','teamlead','installer',undefined,'supervisor']){assert.equal(context.VeriskoNavigation.allowed(role,'draftplans'),false);assert.deepEqual(draftPaymentOptions(role),[]);assert.match(draftComparisonHtml(role),/access needed/);}
 const pricing=fs.readFileSync(new URL('../price-catalogue.js',import.meta.url),'utf8');vm.runInContext(pricing,context);
 assert.deepEqual(Array.from(context.VeriskoPriceCatalogue.catalogue,p=>p.price),[5280000,6740000,8180000,11640000]);
 const before=JSON.stringify(context.VeriskoPriceCatalogue);draftComparisonHtml('operations');assert.equal(JSON.stringify(context.VeriskoPriceCatalogue),before);
 const code=fs.readFileSync(new URL('../draft-payment-options.mjs',import.meta.url),'utf8');assert.doesNotMatch(code,/fetch\(|localStorage|sessionStorage|VeriskoPricing|VeriskoPriceCatalogue|private-budget|quoteSnapshot/);
});
test('rental is not an ownership plan or misleading lifetime total; costs and profit stay unconfirmed',()=>{
 const html=draftComparisonHtml('admin');assert.match(html,/Do not send to a client/);assert.match(html,/Paid in the first 12 months/);assert.match(html,/not refundable/);assert.match(html,/Monthly rent does not buy/);assert.match(html,/Profit is not confirmed/);assert.match(html,/26%/);assert.match(html,/camera price, mini PC and support costs still need checking/);assert.doesNotMatch(html,/<button|<input|<form|<a /);
});
