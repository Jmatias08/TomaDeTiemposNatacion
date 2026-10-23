const ExcelJS = require("exceljs");
const { EVENTS } = require("./_lib");
const LABELS = Object.fromEntries(EVENTS.map(id => [id, id.replace(/^(\d+)-/, "$1 m ").replace(/espalda$/, "dorso")]));
function formatTime(ms) {
  const cs = Math.round(ms / 10), minutes = Math.floor(cs / 6000);
  return (minutes ? minutes + ":" + String(Math.floor(cs / 100) % 60).padStart(2, "0") : String(Math.floor(cs / 100))) + "." + String(cs % 100).padStart(2, "0");
}
async function createWorkbook(swimmers, times) {
  const book = new ExcelJS.Workbook();
  book.creator = "Tiempos de Natación"; book.created = new Date();
  const map = new Map(times.map(t => [t.eventId + ":" + t.swimmerId, t]));
  const ordered = [...swimmers].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a._id).localeCompare(String(b._id)));
  for (const eventId of EVENTS) {
    const sheet = book.addWorksheet(LABELS[eventId], {
      views: [{ state: "frozen", ySplit: 6, showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:6" }
    });
    sheet.columns = [{ width: 9 }, { width: 9 }, { width: 43 }, { width: 17 }, { width: 17 }];
    sheet.getCell("A2").value = LABELS[eventId];
    sheet.getCell("A2").font = { name: "Arial", size: 15, bold: true, color: { argb: "FF0C2430" } };
    sheet.getRow(2).height = 26;
    sheet.getCell("A3").value = "Copia de inscritos y resultados. Los tiempos se cargan en la página.";
    sheet.getCell("A4").value = "Grupos de 3 como referencia; podés elegir libremente quién nada.";
    sheet.getCell("A5").value = "Esta descarga no se vuelve a subir a la web.";
    [3,4,5].forEach(r => { sheet.getCell(r,1).font = { name: "Arial", size: 10, color: { argb: "FF4F6B78" } }; });
    sheet.getRow(6).values = ["Serie", "Carril", "Nadador", "Tiempo", "Estado"];
    sheet.getRow(6).height = 25;
    sheet.getRow(6).eachCell(c => {
      c.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C2430" } };
      c.alignment = { vertical: "middle", horizontal: "center" };
    });
    ordered.filter(s => (s.events || []).includes(eventId)).forEach((s,i) => {
      const result = map.get(eventId + ":" + String(s._id));
      const hasTime = result && Number.isInteger(result.ms);
      const row = sheet.addRow([Math.floor(i / 3) + 1, i % 3 + 1, s.name, hasTime ? formatTime(result.ms) : "", hasTime ? "Registrado" : "Sin tiempo"]);
      row.height = 30;
      row.eachCell({ includeEmpty: true }, c => {
        c.font = { name: "Arial", size: 11, color: { argb: "FF0C2430" } }; c.alignment = { vertical: "middle" };
        if (Math.floor(i / 3) % 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F5F7" } };
        if (i % 3 === 0) c.border = { top: { style: "medium", color: { argb: "FF88AAB8" } } };
      });
      row.getCell(3).alignment = { vertical: "middle", wrapText: true }; row.getCell(4).numFmt = "@";
      [1,2].forEach(c => { row.getCell(c).alignment = { horizontal: "center", vertical: "middle" }; });
    });
    sheet.autoFilter = { from: "A6", to: "E" + Math.max(6,sheet.rowCount) };
    sheet.pageSetup.printArea = "A1:E" + Math.max(7,sheet.rowCount);
    sheet.headerFooter.oddFooter = "&L" + LABELS[eventId] + "&RPágina &P de &N";
  }
  return book;
}
module.exports = { createWorkbook, formatTime };
