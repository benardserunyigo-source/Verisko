import { createClient } from "npm:@supabase/supabase-js@2";
import { handleIngest } from "../_shared/handlers/ingest.mjs";
import { makeRepo } from "../_shared/repo.mjs";
import { consoleSms } from "../_shared/sms.mjs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const deps = { repo: makeRepo(db), sms: consoleSms(), now: () => new Date() };
Deno.serve((req: Request) => handleIngest(req, deps));
