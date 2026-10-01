import test from "node:test";
import assert from "node:assert/strict";
import "../lead-import.js";

const I = globalThis.VeriskoLeadImport;

test("Ugandan phone numbers are normalised however they're typed", () => {
  assert.equal(I.normalizePhone("0772 460125"), "+256 772 460 125");
  assert.equal(I.normalizePhone("256772460125"), "+256 772 460 125");
  assert.equal(I.normalizePhone("+256-772-460-125"), "+256 772 460 125");
  assert.equal(I.normalizePhone("772460125"), "+256 772 460 125");
  assert.equal(I.normalizePhone(256772460125), "+256 772 460 125", "a number cell from Excel");
  assert.equal(I.normalizePhone("2.56772460125E+11"), "+256 772 460 125");
  assert.equal(I.normalizePhone("+1 416 555 0100"), "+14165550100");
  assert.equal(I.normalizePhone("+254 112 676265"), "+254 112 676 265", "Kenya");
  assert.equal(I.normalizePhone(""), "");
});

test("headers are recognised by common names", () => {
  const m = I.mapHeaders(["Client Name", "Contact person", "WhatsApp number", "Area", "Category", "Lead source", "Remarks", "Assigned to"]);
  assert.deepEqual(m, { business: 0, contact: 1, phone: 2, location: 3, vertical: 4, source: 5, notes: 6, assignedTo: 7 });
});

test("rows become leads; rows with nothing to call are skipped with a reason; duplicates are dropped", () => {
  const r = I.parseRows([
    ["Business name", "Phone", "Category", "Source", "Notes", "Instagram link"],
    ["Acacia Pharmacy", "0772460125", "pharmacy", "Instagram", "Busy at noon", "instagram.com/acacia"],
    ["", "", "", "", "", ""],
    ["No Phone Shop", "", "Shop", "Google search", "", ""],
    ["Acacia Pharmacy again", "+256 772 460 125", "", "", "", ""],
    ["", "0701908412", "", "", "", ""]
  ]);
  assert.equal(r.leads.length, 2);
  assert.equal(r.leads[0].phone, "+256 772 460 125");
  assert.equal(r.leads[0].vertical, "Pharmacy");
  assert.equal(r.leads[0].notes, "Busy at noon · instagram.com/acacia");
  assert.equal(r.leads[1].business, "+256 701 908 412", "no name: the phone stands in");
  assert.deepEqual(r.skipped.map((s) => s.row), [4, 5], "spreadsheet row numbers, blank rows counted");
  assert.match(r.skipped[0].reason, /No phone/);
  assert.match(r.skipped[1].reason, /row 2/);
});

test("a file without a name or phone column is refused", () => {
  assert.match(I.parseRows([["Foo", "Bar"], ["a", "b"]]).error, /Business name or Phone/);
  assert.match(I.parseRows([]).error, /empty/);
});

test("leads match existing prospects by phone, then by name", () => {
  const prospects = [{ id: "p1", business: "Acacia Pharmacy", phone: "+256 772 460 125" }, { id: "p2", business: "Ntinda Fresh Mart", phone: "" }];
  const plan = I.plan([
    { business: "Acacia Pharm (Kira)", phone: "0772460125" },
    { business: "ntinda fresh mart", phone: "+256 783 222 608" },
    { business: "New One", phone: "+256 700 111 222" }
  ], prospects);
  assert.deepEqual(plan.map((x) => x.match && x.match.id), ["p1", "p2", null]);
});

test("an update fills details but never touches stage, owner or history", () => {
  const p = { id: "p1", business: "Acacia", phone: "", stage: "Qualified", createdByEmail: "ab@test", notes: "Old note", qualStatus: "approved" };
  const changed = I.applyUpdate(p, { business: "", contact: "Grace", phone: "+256 772 460 125", location: "Kira", vertical: "", source: "Instagram", notes: "From IG" });
  assert.deepEqual(changed, ["contact", "phone", "location", "source", "notes"]);
  assert.equal(p.business, "Acacia");
  assert.equal(p.stage, "Qualified");
  assert.equal(p.createdByEmail, "ab@test");
  assert.equal(p.notes, "Old note\nFrom IG");
  assert.deepEqual(I.applyUpdate(p, { notes: "From IG", phone: "+256 772 460 125" }), [], "re-importing the same file changes nothing");
});

test("Assigned to resolves by email, full name or first name", () => {
  const users = [{ email: "bea@verisko.com", name: "Beatrice Nansubuga" }, { email: "lead@verisko.com", name: "Moses Lead" }];
  assert.equal(I.findUser(users, "BEA@verisko.com").name, "Beatrice Nansubuga");
  assert.equal(I.findUser(users, "Moses Lead").email, "lead@verisko.com");
  assert.equal(I.findUser(users, "beatrice").email, "bea@verisko.com");
  assert.equal(I.findUser(users, "nobody"), null);
});

test("sources are tidied to the app's list", () => {
  assert.equal(I.guessSource("instagram DM"), "Instagram");
  assert.equal(I.guessSource("IG"), "Instagram");
  assert.equal(I.guessSource("Google Maps"), "Google search");
  assert.equal(I.guessSource("FB"), "Facebook");
  assert.equal(I.guessSource(""), "");
});

test("headings under a title row are found; handle, enquiry and date go into notes", () => {
  const r = I.parseRows([
    ["VERISKO | INSTAGRAM CONTACTS"],
    ["Live review completed 29 Sep 2026."],
    ["Verified callback leads", "", 9],
    [],
    ["Name", "Instagram Handle", "Phone Number", "Date Supplied", "Time Supplied", "Lead Context", "Callback Status"],
    ["Rajesh Pathak", "rajesh.pathak.37604", "+256 700 467219", 46273, "2:02 PM", "Door-camera enquiry; asked how to order", "Not called"]
  ]);
  assert.equal(r.error, undefined);
  assert.equal(r.leads.length, 1);
  assert.equal(r.leads[0].business, "Rajesh Pathak");
  assert.equal(r.leads[0].phone, "+256 700 467 219");
  assert.equal(r.leads[0].notes, "Door-camera enquiry; asked how to order · IG @rajesh.pathak.37604 · Supplied 8 Sep 2026");
  assert.equal(r.leads[0].row, 6);
});
