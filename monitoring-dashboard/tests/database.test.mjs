import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('database: onboarding, site binding, repair lifecycle, consent, deduplication, queue and privileges',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 await db.exec(await readFile(new URL('../../sales-app/monitoring/supabase/migrations/20261012000000_monitoring_tables.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../database/workflow-setup.sql',import.meta.url),'utf8'));
 await db.exec('set role service_role;');
 const input={name:'TEST ONLY building',area:'Test',jobRef:'TEST',clientName:'Test client',clientPhone:'+256700000000',clientConsent:true,managerName:'Test manager',managerPhone:'+256700000001',managerConsent:true,miniPcIp:'192.168.1.10',checks:[{kind:'camera',label:'Entrance',ip:'192.168.1.21',port:554,channel:1}]};
 const call=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const onboard=await call('select watch_onboard($1::jsonb,$2::uuid,$3,$4) as result',[JSON.stringify(input),'00000000-0000-4000-8000-000000000001','testhash','tech@test']);const id=onboard.result.siteId;assert.ok(id);
 const again=await call('select watch_onboard($1::jsonb,$2::uuid,$3,$4) as result',[JSON.stringify(input),'00000000-0000-4000-8000-000000000001','differenthash','tech@test']);assert.equal(again.result.existing,true);assert.equal((await call('select count(*)::int as n from sites')).n,1);
 await db.query('update sites set box_last_seen_at=now() where id=$1',[id]);await db.query('update sites set box_last_seen_at=now() where id=$1',[id]);assert.equal((await call("select count(*)::int as n from watch_messages where kind='connected'")).n,2);
 const fault=await call("insert into incidents(site_id,kind,source,opened_at,last_seen_at) values($1,'camera_offline','box',now(),now()) returning id",[id]);assert.equal((await call("select count(*)::int as n from watch_messages where kind='fault'")).n,2);
 const plan={start:new Date(Date.now()+86400000).toISOString(),end:new Date(Date.now()+90000000).toISOString(),technician:'Test tech',note:'Test cable'};
 await call('select watch_schedule($1,$2::jsonb,0,$3)',[fault.id,JSON.stringify(plan),'ops@test']);await assert.rejects(()=>call('select watch_schedule($1,$2::jsonb,0,$3)',[fault.id,JSON.stringify(plan),'other@test']));
 await call('select watch_schedule($1,$2::jsonb,1,$3)',[fault.id,JSON.stringify(plan),'ops@test']);assert.equal((await call("select count(*)::int as n from watch_messages where kind='scheduled' and status='cancelled'")).n,2);
 const device=await call('select id from devices where site_id=$1 limit 1',[id]);await db.query('update incidents set device_id=$1 where id=$2',[device.id,fault.id]);await db.query("insert into device_state(device_id,state,since,last_event_at) values($1,'down',now(),now())",[device.id]);
 await assert.rejects(()=>call('select watch_complete($1,2,$2,$3)',[fault.id,'Playback check claimed but device still down','tech@test']));await db.query("update device_state set state='ok' where device_id=$1",[device.id]);
 await call('select watch_complete($1,2,$2,$3)',[fault.id,'Replaced cable; playback verified','tech@test']);await call('select watch_complete($1,2,$2,$3)',[fault.id,'Duplicate attempt','tech@test']);assert.equal((await call("select count(*)::int as n from watch_messages where kind='completed'")).n,2);assert.equal((await call('select state from incidents where id=$1',[fault.id])).state,'fixed');
 assert.equal((await call('select count(*)::int as n from watch_repair_history')).n,3);
 await db.query('update watch_profiles set client_consent=false where site_id=$1',[id]);await call("select watch_enqueue($1,'test-consent','fault','Test')",[id]);assert.equal((await call("select status from watch_messages where event_key='test-consent' and recipient='Client'")).status,'blocked');
 const claimed=(await call('select watch_claim_message() as m')).m;assert.ok(claimed);await call("select watch_message_result($1,'accepted','provider-test')",[claimed.id]);await call("select watch_delivery('provider-test','delivered')");await call("select watch_delivery('provider-test','sent')");assert.equal((await call("select status from watch_messages where provider_id='provider-test'")).status,'delivered');
 await call('select watch_rotate_box($1,$2,$3)',[id,'newhash','tech@test']);assert.equal((await call('select count(*)::int as n from access_keys where revoked_at is null')).n,1);
 await call("select watch_optout('+256700000001')");assert.equal((await call('select manager_consent from watch_profiles where site_id=$1',[id])).manager_consent,false);
 const grants=await call("select has_function_privilege('anon','watch_onboard(jsonb,uuid,text,text)','EXECUTE') as public, has_function_privilege('service_role','watch_onboard(jsonb,uuid,text,text)','EXECUTE') as server");assert.equal(grants.public,false);assert.equal(grants.server,true);
 }finally{await db.close()}
});
