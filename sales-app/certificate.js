// Verisko Uganda Operations — training certificate (Support centre).
//
// Issued once someone has passed the quiz for all 13 field sales training
// videos. The model is pure (tested in Node); the PDF is drawn with jsPDF
// (vendor/jspdf.umd.min.js, loaded on demand by app.js), A4 landscape.
(function (root) {
  "use strict";

  var COURSE = "Verisko Field Sales Training";

  // A short, stable code from the user id (not a secret — just a reference).
  function shortCode(id) {
    var h = 0, s = String(id || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return ("0000" + h.toString(36).toUpperCase()).slice(-5);
  }
  function longDate(iso) {
    var d = new Date(String(iso || ""));
    if (isNaN(d)) return "";
    // Kampala date (UTC+3).
    d = new Date(d.getTime() + 3 * 3600 * 1000);
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return d.getUTCDate() + " " + months[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }
  function ymd(iso) {
    var d = new Date(String(iso || ""));
    if (isNaN(d)) return "";
    d = new Date(d.getTime() + 3 * 3600 * 1000);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  }

  // When the course was completed: the stamp saved when the 13th quiz was
  // passed ("cert"), else the latest quiz pass. Null if not complete.
  function completedAt(training, S) {
    var t = training || {};
    if (!S.progress(t).complete) return null;
    if (t.cert && !isNaN(new Date(t.cert))) return t.cert;
    var times = S.VIDEOS.map(function (v) { var r = S.quizResult(t, v.id); return r && r.passed ? r.at : ""; }).filter(Boolean).sort();
    return times.pop() || null;
  }

  // user: { id, name }, training: that user's map, S: VeriskoSupport.
  function buildModel(user, training, S) {
    var at = completedAt(training, S);
    if (!at) return null;
    var u = user || {};
    return {
      name: String(u.name || u.email || "Verisko team member").replace(/\s+/g, " ").trim(),
      course: COURSE,
      videos: S.VIDEOS.length,
      parts: S.PARTS.map(function (p) { return p.title; }),
      minutes: S.TOTAL_MINUTES,
      completedAt: at,
      date: longDate(at),
      number: "VFS-" + ymd(at) + "-" + shortCode(u.id)
    };
  }

  function fileName(m) {
    return "Verisko-Certificate-" + m.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".pdf";
  }
  function shareText(m) {
    return m.name + " has completed the " + m.course + " — all " + m.videos + " videos, every quiz passed. Certificate " + m.number + ", " + m.date + ".";
  }

  function renderPdf(JsPDF, m) {
    var doc = new JsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    var W = 297, H = 210, CX = W / 2;
    var NAVY = [1, 33, 105], CYAN = [22, 155, 215], INK = [31, 41, 55], MUTED = [107, 114, 128], CREAM = [250, 248, 243], GOLD = [184, 146, 61], WHITE = [255, 255, 255];
    function color(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function fill(c) { doc.setFillColor(c[0], c[1], c[2]); }
    function stroke(c) { doc.setDrawColor(c[0], c[1], c[2]); }
    function font(style, size, c) { doc.setFont("helvetica", style); doc.setFontSize(size); if (c) color(c); }
    function spaced(text, size, c, y, gap) {
      font("bold", size, c);
      doc.text(String(text).split("").join(gap || " "), CX, y, { align: "center" });
    }

    // Paper and frame.
    fill(CREAM); doc.rect(0, 0, W, H, "F");
    stroke(NAVY); doc.setLineWidth(2.2); doc.rect(9, 9, W - 18, H - 18, "S");
    stroke(GOLD); doc.setLineWidth(0.5); doc.rect(13, 13, W - 26, H - 26, "S");
    // Corner accents.
    fill(NAVY);
    [[9, 9], [W - 9, 9], [9, H - 9], [W - 9, H - 9]].forEach(function (p) { doc.circle(p[0], p[1], 2.4, "F"); });

    // Brand: the Verisko chevron and name.
    stroke(NAVY); doc.setLineWidth(2.4); doc.setLineCap(1); doc.setLineJoin(1);
    doc.lines([[4.5, 11], [4.5, -11]], CX - 25, 25, [1, 1], "S");
    font("bold", 18, NAVY); doc.text("VERISKO", CX - 12, 34);

    spaced("CERTIFICATE OF COMPLETION", 22, NAVY, 55, " ");
    stroke(GOLD); doc.setLineWidth(0.6); doc.line(CX - 40, 61, CX + 40, 61);

    font("normal", 12, MUTED); doc.text("This certifies that", CX, 75, { align: "center" });
    // Shrink long names to fit the line.
    var size = 34;
    font("bold", size, INK);
    while (size > 16 && doc.getTextWidth(m.name) > 220) { size -= 1; doc.setFontSize(size); }
    doc.text(m.name, CX, 92, { align: "center" });
    stroke(NAVY); doc.setLineWidth(0.4); doc.line(CX - 75, 97, CX + 75, 97);

    font("normal", 12.5, INK);
    doc.text("has completed the " + m.course, CX, 109, { align: "center" });
    doc.text("— all " + m.videos + " training videos, with every quiz passed.", CX, 116, { align: "center" });
    font("normal", 9.5, MUTED);
    doc.text(m.parts.join("  ·  "), CX, 126, { align: "center" });

    // Bottom row: date · seal · number.
    var by = 160;
    font("normal", 9, MUTED); doc.text("Completed", 62, by - 8, { align: "center" });
    font("bold", 13, INK); doc.text(m.date, 62, by, { align: "center" });
    stroke(MUTED); doc.setLineWidth(0.3); doc.line(32, by + 4, 92, by + 4);

    font("normal", 9, MUTED); doc.text("Certificate no.", W - 62, by - 8, { align: "center" });
    font("bold", 13, INK); doc.text(m.number, W - 62, by, { align: "center" });
    doc.line(W - 92, by + 4, W - 32, by + 4);

    // Seal.
    fill(NAVY); doc.circle(CX, by - 4, 17, "F");
    stroke(GOLD); doc.setLineWidth(0.8); doc.circle(CX, by - 4, 14.5, "S");
    stroke(CYAN); doc.setLineWidth(0.4); doc.circle(CX, by - 4, 12.8, "S");
    font("bold", 15, WHITE); doc.text(m.videos + "/" + m.videos, CX, by - 4, { align: "center" });
    font("bold", 6.5, WHITE); doc.text("QUIZZES PASSED", CX, by + 2, { align: "center" });

    font("normal", 8.5, MUTED);
    doc.text("Verisko Uganda Operations  ·  Kampala, Uganda  ·  verisko.com", CX, H - 24, { align: "center" });
    font("normal", 7.5, MUTED);
    doc.text("Issued through the Verisko Operations app on completion of the training videos and quizzes.", CX, H - 19.5, { align: "center" });
    return doc;
  }

  root.VeriskoCertificate = { COURSE: COURSE, buildModel: buildModel, completedAt: completedAt, fileName: fileName, shareText: shareText, renderPdf: renderPdf, shortCode: shortCode };
})(typeof window !== "undefined" ? window : globalThis);
