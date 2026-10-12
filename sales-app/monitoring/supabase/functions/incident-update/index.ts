import { createClient } from "npm:@supabase/supabase-js@2";
import { handleIncidentUpdate } from "../_shared/handlers/sites.mjs";
import { makeRepo } from "../_shared/repo.mjs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const deps = { repo: makeRepo(db), now: () => new Date() };
Deno.serve((req: Request) => handleIncidentUpdate(req, deps));
