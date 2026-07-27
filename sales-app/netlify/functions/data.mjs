// Verisko Sales Visit Planner — shared data API backed by Netlify Blobs.
// The whole app dataset ({ prospects, appointments }) is stored as one JSON
// blob. Every request must send the shared X-Team-Key header, which is checked
// against the TEAM_KEY environment variable set in the Netlify dashboard.
//
// Only ONE environment variable is required to go live: TEAM_KEY.
import { getStore } from "@netlify/blobs";

const STORE = "verisko-sales";
const KEY = "app-data";
const EMPTY = { prospects: [], appointments: [] };

export default async (request) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
  try {
    // Simple shared-key gate. Keep TEAM_KEY private; never ship it to the browser.
    if (!process.env.TEAM_KEY || (request.headers.get("x-team-key") || "") !== process.env.TEAM_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid team key." }), { status: 401, headers });
    }

    const store = getStore(STORE);

    if (request.method === "GET") {
      const data = (await store.get(KEY, { type: "json" })) || EMPTY;
      return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers });
    }

    if (request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      if (!payload || !payload.data) throw new Error("Missing application data.");
      const clean = {
        prospects: Array.isArray(payload.data.prospects) ? payload.data.prospects : [],
        appointments: Array.isArray(payload.data.appointments) ? payload.data.appointments : []
      };
      await store.setJSON(KEY, clean);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ ok: false, error: "Method not allowed." }), { status: 405, headers });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, error: error.message || "Storage error." }), { status: 500, headers });
  }
};
