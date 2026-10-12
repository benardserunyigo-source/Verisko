#!/usr/bin/env node
// Builds the file list for deploying one Edge Function through the Supabase connector.
// The connector wants each function as a self-contained set of files, so the shared code
// in supabase/functions/_shared is copied under the function's own folder and the entry
// point's "../_shared/" imports are rewritten to "./_shared/".
//
// Usage: node monitoring/scripts/make-deploy-payload.mjs ingest > /tmp/deploy-ingest.json

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(here, "..", "supabase", "functions");
export const FUNCTION_NAMES = ["ingest", "watch", "sites-read", "incident-update"];

// Only source files are deployed; a stray .DS_Store or editor file must never travel with them.
export const isDeployable = (path) => /\.(mjs|ts)$/.test(path);

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

export function buildPayload(name, root = FUNCTIONS) {
  if (!FUNCTION_NAMES.includes(name)) throw new Error(`unknown function ${name}`);
  const entry = readFileSync(join(root, name, "index.ts"), "utf8").replaceAll("../_shared/", "./_shared/");
  const shared = walk(join(root, "_shared")).filter(isDeployable).sort().map((p) => ({
    name: relative(root, p).split("\\").join("/"),
    content: readFileSync(p, "utf8"),
  }));
  return { name, entrypoint_path: "index.ts", verify_jwt: false, files: [{ name: "index.ts", content: entry }, ...shared] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  try { process.stdout.write(JSON.stringify(buildPayload(name), null, 2)); }
  catch (err) { console.error(err.message); console.error(`usage: make-deploy-payload.mjs <${FUNCTION_NAMES.join("|")}>`); process.exit(1); }
}
