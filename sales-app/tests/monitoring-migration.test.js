import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_RULES } from "../monitoring/supabase/functions/_shared/rules.mjs";

const sql = readFileSync(new URL("../monitoring/supabase/migrations/20261012000000_monitoring_tables.sql", import.meta.url), "utf8");

test("the migration seeds exactly the default alert rules", () => {
  const rows = [...sql.matchAll(/\('(\w+)', (\d+), '(\w+)', (true|false), (\d+|null)\)/g)];
  assert.equal(rows.length, Object.keys(DEFAULT_RULES).length);
  for (const [, kind, wait, severity, sms, expire] of rows) {
    assert.deepEqual(
      { waitMinutes: Number(wait), severity, sms: sms === "true", autoExpireHours: expire === "null" ? null : Number(expire) },
      DEFAULT_RULES[kind], `rule ${kind} differs between the migration and rules.mjs`);
  }
});

test("every table in the migration has row level security switched on", () => {
  const tables = [...sql.matchAll(/^create table (\w+)/gm)].map((m) => m[1]).sort();
  const secured = [...sql.matchAll(/^alter table (\w+) enable row level security;/gm)].map((m) => m[1]).sort();
  assert.ok(tables.length >= 8);
  assert.deepEqual(secured, tables);
  assert.ok(!/create policy/i.test(sql), "no policies: only the service role may touch these tables");
});

test("the service role is granted every table, and nothing is granted to anon or authenticated", () => {
  const tables = [...sql.matchAll(/^create table (\w+)/gm)].map((m) => m[1]);
  const grant = sql.match(/grant select, insert, update, delete on ([\s\S]*?) to service_role;/);
  assert.ok(grant, "no table grant to service_role");
  const granted = grant[1].split(",").map((x) => x.trim()).sort();
  assert.deepEqual(granted, [...tables].sort());
  assert.ok(!/grant [^;]*to (anon|authenticated)/i.test(sql));
});

test("every function pins its search_path and is only executable by the service role", () => {
  const fns = [...sql.matchAll(/^create function (\w+)\(([^)]*)\)[\s\S]*?\$\$;/gm)];
  assert.equal(fns.length, 2);
  for (const [whole, name] of fns) {
    assert.match(whole, /set search_path = public, pg_temp/, `${name} does not pin search_path`);
    assert.match(sql, new RegExp(`revoke all on function ${name}\\([^)]*\\) from public, anon, authenticated;`));
    assert.match(sql, new RegExp(`grant execute on function ${name}\\([^)]*\\) to service_role;`));
  }
});

test("site codes come from next_site_code, which widens past four digits", () => {
  assert.match(sql, /code text not null unique default next_site_code\(\)/);
  assert.match(sql, /lpad\(n::text, greatest\(4, length\(n::text\)\), '0'\)/);
});

