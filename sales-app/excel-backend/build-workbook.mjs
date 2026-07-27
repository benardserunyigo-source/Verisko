import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = new URL("./", import.meta.url).pathname;
const workbook = Workbook.create();
const definitions = [
  ["Prospects", "ProspectsTable", ["id","business","vertical","contact","phone","location","decisionMaker","concern","existing","areas","estimate","budget","stage","owner","source","nextAction","followUp","notes","created"]],
  ["Appointments", "AppointmentsTable", ["id","prospectId","date","time","director","status","purpose","directions","created"]]
];

for (const [sheetName, tableName, headers] of definitions) {
  const sheet = workbook.worksheets.add(sheetName);
  sheet.showGridLines = false;
  sheet.getCell(0, 0).values = [[`Verisko ${sheetName}`]];
  sheet.getRangeByIndexes(0, 0, 1, headers.length).format = {
    fill: "#EAF4FB", font: { bold: true, color: "#16266B", size: 18 },
    rowHeight: 34, verticalAlignment: "center"
  };
  sheet.getRangeByIndexes(1, 0, 1, headers.length).values = [headers];
  sheet.getRangeByIndexes(1, 0, 1, headers.length).format = {
    fill: "#169BD7", font: { bold: true, color: "#FFFFFF" },
    rowHeight: 27, wrapText: true,
    borders: { preset: "outside", style: "thin", color: "#DCE2EC" }
  };
  sheet.getRangeByIndexes(2, 0, 1, headers.length).values = [headers.map(() => "")];
  sheet.getRangeByIndexes(2, 0, 1, headers.length).format = {
    fill: "#EAF4FB", borders: { preset: "inside", style: "thin", color: "#DCE2EC" }
  };
  const table = sheet.tables.add(`A2:${columnName(headers.length)}3`, true, tableName);
  table.style = "TableStyleMedium2";
  sheet.freezePanes.freezeRows(2);
  sheet.getRangeByIndexes(0, 0, 3, headers.length).format.autofitColumns();
  for (let c = 0; c < headers.length; c++) {
    const header = headers[c];
    const range = sheet.getRangeByIndexes(1, c, 2, 1);
    if (/notes|concern|directions|nextAction|location|areas|types|recorder|internet|power|cable|access|extras|labour|timeline/i.test(header)) range.format.columnWidth = 24;
    else if (/amount|deposit|estimate/i.test(header)) {
      range.format.columnWidth = 15;
      sheet.getCell(2, c).format.numberFormat = '"UGX" #,##0';
    } else if (/date|created|followUp|validUntil/i.test(header)) {
      range.format.columnWidth = 13;
      sheet.getCell(2, c).format.numberFormat = "yyyy-mm-dd";
    } else range.format.columnWidth = Math.max(12, Math.min(18, header.length + 3));
  }
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(`${outputDir}/Verisko-Sales-Backend.xlsx`);
for (const [sheetName] of definitions) {
  const preview = await workbook.render({ sheetName, range: "A1:H3", scale: 1.4, format: "png" });
  await fs.writeFile(`${outputDir}/${sheetName.toLowerCase()}-preview.png`, new Uint8Array(await preview.arrayBuffer()));
}
console.log((await workbook.inspect({ kind: "table", maxChars: 6000, tableMaxRows: 4, tableMaxCols: 22 })).ndjson);
console.log((await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 50 }, summary: "formula errors" })).ndjson);

function columnName(count) {
  let n = count, name = "";
  while (n > 0) { n--; name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26); }
  return name;
}
