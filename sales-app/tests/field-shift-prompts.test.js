import test from 'node:test';import assert from 'node:assert/strict';
import {CHECK_IN_REMINDERS,checkoutMessage,recordedHours} from '../field-shift-prompts.mjs';
test('check-in reminders cover smiling, not interrupting and listening',()=>{assert.equal(CHECK_IN_REMINDERS.length,3);assert.match(CHECK_IN_REMINDERS.join(' '),/Smile/);assert.match(CHECK_IN_REMINDERS.join(' '),/Do not talk over/);assert.match(CHECK_IN_REMINDERS.join(' '),/Listen more/);});
test('thank-you confirms recorded hours only after server-confirmed checkout and excludes breaks',()=>{
 const shift={status:'ended',endedAt:'2026-10-22T12:00:00Z',segments:[{startedAt:'2026-10-22T09:00:00Z',endedAt:'2026-10-22T10:00:00Z'},{startedAt:'2026-10-22T11:00:00Z',endedAt:'2026-10-22T12:00:00Z'}]};assert.equal(recordedHours(shift),7200000);assert.match(checkoutMessage({shift,pending:null}).text,/hours have been recorded/);assert.equal(checkoutMessage({shift,pending:{action:'end'}}).recorded,false);assert.match(checkoutMessage({shift,pending:{action:'end'}}).text,/waiting to sync/);assert.equal(checkoutMessage({shift:{...shift,offlineSummary:true},pending:null}).recorded,false);
});
