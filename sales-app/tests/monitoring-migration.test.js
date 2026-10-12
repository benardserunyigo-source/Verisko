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
