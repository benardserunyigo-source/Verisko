-- Site health monitoring: tables, indexes, default alert rules, row level security.
-- Applied once through the Supabase connector. All access is through Edge Functions
-- using the service role, so every table has RLS on and no policies.

create sequence if not exists site_code_seq start 1;

-- VS-0001, VS-0002 ... and keeps growing past VS-9999 without ever repeating a code.
create function next_site_code() returns text language plpgsql set search_path = public, pg_temp as $$
declare n bigint := nextval('site_code_seq');
begin
  return 'VS-' || lpad(n::text, greatest(4, length(n::text)), '0');
end;
$$;

create table sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default next_site_code(),
  job_ref text,
  client_name text not null,
  area text not null default '',
  care_plan boolean not null default false,
  feeds text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  box_last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table devices (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  kind text not null check (kind in ('camera', 'recorder', 'box')),
  label text not null,
  label_key text generated always as (lower(label)) stored,
  channel int,
  model text,
  created_at timestamptz not null default now(),
  unique (site_id, kind, label_key)
);

create table access_keys (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('box', 'email', 'api', 'watch')),
  site_id uuid references sites (id) on delete cascade,
  key_hash text not null unique,
  note text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((kind = 'box') = (site_id is not null))
);

create table events (
  id bigint generated always as identity primary key,
  site_id uuid references sites (id) on delete cascade,
  device_id uuid references devices (id) on delete set null,
  source text not null check (source in ('box', 'email', 'watch')),
  kind text not null,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique
);
create index events_site_received on events (site_id, received_at desc);
create index events_unknown on events (received_at desc) where kind = 'unknown';

create table device_state (
  device_id uuid primary key references devices (id) on delete cascade,
  state text not null check (state in ('ok', 'down', 'unknown')),
  since timestamptz not null,
  last_event_at timestamptz not null
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  device_id uuid references devices (id) on delete set null,
  kind text not null,
  state text not null default 'open' check (state in ('open', 'acknowledged', 'fixed')),
  source text not null check (source in ('box', 'email', 'watch')),
  opened_at timestamptz not null,
  last_seen_at timestamptz not null,
  repeat_count int not null default 1,
  notified_at timestamptz,
  area_group text,
  acknowledged_by text,
  acknowledged_at timestamptz,
  fixed_by text,
  fixed_at timestamptz,
  fixed_reason text check (fixed_reason in ('recovered', 'manual', 'expired')),
  created_at timestamptz not null default now()
);
-- At most one live incident per site, device and kind, even if two reports arrive at once.
create unique index incidents_one_active
  on incidents (site_id, (coalesce(device_id, '00000000-0000-0000-0000-000000000000'::uuid)), kind)
  where state <> 'fixed';
create index incidents_active_by_site on incidents (site_id) where state <> 'fixed';

create table alert_rules (
  kind text primary key,
  wait_minutes int not null,
  severity text not null check (severity in ('high', 'medium', 'low')),
  sms boolean not null,
  auto_expire_hours int
);
insert into alert_rules (kind, wait_minutes, severity, sms, auto_expire_hours) values
  ('camera_offline', 5, 'high', true, 24),
  ('recorder_offline', 5, 'high', true, null),
  ('disk_full', 0, 'high', true, null),
  ('disk_error', 0, 'high', true, null),
  ('site_silent', 15, 'high', true, null),
  ('ip_conflict', 0, 'medium', false, null);

create table alert_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Counts a repeated report against one incident without a read-then-write race.
create function monitoring_repeat(p_id uuid, p_seen timestamptz, p_count boolean)
returns void language sql set search_path = public, pg_temp as $$
  update incidents
     set last_seen_at = greatest(last_seen_at, p_seen),
         repeat_count = repeat_count + case when p_count then 1 else 0 end
   where id = p_id and state <> 'fixed';
$$;
revoke all on function monitoring_repeat(uuid, timestamptz, boolean) from public, anon, authenticated;
revoke all on function next_site_code() from public, anon, authenticated;

alter table sites enable row level security;
alter table devices enable row level security;
alter table access_keys enable row level security;
alter table events enable row level security;
alter table device_state enable row level security;
alter table incidents enable row level security;
alter table alert_rules enable row level security;
alter table alert_contacts enable row level security;

-- Only the Edge Functions (service role) may use these tables. Granted explicitly, so this
-- does not depend on the project's default privileges.
grant select, insert, update, delete on sites, devices, access_keys, events, device_state,
  incidents, alert_rules, alert_contacts to service_role;
grant usage on sequence site_code_seq to service_role;
grant execute on function monitoring_repeat(uuid, timestamptz, boolean) to service_role;
grant execute on function next_site_code() to service_role;
