#!/usr/bin/env node
// Creates an access key. The raw key is written to a private file, never printed.
// What is printed is the SQL that stores only the key's hash.
//
//   node monitoring/scripts/make-key.mjs box <site-uuid>
//   node monitoring/scripts/make-key.mjs email
//   node monitoring/scripts/make-key.mjs api
//
// The watch key is NOT made here: it is created inside Postgres so the raw value never leaves
// the database (see the foundation plan, Task 11).

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKey, hashKey } from "../supabase/functions/_shared/keys.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["box", "email", "api"]; // the watch key is created inside Postgres, never here

export async function describeKey(kind, siteId, rawKey) {
  if (!KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join(", ")}`);
  if (kind === "box" && !UUID.test(siteId || "")) throw new Error("a box key needs the site's uuid");
  if (kind !== "box" && siteId) throw new Error(`a ${kind} key is not tied to a site`);
  const hash = await hashKey(rawKey);
  const site = kind === "box" ? `'${siteId}'` : "null";
  return `insert into access_keys (kind, site_id, key_hash, note) values ('${kind}', ${site}, '${hash}', 'created ${new Date().toISOString().slice(0, 10)}');`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [kind, arg] = process.argv.slice(2);
  try {
    const raw = generateKey(kind);
    const sql = await describeKey(kind, arg, raw); // refuses a bad kind before anything is written
    const dir = join(homedir(), ".verisko-monitoring");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = join(dir, `${kind}-${Date.now()}.key`);
    writeFileSync(file, raw + "\n", { mode: 0o600 });
    console.error(`raw key saved to ${file} (readable only by you)`);
    console.log(sql);
  } catch (err) { console.error(err.message); process.exit(1); }
}
