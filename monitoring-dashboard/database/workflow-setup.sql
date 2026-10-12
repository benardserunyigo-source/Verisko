-- REVIEW / STAGING SETUP, not applied to production. Requires existing monitoring tables.
-- All workflow mutations are transactional. Only the server service role can call them.
begin;
create table if not exists public.watch_profiles (
 site_id uuid primary key references public.sites(id), request_id uuid not null unique,
 client_name text not null, client_phone text not null, client_consent boolean not null,
 manager_name text not null, manager_phone text not null, manager_consent boolean not null,
 mini_pc_ip inet not null, checks jsonb not null, created_by text not null,
 consent_recorded_at timestamptz not null default now(), connected_at timestamptz,
 key_rotated_by text, key_rotated_at timestamptz
);
create table if not exists public.watch_repairs (
 incident_id uuid primary key references public.incidents(id), site_id uuid not null references public.sites(id),
 status text not null check(status in ('scheduled','completed')), version integer not null default 1,
 starts_at timestamptz, ends_at timestamptz, technician text, note text,
 updated_by text not null, updated_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.watch_messages (
 id uuid primary key default gen_random_uuid(), site_id uuid not null references public.sites(id),
 event_key text not null, kind text not null, recipient text not null, phone text not null,
 site_name text not null, detail text not null,
 status text not null default 'pending' check(status in ('pending','sending','accepted','sent','delivered','read','failed','uncertain','blocked','cancelled')),
 provider_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(event_key,phone)
);
create table if not exists public.watch_repair_history (
 id bigint generated always as identity primary key, incident_id uuid not null references public.incidents(id),
 version integer not null, change jsonb not null, actor text not null, at timestamptz not null default now(),unique(incident_id,version)
);
alter table public.watch_profiles enable row level security;
alter table public.watch_repairs enable row level security;
alter table public.watch_messages enable row level security;
alter table public.watch_repair_history enable row level security;
revoke all on public.watch_profiles,public.watch_repairs,public.watch_messages,public.watch_repair_history from public,anon,authenticated;
grant all on public.watch_profiles,public.watch_repairs,public.watch_messages,public.watch_repair_history to service_role;
grant usage,select on sequence public.watch_repair_history_id_seq to service_role;

create or replace function public.watch_enqueue(p_site uuid,p_key text,p_kind text,p_detail text) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare p watch_profiles; n text;
begin
 select * into p from watch_profiles where site_id=p_site; if not found then return; end if;
 select client_name into n from sites where id=p_site;
 insert into watch_messages(site_id,event_key,kind,recipient,phone,site_name,detail,status)
 values(p_site,p_key,p_kind,'Client',p.client_phone,n,p_detail,case when p.client_consent then 'pending' else 'blocked' end),
 (p_site,p_key,p_kind,'Account manager',p.manager_phone,n,p_detail,case when p.manager_consent then 'pending' else 'blocked' end)
 on conflict(event_key,phone) do nothing;
end;$$;

create or replace function public.watch_onboard(p_input jsonb,p_request uuid,p_hash text,p_by text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s sites; c jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select s1.* into s from sites s1 join watch_profiles p on p.site_id=s1.id where p.request_id=p_request;
 if found then return jsonb_build_object('siteId',s.id,'code',s.code,'existing',true); end if;
 insert into sites(client_name,area,job_ref,feeds,status) values(p_input->>'name',p_input->>'area',p_input->>'jobRef',array['box'],'active') returning * into s;
 insert into watch_profiles(site_id,request_id,client_name,client_phone,client_consent,manager_name,manager_phone,manager_consent,mini_pc_ip,checks,created_by)
 values(s.id,p_request,p_input->>'clientName',p_input->>'clientPhone',(p_input->>'clientConsent')::boolean,p_input->>'managerName',p_input->>'managerPhone',(p_input->>'managerConsent')::boolean,(p_input->>'miniPcIp')::inet,p_input->'checks',p_by);
 insert into access_keys(kind,site_id,key_hash,note) values('box',s.id,p_hash,'Verisko Watch onboarding');
 for c in select * from jsonb_array_elements(p_input->'checks') loop
 insert into devices(site_id,kind,label,channel) values(s.id,c->>'kind',c->>'label',(c->>'channel')::int);
 end loop;
 return jsonb_build_object('siteId',s.id,'code',s.code,'existing',false);
end;$$;

create or replace function public.watch_rotate_box(p_site uuid,p_hash text,p_by text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p watch_profiles;
begin
 select * into p from watch_profiles where site_id=p_site for update; if not found then raise exception 'Profile missing'; end if;
 update access_keys set revoked_at=now() where site_id=p_site and kind='box' and revoked_at is null;
 insert into access_keys(kind,site_id,key_hash,note) values('box',p_site,p_hash,'Rotated by staff');
 update watch_profiles set key_rotated_by=p_by,key_rotated_at=now() where site_id=p_site;
 return jsonb_build_object('checks',p.checks);
end;$$;

create or replace function public.watch_detail(p_site uuid) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('profile',(select to_jsonb(p)-'request_id' from watch_profiles p where p.site_id=p_site),
 'repairs',coalesce((select jsonb_agg(r) from watch_repairs r where r.site_id=p_site),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(m) from (select id,kind,recipient,status,created_at,detail from watch_messages where site_id=p_site order by created_at desc limit 50)m),'[]'::jsonb));
$$;

create or replace function public.watch_schedule(p_incident uuid,p_input jsonb,p_version int,p_by text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i incidents;r watch_repairs;v int;txt text;
begin
 select * into i from incidents where id=p_incident for update; if not found or i.state='fixed' then raise exception 'Fault not active'; end if;
 if not exists(select 1 from watch_profiles where site_id=i.site_id) then raise exception 'Complete notification onboarding first'; end if;
 select * into r from watch_repairs where incident_id=p_incident;
 if coalesce(r.version,0)<>p_version then raise exception 'Refresh: another person changed this repair'; end if;
 if (p_input->>'start')::timestamptz<=now() or (p_input->>'end')::timestamptz<=(p_input->>'start')::timestamptz then raise exception 'Invalid visit window'; end if;
 v:=p_version+1;
 insert into watch_repairs(incident_id,site_id,status,version,starts_at,ends_at,technician,note,updated_by)
 values(i.id,i.site_id,'scheduled',v,(p_input->>'start')::timestamptz,(p_input->>'end')::timestamptz,p_input->>'technician',p_input->>'note',p_by)
 on conflict(incident_id) do update set status='scheduled',version=v,starts_at=excluded.starts_at,ends_at=excluded.ends_at,technician=excluded.technician,note=excluded.note,updated_by=p_by,updated_at=now();
 insert into watch_repair_history(incident_id,version,change,actor) values(i.id,v,p_input||jsonb_build_object('status','scheduled'),p_by);
 update watch_messages set status='cancelled',updated_at=now() where event_key like 'repair:'||i.id||':%' and status='pending';
 txt:=to_char((p_input->>'start')::timestamptz at time zone 'Africa/Kampala','DD Mon YYYY HH24:MI')||'–'||to_char((p_input->>'end')::timestamptz at time zone 'Africa/Kampala','HH24:MI')||' EAT. Technician: '||(p_input->>'technician');
 perform watch_enqueue(i.site_id,'repair:'||i.id||':'||v,case when p_version=0 then 'scheduled' else 'rescheduled' end,txt);
 return jsonb_build_object('version',v);
end;$$;

create or replace function public.watch_complete(p_incident uuid,p_version int,p_note text,p_by text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i incidents;r watch_repairs;v int;
begin
 select * into i from incidents where id=p_incident for update; if not found then raise exception 'Missing fault'; end if;
 if not exists(select 1 from watch_profiles where site_id=i.site_id) then raise exception 'Complete notification onboarding first'; end if;
 select * into r from watch_repairs where incident_id=p_incident;
 if r.status='completed' then return jsonb_build_object('alreadyCompleted',true); end if;
 if coalesce(r.version,0)<>p_version then raise exception 'Refresh: another person changed this repair'; end if;
 if length(trim(p_note))<5 then raise exception 'Repair note required'; end if;
 if not exists(select 1 from sites where id=i.site_id and status='active' and box_last_seen_at>now()-interval '3 minutes' and box_last_seen_at<=now()+interval '1 minute') then raise exception 'Wait for a fresh site report before completing'; end if;
 if i.device_id is not null and i.kind in ('camera_offline','recorder_offline') and not exists(select 1 from device_state where device_id=i.device_id and state='ok') then raise exception 'Device must report reachable before completing'; end if;
 v:=p_version+1;
 insert into watch_repairs(incident_id,site_id,status,version,note,updated_by,completed_at) values(i.id,i.site_id,'completed',v,p_note,p_by,now())
 on conflict(incident_id) do update set status='completed',version=v,note=p_note,updated_by=p_by,updated_at=now(),completed_at=now();
 update incidents set state='fixed',fixed_at=now(),fixed_by=p_by,fixed_reason='manual' where id=i.id and state<>'fixed';
 insert into watch_repair_history(incident_id,version,change,actor) values(i.id,v,jsonb_build_object('status','completed','note',p_note,'playbackVerified',true),p_by);
 update watch_messages set status='cancelled',updated_at=now() where event_key like 'repair:'||i.id||':%' and status='pending';
 update watch_messages set status='cancelled',updated_at=now() where event_key in ('fault:'||i.id,'restored:'||i.id) and status='pending';
 perform watch_enqueue(i.site_id,'complete:'||i.id,'completed','Our technician has verified the repair and checked playback.');
 return jsonb_build_object('version',v);
end;$$;

create or replace function public.watch_lifecycle() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare device_label text;
begin
 if tg_table_name='sites' then
  if new.box_last_seen_at is not null and new.status='active' then
   update watch_profiles set connected_at=now() where site_id=new.id and connected_at is null;
   if found then perform watch_enqueue(new.id,'connected:'||new.id,'connected','The mini PC has sent its first report. This confirms the link, not that every camera is working.'); end if;
  end if;
 elsif tg_op='INSERT' then
  if new.kind in ('camera_offline','recorder_offline','disk_full','disk_error','site_silent') then
   select label into device_label from devices where id=new.device_id;
   perform watch_enqueue(new.site_id,'fault:'||new.id,'fault',replace(new.kind,'_',' ')||coalesce(' ('||device_label||')','')||'. Our team will check it and share a repair time when arranged.');
  end if;
 elsif new.state='fixed' and old.state<>'fixed' and new.fixed_reason='recovered' then
  update watch_messages set status='cancelled',updated_at=now() where event_key='fault:'||new.id and status='pending';
  perform watch_enqueue(new.site_id,'restored:'||new.id,'restored','The monitoring signal is back. Repair verification is a separate check.');
 end if;
 return new;
end;$$;
drop trigger if exists watch_site_connected on public.sites;
create trigger watch_site_connected after update of box_last_seen_at on public.sites for each row execute function public.watch_lifecycle();
drop trigger if exists watch_incident_messages on public.incidents;
create trigger watch_incident_messages after insert or update of state on public.incidents for each row execute function public.watch_lifecycle();

create or replace function public.watch_claim_message() returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare m watch_messages;
begin
 update watch_messages candidate set status='blocked',updated_at=now()
 where candidate.status='pending' and not exists(select 1 from watch_profiles p join sites s on s.id=p.site_id where p.site_id=candidate.site_id and s.status='active' and
 ((candidate.recipient='Client' and p.client_phone=candidate.phone and p.client_consent) or (candidate.recipient='Account manager' and p.manager_phone=candidate.phone and p.manager_consent)));
 update watch_messages set status='uncertain',updated_at=now() where status='sending' and updated_at<now()-interval '5 minutes';
 update watch_messages set status='cancelled',updated_at=now() where status='pending' and created_at<now()-interval '24 hours';
 select q.* into m from watch_messages q where q.status='pending'
 and not exists(select 1 from watch_messages earlier where earlier.site_id=q.site_id and earlier.phone=q.phone and earlier.created_at<q.created_at and earlier.status in ('pending','sending','uncertain'))
 order by q.created_at,q.id for update skip locked limit 1;
 if not found then return null; end if;
 update watch_messages set status='sending',updated_at=now() where id=m.id;
 return to_jsonb(m);
end;$$;

create or replace function public.watch_optout(p_phone text) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update watch_profiles set client_consent=false where client_phone=p_phone;
 update watch_profiles set manager_consent=false where manager_phone=p_phone;
 update watch_messages set status='blocked',updated_at=now() where phone=p_phone and status='pending';
end;$$;
revoke all on function public.watch_optout(text) from public,anon,authenticated;
grant execute on function public.watch_optout(text) to service_role;

create or replace function public.watch_message_result(p_id uuid,p_status text,p_provider text) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_status not in ('accepted','failed','uncertain','blocked') then raise exception 'Invalid status'; end if;
 update watch_messages set status=p_status,provider_id=p_provider,updated_at=now() where id=p_id and status='sending';
end;$$;
create or replace function public.watch_delivery(p_provider text,p_status text) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_status not in ('sent','delivered','read','failed') then return; end if;
 update watch_messages set status=p_status,updated_at=now() where provider_id=p_provider and
 case p_status when 'read' then status in ('accepted','sent','delivered','uncertain') when 'delivered' then status in ('accepted','sent','uncertain') when 'sent' then status in ('accepted','uncertain') when 'failed' then status in ('accepted','sent','uncertain') else false end;
end;$$;

revoke all on function public.watch_enqueue(uuid,text,text,text),public.watch_onboard(jsonb,uuid,text,text),public.watch_rotate_box(uuid,text,text),public.watch_detail(uuid),public.watch_schedule(uuid,jsonb,int,text),public.watch_complete(uuid,int,text,text),public.watch_lifecycle(),public.watch_claim_message(),public.watch_message_result(uuid,text,text),public.watch_delivery(text,text) from public,anon,authenticated;
grant execute on function public.watch_enqueue(uuid,text,text,text),public.watch_onboard(jsonb,uuid,text,text),public.watch_rotate_box(uuid,text,text),public.watch_detail(uuid),public.watch_schedule(uuid,jsonb,int,text),public.watch_complete(uuid,int,text,text),public.watch_lifecycle(),public.watch_claim_message(),public.watch_message_result(uuid,text,text),public.watch_delivery(text,text) to service_role;
commit;
