const crypto = require("crypto");
const ExcelJS = require("exceljs");
const yauzl = require("yauzl");
const { EVENTS, safeEqual } = require("./_lib");

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 10000;
const HEADER = ["Serie", "Carril", "Nadador", "Tiempo", "Acción", "ID", "Prueba", "Original", "Nombre original", "Firma"];
const LABELS = Object.fromEntries(EVENTS.map(id => [id, id.replace(/^(\d+)-/, "$1 m ")]));
const FORMAT = "natacion-excel-v1";

function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function mac(value) {
  const key = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!key) throw new Error("Falta SESSION_SECRET");
  return crypto.createHmac("sha256", key).update(FORMAT + ":" + value).digest("base64url");
}
function signature(id, eventId, baseline, name) { return mac(JSON.stringify([id, eventId, baseline, name])); }
function state(doc) { return doc && doc.status === "dns" ? "DNS" : doc && Number.isInteger(doc.ms) ? doc.ms : null; }
function formatTime(ms) {
  if (ms === null) return "";
  if (ms === "DNS") return "No nadó";
  const cs = Math.round(ms / 10), minutes = Math.floor(cs / 6000);
  return (minutes ? minutes + ":" + String(Math.floor(cs / 100) % 60).padStart(2, "0") : String(Math.floor(cs / 100))) + "." + String(cs % 100).padStart(2, "0");
}
function parseTime(value) {
  if (value === null || value === undefined || value === "") return null;
  // Never guess Excel time fractions, dates, formulas or compact digit formats.
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1 || value >= 100) fail("Tiempo numérico ambiguo. Escribe el tiempo como texto: 32.45 o 1:05.32.");
    const ms = Math.round(value * 1000);
    if (ms % 10 || Math.abs(ms / 1000 - value) > 0.000001 || ms >= 3600000) fail("Usa tiempos positivos menores de una hora, con hasta dos decimales.");
    return ms;
  }
  if (typeof value !== "string") fail("No se aceptan fórmulas, fechas ni objetos en Tiempo. Usa texto: 32.45 o 1:05.32.");
  const text = value.trim().replace(",", ".");
  if (!text) return null;
  const m = text.match(/^(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (!m || (m[1] && +m[2] >= 60)) fail("Tiempo inválido. Usa 32.45 o 1:05.32, con hasta dos decimales.");
  const ms = ((+(m[1] || 0) * 60) + +m[2]) * 1000 + +(m[3] || "").padEnd(2, "0") * 10;
  if (ms <= 0 || ms >= 3600000) fail("El tiempo debe ser mayor que cero y menor de una hora.");
  return ms;
}

async function createWorkbook(swimmers, times) {
  const book = new ExcelJS.Workbook();
  book.creator = "Tiempos de Natación";
  book.created = new Date();
  const map = new Map(times.map(t => [t.eventId + ":" + t.swimmerId, state(t)]));
  // A stable creation order, never the ranking, determines the heats.
  const ordered = [...swimmers].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a._id).localeCompare(String(b._id)));
  for (const eventId of EVENTS) {
    const sheet = book.addWorksheet(LABELS[eventId], {
      views: [{ state: "frozen", ySplit: 6, showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:6" }
    });
    sheet.columns = [
      { width: 9 }, { width: 9 }, { width: 45 }, { width: 17 }, { width: 17 },
      ...Array.from({ length: 5 }, () => ({ width: 20, hidden: true }))
    ];
    sheet.getCell("A2").value = LABELS[eventId] + " · Series de 4";
    sheet.getCell("A2").font = { name: "Arial", size: 15, bold: true, color: { argb: "FF0C2430" } };
    sheet.getRow(2).height = 26;
    sheet.getCell("A3").value = "Tiempo como texto: 32.45 o 1:05.32. Vacío conserva el resultado.";
    sheet.getCell("A4").value = "Acción: NO NADÓ o BORRAR. Ordena siempre las filas completas.";
    sheet.getCell("A5").value = "Edita Serie y Carril si lo necesitas. Los nombres se cambian en la web.";
    [3, 4, 5].forEach(r => { sheet.getCell(r, 1).font = { name: "Arial", size: 10, color: { argb: "FF4F6B78" } }; });
    sheet.getCell("G2").value = eventId;
    sheet.getCell("G3").value = FORMAT;
    sheet.getRow(6).values = HEADER;
    sheet.getRow(6).height = 25;
    sheet.getRow(6).eachCell(c => {
      c.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C2430" } };
      c.alignment = { vertical: "middle", horizontal: "center" };
    });
    const list = ordered.filter(s => (s.events || []).includes(eventId));
    list.forEach((s, i) => {
      const id = String(s._id), baseline = map.get(eventId + ":" + id) ?? null;
      const row = sheet.addRow([Math.floor(i / 4) + 1, i % 4 + 1, s.name,
        typeof baseline === "number" ? formatTime(baseline) : "", baseline === "DNS" ? "NO NADÓ" : "",
        id, eventId, JSON.stringify(baseline), s.name, signature(id, eventId, baseline, s.name)]);
      row.height = 30;
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: "Arial", size: 11, color: { argb: "FF0C2430" } };
        cell.alignment = { vertical: "middle" };
        if (Math.floor(i / 4) % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F5F7" } };
        if (i % 4 === 0) cell.border = { top: { style: "medium", color: { argb: "FF88AAB8" } } };
      });
      row.getCell(3).alignment = { vertical: "middle", wrapText: true };
      row.getCell(4).numFmt = "@";
      [4, 5].forEach(c => { row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } }; });
      row.getCell(5).dataValidation = { type: "list", allowBlank: true, formulae: ['"NO NADÓ,BORRAR"'], showErrorMessage: true, errorTitle: "Acción inválida", error: "Elige NO NADÓ, BORRAR o deja vacío." };
      [1, 2].forEach(c => { row.getCell(c).alignment = { horizontal: "center", vertical: "middle" }; });
    });
    sheet.autoFilter = { from: "A6", to: "J" + Math.max(6, sheet.rowCount) };
    sheet.pageSetup.printArea = "A1:E" + Math.max(7, sheet.rowCount);
    sheet.headerFooter.oddFooter = "&L" + LABELS[eventId] + "&RPágina &P de &N";
  }
  return book;
}

// Validate actual inflated bytes before passing an uploaded ZIP to the XLSX parser.
async function checkZip(buffer) {
  if (buffer.length > MAX_BYTES) fail("El archivo supera el máximo de 2 MB.", 413);
  await new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(new Error("No es un archivo .xlsx válido."));
      let total = 0, count = 0, closed = false;
      const stop = message => { if (!closed) { closed = true; zip.close(); reject(new Error(message)); } };
      zip.on("error", () => stop("El Excel está dañado o tiene un formato no compatible."));
      zip.on("entry", entry => {
        if (++count > 200 || entry.uncompressedSize > 12 * 1024 * 1024 || entry.generalPurposeBitFlag & 1) return stop("El Excel es demasiado grande o está cifrado.");
        if (/vbaProject|externalLinks|embeddings/i.test(entry.fileName)) return stop("Usa un .xlsx sin macros, vínculos externos ni archivos incrustados.");
        zip.openReadStream(entry, (error, stream) => {
          if (error) return stop("No se pudo leer el Excel.");
          stream.on("data", chunk => {
            total += chunk.length;
            if (total > 32 * 1024 * 1024) { stream.destroy(); stop("El contenido del Excel supera el tamaño permitido."); }
          });
          stream.on("error", () => stop("El Excel está dañado."));
          stream.on("end", () => { if (!closed) zip.readEntry(); });
        });
      });
      zip.on("end", () => { if (!closed) { closed = true; resolve(); } });
      zip.readEntry();
    });
  }).catch(e => fail(e.message));
}

async function readWorkbook(buffer) {
  await checkZip(buffer);
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(buffer); } catch { fail("No se pudo abrir el Excel. Usa el archivo .xlsx descargado de esta web, sin contraseña."); }
  if (book.worksheets.length > 10 || !book.worksheets.length) fail("El archivo debe tener entre 1 y 10 hojas de pruebas.");
  let count = 0;
  const rows = [], errors = [], sheets = new Set();
  for (const sheet of book.worksheets) {
    const eventId = sheet.getCell("G2").value;
    if (!EVENTS.includes(eventId) || sheet.getCell("G3").value !== FORMAT || sheets.has(eventId)) fail("Hoja no reconocida o repetida: " + sheet.name + ". Usa el Excel descargado desde Tiempos.");
    sheets.add(eventId);
    if (sheet.rowCount > 1006 || sheet.columnCount > 10) fail("La hoja " + sheet.name + " tiene más filas o columnas de las permitidas.");
    HEADER.forEach((label, i) => { if (sheet.getCell(6, i + 1).value !== label) fail("Se modificaron los encabezados de " + sheet.name + ". Descarga una plantilla nueva."); });
    sheet.eachRow((row, n) => {
      if (n < 7) return;
      if (++count > MAX_ROWS) fail("Demasiadas filas en el archivo.");
      const at = sheet.name + ", fila " + n;
      const v = Array.from({ length: 10 }, (_, i) => row.getCell(i + 1).value);
      if (v.every(x => x === null || x === "")) return;
      try {
        const [heat, lane, name, rawTime, rawAction, id, event, original, originalName, sig] = v;
        if (typeof id !== "string" || !/^[a-f0-9]{24}$/.test(id) || event !== eventId || typeof original !== "string" || typeof originalName !== "string" || typeof sig !== "string") fail("Faltan identificadores internos. No agregues ni copies filas de otro archivo.");
        let baseline;
        try { baseline = JSON.parse(original); } catch { fail("El dato original está dañado."); }
        if (!(baseline === null || baseline === "DNS" || (Number.isInteger(baseline) && baseline > 0 && baseline < 3600000)) || !safeEqual(signature(id, event, baseline, originalName), sig)) fail("Los identificadores internos cambiaron o pertenecen a otra instalación. Descarga el Excel nuevamente.");
        if (name !== originalName) fail("El nombre fue modificado o se ordenó solo parte de la fila. Restaura el nombre original; los nombres se editan en la web.");
        if (!Number.isInteger(+heat) || +heat < 1 || +heat > 1000 || !Number.isInteger(+lane) || +lane < 1 || +lane > 4) fail("La serie debe ser un entero entre 1 y 1000 y el carril entre 1 y 4.");
        if (rawAction !== null && typeof rawAction !== "string") fail("Acción inválida; no se aceptan fórmulas.");
        const action = (rawAction || "").trim().toUpperCase();
        if (!["", "BORRAR", "NO NADÓ", "NO NADO"].includes(action)) fail("Acción inválida. Usa NO NADÓ, BORRAR o deja vacío.");
        const ms = parseTime(rawTime);
        if (action && ms !== null) fail("Para usar " + action + ", primero vacía la celda Tiempo.");
        rows.push({ at, eventId, swimmerId: id, name: originalName, heat: +heat, lane: +lane, baseline,
          desired: action === "BORRAR" ? null : action ? "DNS" : ms, blank: !action && ms === null });
      } catch (e) { errors.push({ at, message: e.message }); }
    });
  }
  return { rows, errors, events: [...sheets] };
}

function planImport(parsed, swimmers, times) {
  const people = new Map(swimmers.map(s => [String(s._id), s]));
  const results = new Map(times.map(t => [t.eventId + ":" + t.swimmerId, t]));
  const errors = [...parsed.errors], warnings = [], operations = [], seen = new Set(), lanes = new Set();
  const summary = { nuevos: 0, correcciones: 0, borrados: 0, noNado: 0, sinCambios: 0, vacios: 0 };
  for (const row of parsed.rows) {
    const key = row.eventId + ":" + row.swimmerId, position = row.eventId + ":" + row.heat + ":" + row.lane;
    if (seen.has(key)) { errors.push({ at: row.at, message: "Nadador repetido en la misma prueba." }); continue; }
    seen.add(key);
    if (lanes.has(position)) errors.push({ at: row.at, message: "Dos nadadores ocupan la misma serie y carril." });
    lanes.add(position);
    if (row.blank) { summary.vacios++; continue; }
    const person = people.get(row.swimmerId), doc = results.get(key), current = state(doc);
    if (!person || !(person.events || []).includes(row.eventId)) { errors.push({ at: row.at, message: "Este nadador ya no está inscrito en esta prueba." }); continue; }
    if (person.name !== row.name) warnings.push({ at: row.at, message: "El nombre ahora es " + person.name + ". Se usará su identificador original." });
    if (row.desired === current || row.desired === row.baseline) { summary.sinCambios++; continue; }
    if (current !== row.baseline) { errors.push({ at: row.at, message: "El resultado cambió después de descargar el Excel (actual: " + (formatTime(current) || "sin tiempo") + "). Descarga uno nuevo para corregirlo." }); continue; }
    const kind = row.desired === null ? "borrados" : row.desired === "DNS" ? "noNado" : current === null ? "nuevos" : "correcciones";
    summary[kind]++;
    operations.push({ eventId: row.eventId, swimmerId: row.swimmerId, name: person.name, at: row.at,
      previous: current, desired: row.desired, revision: doc && doc.updatedAt || null, kind });
  }
  for (const eventId of parsed.events) {
    const missing = swimmers.filter(s => (s.events || []).includes(eventId) && !seen.has(eventId + ":" + String(s._id))).length;
    if (missing) warnings.push({ at: LABELS[eventId], message: missing + " inscrito(s) no aparecen en el archivo. Sus resultados no se modificarán." });
  }
  return { summary, operations, errors, warnings };
}

function digestPlan(plan) { return crypto.createHash("sha256").update(JSON.stringify(plan.operations)).digest("hex"); }
function reviewToken(plan, fileHash) {
  const payload = Buffer.from(JSON.stringify({ hash: digestPlan(plan), fileHash, expires: Date.now() + 15 * 60 * 1000 })).toString("base64url");
  return payload + "." + mac("review:" + payload);
}
function verifyReview(token, plan, fileHash) {
  if (typeof token !== "string" || token.length > 1500) fail("Primero revisa el archivo.", 409);
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra || !safeEqual(mac("review:" + payload), sig)) fail("La revisión no es válida. Revisa el archivo otra vez.", 409);
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { fail("La revisión no es válida.", 409); }
  if (data.expires < Date.now() || data.fileHash !== fileHash || data.hash !== digestPlan(plan)) fail("El archivo, las inscripciones o los tiempos cambiaron, o la revisión venció. Revisa el archivo otra vez antes de guardar.", 409);
}

module.exports = { MAX_BYTES, createWorkbook, readWorkbook, planImport, state, formatTime, parseTime, reviewToken, verifyReview, fail, digestPlan };
