const GRAPH = "https://graph.microsoft.com/v1.0";
const TABLES = { prospects: "ProspectsTable", appointments: "AppointmentsTable" };

export default async (request) => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    if (!process.env.TEAM_KEY || (request.headers.get("x-team-key") || "") !== process.env.TEAM_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid team key." }), { status: 401, headers });
    }
    requireEnv(["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "EXCEL_DRIVE_ID", "EXCEL_FILE_ID"]);
    const token = await accessToken();
    if (request.method === "GET") {
      const data = {};
      for (const [key, table] of Object.entries(TABLES)) data[key] = await readTable(token, table);
      return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers });
    }
    if (request.method === "POST") {
      const payload = await request.json();
      if (!payload.data) throw new Error("Missing application data.");
      for (const [key, table] of Object.entries(TABLES)) await replaceTable(token, table, payload.data[key] || []);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed." }), { status: 405, headers });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, error: error.message || "Excel backend error." }), { status: 500, headers });
  }
};

function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) throw new Error("Missing Netlify configuration: " + missing.join(", "));
}

async function accessToken() {
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials"
  });
  const response = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error_description || "Microsoft sign-in failed.");
  return result.access_token;
}

function workbookUrl(path) {
  return `${GRAPH}/drives/${encodeURIComponent(process.env.EXCEL_DRIVE_ID)}/items/${encodeURIComponent(process.env.EXCEL_FILE_ID)}/workbook/${path}`;
}

async function graph(token, path, options = {}) {
  const response = await fetch(workbookUrl(path), {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Microsoft Excel request failed.");
  return result;
}

async function tableHeaders(token, table) {
  const result = await graph(token, `tables/${table}/headerRowRange`);
  return result.values[0];
}

async function readTable(token, table) {
  const [headers, rows] = await Promise.all([tableHeaders(token, table), graph(token, `tables/${table}/rows`)]);
  return (rows.value || [])
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, normalizeValue(header, row.values[0][index])])))
    .filter((record) => record.id);
}

async function replaceTable(token, table, records) {
  const headers = await tableHeaders(token, table);
  const current = await graph(token, `tables/${table}/rows`);
  for (let index = (current.value || []).length - 1; index >= 0; index--) {
    await graph(token, `tables/${table}/rows/itemAt(index=${index})`, { method: "DELETE" });
  }
  if (records.length) {
    const values = records.map((record) => headers.map((header) => record[header] ?? ""));
    await graph(token, `tables/${table}/rows/add`, { method: "POST", body: JSON.stringify({ index: null, values }) });
  }
}

function normalizeValue(header, value) {
  if (value == null) return "";
  if (/date|created|followUp|validUntil/i.test(header) && typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return date.toISOString().slice(0, 10);
  }
  return value;
}
