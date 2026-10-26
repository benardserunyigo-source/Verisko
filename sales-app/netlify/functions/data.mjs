import {callbackRecords} from './lib/callbacks-core.mjs';
import {projectCallbackCash,guardCallbackCash} from './lib/callback-cash.mjs';
import {loadInstallerCash,projectInstallerCash,guardInstallerCash} from './lib/installer-cash.mjs';
import {projectWarehouseCases} from './lib/warehouse-stock.mjs';
import {loadClientPlans,projectClientPlans} from './lib/client-plan-job.mjs';
import {salesPriceView} from '../../sales-price-policy.mjs';
import {loadVoiceNotes,projectVoice,stripVoice} from './lib/voice-notes-core.mjs';
import {loadInstallationProgress} from './lib/installation-progress.mjs';
import {firstClientPayment} from './lib/ready-payments.mjs';
import {loadReadyCases,projectReady} from './lib/ready-progress.mjs';
import {ROLES,guardRoster,visibleRoster,guardCash,checkPhotoLinks,safeUser} from './access.mjs';
import '../../lead-pipeline.js';
// Verisko Sales Visit Planner — shared data API backed by Netlify Blobs.
//
// Every request must carry a session (Authorization: Bearer <token>): either a
// Supabase email session, verified with Supabase, or a staff phone + PIN
// session issued by /api/auth (pin-auth.mjs). The caller must be on the team
// allow-list (the `users` list). The very first sign-in on
// an empty workspace bootstraps the owner. Operations can manage only Sales,
// Team lead and Installer accounts. Both Supabase values below are public (publishable) and safe to ship.
import { getStore } from "@netlify/blobs";
import { inputs as pricingInputs, pricing } from "./lib/pricing-policy.mjs";
import { validateQuotes } from "./lib/quote-guard.mjs";
import { AUTH_STORE, STAFF_STORE, identify, protectPinUsers, displayPhone, idOverdue } from "./pin-auth.mjs";
import { supabaseUser } from "./auth.mjs";
import { scopeForSales, mergeSalesWrite, scopeForTeamLead, mergeTeamLeadWrite, guardRepQual, ownsProspect, keepFollowUps, keepNewerPlan, keepImported, mergeTraining, guardVisitChecks } from "./scope.mjs";

const STORE = "verisko-sales";
const KEY = "app-data";
// `jobs` is the merged quote+installation record. `quotes`/`installations` are
// kept (normally empty) so a mid-transition client still holding them isn't
// rejected; they're deprecated and folded into `jobs` client-side on load.
const EMPTY = { prospects: [], appointments: [], users: [], transactions: [], jobs: [], technicians: [], quotes: [], installations: [], config: {}, training: {} };

export function createDataHandler({storeFor=getStore,identifyRequest=identify}={}){return async (request) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
  try {
    // 1) Load data and identify the caller (email or staff PIN session).
    const store = storeFor({name:STORE,consistency:'strong'});
    let data = (await store.get(KEY, { type: "json" })) || EMPTY;
    const users = Array.isArray(data.users) ? data.users : [];
    const who = await identifyRequest(request, data, { authStore: storeFor({name:AUTH_STORE,consistency:'strong'}), now: Date.now(), supabaseUser });
    if (who.error) return json({ ok: false, error: who.error }, who.status, headers);
    const email = who.email;

    // 2) Check the allow-list.
    const bootstrap = users.length === 0;                              // brand-new workspace
    const me = who.me;
    // Staff who haven't added their National ID within 5 days can only do
    // that (via /api/auth submitId) until they have.
    if (idOverdue(me, Date.now())) return json({ ok: false, error: "id_overdue" }, 403, headers);
    if (!me && !bootstrap) return json({ ok: false, error: "not_authorized" }, 403, headers);
    if(me&&!ROLES.includes(me.role))return json({ok:false,error:'Role not allowed.'},403,headers);
    if (me && ['installer'].includes(me.role)) {
      if(request.method!=='GET')return json({ok:false,error:'Use the installation workspace.'},403,headers);
      return json({ok:true,data:{...EMPTY,users:[safeUser(me)]}},200,headers);
    }
    const readyCases=projectWarehouseCases(await loadReadyCases(storeFor({name:'verisko-ready-cases',consistency:'strong'})),await storeFor({name:'verisko-inventory',consistency:'strong'}).get('current',{type:'json'})||{});
    const installationProgress=await loadInstallationProgress(storeFor({name:'verisko-installations',consistency:'strong'}));
    const voiceNotes=await loadVoiceNotes(storeFor({name:'verisko-voice-notes',consistency:'strong'}));
    const clientPlans=await loadClientPlans(storeFor({name:'verisko-client-plans',consistency:'strong'}));
    data=projectVoice(projectReady(projectClientPlans(data,clientPlans),readyCases,installationProgress),voiceNotes);
    const installerCashJobs=['admin','operations'].includes(me?.role)?await loadInstallerCash(storeFor({name:'verisko-installations',consistency:'strong'})):[];
    if(['admin','operations'].includes(me?.role))data=projectInstallerCash(data,installerCashJobs);
    const callbackCases=['admin','operations'].includes(me?.role)?await callbackRecords(storeFor({name:'verisko-callbacks',consistency:'strong'})):[];
    if(['admin','operations'].includes(me?.role))data=projectCallbackCash(data,callbackCases);
    const isAdmin = bootstrap || (me && me.role === "admin");
    const isTeamLead = !bootstrap && !!me && me.role === "teamlead";
    const isSales = !bootstrap && !!me && me.role !== "admin" && me.role !== "operations" && me.role !== "teamlead";

    const marketRecord=await storeFor({name:'verisko-sales-prices',consistency:'strong'}).get('current',{type:'json'});
    const salesPrices=salesPriceView(marketRecord);
    const activePricing=pricingInputs?globalThis.createVeriskoPricing({...pricingInputs,...(marketRecord?{salesCatalogue:salesPrices.catalogue}:{})}):pricing;
    const catalogue=marketRecord?salesPrices.catalogue:pricing.publicPackages();
    if (request.method === "GET") {
      // A salesperson only ever receives their own records (scope.mjs).
      if (isSales) return json({ ok: true, salesPrices, catalogue, data: { ...EMPTY, ...scopeForSales(data, email) } }, 200, headers);
      if (isTeamLead) return json({ ok: true, salesPrices, catalogue, data: { ...EMPTY, ...scopeForTeamLead(data, email) } }, 200, headers);
      const out = { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).filter(k=>data[k]!==undefined).map(k=>[k,data[k]])), prospects: (data.prospects||[]).filter(p=>globalThis.VeriskoLeadPipeline.canSee(p,me)) };
      // Owner/Operations: staff sign-ups waiting for approval (no ID photos —
      // those are fetched one at a time from /api/auth).
      if (isAdmin || (me && me.role === "operations")) out.signups = await pendingSignups(storeFor,me);
      // The spreadsheet export key is Owner/Technical-only: never send it to
      // Sales or Operations devices.
      if (!isAdmin && out.config && typeof out.config === "object") {
        const keys=["pettyLimit","commissionPerSale","commissionPerQualified","commissionTarget","commissionRule","payScheme","schemeStart","perVisit","floatAmount","floatMinBookings","floatGraceDays","floatStart"];
        out.config=Object.fromEntries(keys.filter(k=>out.config[k]!==undefined).map(k=>[k,out.config[k]]));
      }
      out.users=visibleRoster(users,me||{role:"admin"});
      return json({ ok: true, pricing: pricingInputs?{...pricingInputs,...(marketRecord?{salesCatalogue:catalogue}:{})}:null, salesPrices, catalogue, data: out }, 200, headers);
    }

    if (request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      if (!payload || !payload.data) throw new Error("Missing application data.");
      const incoming = stripVoice(payload.data);
      data=stripVoice(data);
      const storedTx = Array.isArray(data.transactions) ? data.transactions : [];
      const storedProspects = Array.isArray(data.prospects) ? data.prospects : [];
      const storedAppointments = Array.isArray(data.appointments) ? data.appointments : [];
      const storedJobs = Array.isArray(data.jobs) ? data.jobs : [];
      const storedTechs = Array.isArray(data.technicians) ? data.technicians : [];
      const storedConfig = data.config && typeof data.config === "object" && !Array.isArray(data.config) ? data.config : {};
      const clean = {
        prospects: Array.isArray(incoming.prospects) ? incoming.prospects : [],
        appointments: Array.isArray(incoming.appointments) ? incoming.appointments : [],
        users: Array.isArray(incoming.users) ? incoming.users : [],
        transactions: Array.isArray(incoming.transactions) ? incoming.transactions : [],
        jobs: Array.isArray(incoming.jobs) ? incoming.jobs : [],
        technicians: Array.isArray(incoming.technicians) ? incoming.technicians : [],
        // Deprecated — carried through (normally empty) until every client migrates.
        quotes: Array.isArray(incoming.quotes) ? incoming.quotes : [],
        installations: Array.isArray(incoming.installations) ? incoming.installations : [],
        config: incoming.config && typeof incoming.config === "object" && !Array.isArray(incoming.config) ? incoming.config : {},
        // Support centre: each person can only record their own videos watched.
        training: mergeTraining(data.training, incoming.training, me && me.id)
      };
      const canCash = isAdmin || (me && me.role === "operations");
      const canReview = isAdmin || (me && me.role === "operations"); // prospect audit

      // A Sales device only holds its own records: merge them into the stored
      // workspace and keep every other rep's prospects and visits as stored.
      if (isSales || isTeamLead) {
        const merged = isTeamLead ? mergeTeamLeadWrite(data, clean, email) : mergeSalesWrite(data, clean, email);
        clean.prospects = merged.prospects;
        clean.appointments = merged.appointments;
        if (isTeamLead) clean.transactions = merged.transactions;
        clean.quotes = Array.isArray(data.quotes) ? data.quotes : [];
        clean.installations = Array.isArray(data.installations) ? data.installations : [];
      }

      try { clean.prospects = globalThis.VeriskoLeadPipeline.guard(storedProspects,clean.prospects,{...me,email},clean.appointments,canReview?clean.jobs:storedJobs); }
      catch(error) { return json({ok:false,error:error.message},400,headers); }

      const savedLeadIds = new Set(clean.prospects.filter(p=>globalThis.VeriskoLeadPipeline.isLead(p)).map(p=>p.id));
      const knownPayments = new Set(storedTx.map(t=>t.id));
      if(clean.transactions.some(t=>!knownPayments.has(t.id)&&savedLeadIds.has(t.prospectId)))return json({ok:false,error:'Move the saved lead to Prospects before recording a payment.'},400,headers);

      const managedVisits=new Set(readyCases.filter(c=>c.visit).map(c=>c.contactId));
      const existingVisitIds=new Set(storedAppointments.map(a=>a.id));
      if(clean.appointments.some(a=>managedVisits.has(a.prospectId)&&!existingVisitIds.has(a.id)))return json({ok:false,error:'This contact already has a site visit. Open its site visit queue entry.'},409,headers);

      const readyContactIds=new Set(readyCases.map(c=>c.contactId));
      for(const t of clean.transactions){if(t.direction!=='in'||knownPayments.has(t.id))continue;
        const pid=t.prospectId||storedJobs.find(j=>j.id===t.installId)?.prospectId;
        if(readyContactIds.has(pid)&&firstClientPayment(pid,storedTx,storedJobs)?.status!=='approved')return json({ok:false,error:'Record the first payment in the site visit queue. Admin approves it there.'},409,headers);
      }

      // Every role: call notes are never lost (append-only) and a phone with
      // an older copy can't overwrite a newer follow-up plan.
      clean.prospects = keepNewerPlan(storedProspects, keepFollowUps(storedProspects, clean.prospects));
      // Only the Admin can un-mark an imported (no-commission) lead.
      if (!isAdmin) clean.prospects = keepImported(storedProspects, clean.prospects);

      // Prospect audit (Sales roles only): can't self-approve, and can't delete
      // an approved prospect or a site visit tied to one — that would erase the
      // audit trail. Operations/admins are unrestricted.
      if (!canReview) {
        const prevById = Object.fromEntries(storedProspects.map((p) => [p.id, p]));
        if (JSON.stringify(clean.prospects) !== JSON.stringify(storedProspects)) {
          clean.prospects = clean.prospects.map((p) => {
            const prev = prevById[p.id];
            // Reps only ask for qualification; the Team lead decides.
            if (p && ownsProspect(prev || p, email)) p = guardRepQual(p, prev);
            // Sales can't self-approve.
            if (p && p.reviewStatus === "approved" && (!prev || prev.reviewStatus !== "approved")) {
              return prev || { ...p, reviewStatus: "pending", reviewedBy: "", reviewedAt: "", reviewNote: "" };
            }
            // Closed sales follow accepted quotes and are written only by
            // Operations/admin devices: a Sales device can neither close nor
            // re-open a sale, so keep whatever the server already holds.
            if (p) {
              const keep = prev
                ? { closedSale: !!prev.closedSale, closedAuto: !!prev.closedAuto, closedBy: prev.closedBy || "", closedAt: prev.closedAt || "" }
                : { closedSale: false, closedAuto: false, closedBy: "", closedAt: "" };
              if (!!p.closedSale !== keep.closedSale || !!p.closedAuto !== keep.closedAuto || (p.closedBy || "") !== keep.closedBy || (p.closedAt || "") !== keep.closedAt) {
                return { ...p, ...keep };
              }
            }
            return p;
          });
        }
        // Restore any approved prospect the caller tried to remove.
        const keptIds = new Set(clean.prospects.map((p) => p.id));
        storedProspects.forEach((prev) => {
          if (prev.reviewStatus === "approved" && !keptIds.has(prev.id)) clean.prospects.push(prev);
        });
        // Restore site visits tied to a still-approved prospect if removed.
        const approvedIds = new Set(clean.prospects.filter((p) => p.reviewStatus === "approved").map((p) => p.id));
        const keptApptIds = new Set(clean.appointments.map((a) => a.id));
        storedAppointments.forEach((prev) => {
          if (approvedIds.has(prev.prospectId) && !keptApptIds.has(prev.id)) clean.appointments.push(prev);
        });
      }

      // Pay scheme 4: only Operations/admin confirm a booking by phone or mark
      // a site visit real / not real — those earn the rep pay.
      if (!canReview) clean.appointments = guardVisitChecks(storedAppointments, clean.appointments);

      // Access and company policy are authoritative on the server.
      if(bootstrap){
        if(clean.users.length!==1||String(clean.users[0].email||'').toLowerCase()!==email||clean.users[0].role!=='admin')return json({ok:false,error:'Create only your own first Admin account.'},403,headers);
        clean.users=[safeUser({...clean.users[0],email,role:'admin'})];
      }else clean.users=guardRoster(users,clean.users,me);
      clean.users=protectPinUsers(users,clean.users);
      if(!isAdmin)clean.config=storedConfig;
      else if(storedConfig.exportKey&&clean.config.exportKey===undefined)clean.config={...clean.config,exportKey:storedConfig.exportKey};
      if(!isAdmin){clean.quotes=Array.isArray(data.quotes)?data.quotes:[];clean.installations=Array.isArray(data.installations)?data.installations:[];}
      await checkPhotoLinks(data,clean,me,storeFor('verisko-receipts'));
      // Jobs (quote→installation lifecycle) & technicians are Operations/admin
      // only — Sales can't touch them.
      if (!canReview) {
        if (JSON.stringify(clean.jobs) !== JSON.stringify(storedJobs)) clean.jobs = storedJobs;
        if (JSON.stringify(clean.technicians) !== JSON.stringify(storedTechs)) clean.technicians = storedTechs;
      }

      if (canReview) {
        try {
          for(const j of clean.jobs){
            const before=storedJobs.find(old=>old.id===j.id);
            if(j.stage==='Handed over'&&before?.stage!=='Handed over'){
              const linked=installationProgress.filter(i=>i.sourceId===j.id&&(!i.contactId||i.contactId===j.prospectId));
              if(!linked.length||linked.some(i=>i.status!=='Completed'||i.clientReview?.outcome!=='accepted'))throw new Error('The assigned site supervisor and client must sign off together in Installations.');
            }
          }
          clean.jobs = validateQuotes(storedJobs, clean.jobs, isAdmin, email,new Date().toISOString(),activePricing,salesPrices);
        }
        catch(error) { return json({ok:false,error:error.message},400,headers); }
      }

      if(canCash)clean.transactions=guardCallbackCash(storedTx,clean.transactions,callbackCases,me);
      if(canCash)clean.transactions=guardInstallerCash(storedTx,clean.transactions,installerCashJobs,me);

      // Operations records cash; only Admin approves or alters approved entries.
      if(!isTeamLead)clean.transactions=guardCash(storedTx,clean.transactions,bootstrap?{role:'admin'}:{...me,email});

      for(const nextContact of clean.prospects){
        const before=storedProspects.find(p=>p.id===nextContact.id);
        if(before?.leadOnly&&!nextContact.leadOnly){
          const ready=await storeFor({name:'verisko-ready-cases',consistency:'strong'}).get('cases/'+nextContact.id,{type:'json'});
          if(ready?.contactId===nextContact.id&&me.role!=='admin'&&ready.ownerId!==me.id)return json({ok:false,error:'Take this lead in the site visit queue before moving it to Prospects.'},403,headers);
        }
      }
      const keptContactIds=new Set(clean.prospects.map(p=>p.id));
      for(const oldContact of storedProspects){if(!keptContactIds.has(oldContact.id)){
        const ready=await storeFor({name:'verisko-ready-cases',consistency:'strong'}).get('cases/'+oldContact.id,{type:'json'});
        if(ready?.contactId===oldContact.id)return json({ok:false,error:'This contact has site visit history. Keep the contact record.'},409,headers);
      }}
      const saved=projectVoice(projectReady(projectClientPlans(clean,clientPlans),readyCases,installationProgress),voiceNotes);
      await store.setJSON(KEY, saved);
      return json({ ok: true, ...(canReview ? { jobs: saved.jobs } : {}) }, 200, headers);
    }

    return json({ ok: false, error: "method_not_allowed" }, 405, headers);
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error.message || "Storage error." }, error.status||500, headers);
  }
};}
export default createDataHandler();

async function pendingSignups(storeFor,actor) {
  const staff = storeFor(STAFF_STORE);
  const { blobs } = await staff.list({ prefix: "staff/" });
  const out = [];
  for (const b of blobs || []) {
    const r = await staff.get(b.key, { type: "json" });
    if (r && r.status === "pending" && (actor.role==="admin"||["sales","teamlead","installer"].includes(r.role||"sales"))) out.push({ id: r.id, legalName: r.legalName, phone: displayPhone(r.phone), signupAt: r.signupAt, hasBack: !!r.idBack });
  }
  return out.sort((a, b) => String(a.signupAt).localeCompare(String(b.signupAt)));
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}
