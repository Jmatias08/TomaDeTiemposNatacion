const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.SESSION_SECRET = "test-secret-not-for-production";
const lib = require("../api/_lib");
const { fixtures, memoryDb } = require("./helpers");
let memory;
lib.getDb = async () => memory.db;
lib.getClient = async () => memory.client;
const excel = require("../api/_excel");
const handler = require("../api/excel");
async function workbook(times = []) { const f = fixtures(); return excel.createWorkbook(f.swimmers, times); }
async function read(book) { return excel.readWorkbook(Buffer.from(await book.xlsx.writeBuffer())); }
async function request(method, body, auth = true) {
  const req = { method, body, headers: auth ? { authorization: "Bearer " + lib.makeToken() } : {} };
  const res = { statusCode: 200, headers: {}, status(n) { this.statusCode = n; return this; }, setHeader(k, v) { this.headers[k] = v; return this; }, json(data) { this.body = data; }, end(data) { this.body = data; } };
  await handler(req, res); return res;
}
async function upload(book) { return Buffer.from(await book.xlsx.writeBuffer()).toString("base64"); }

test("las once pruebas actuales coinciden en interfaz, servidor y Excel", async () => {
  const fs = require("node:fs"), path = require("node:path");
  const expected = ["25-libre", "50-libre", "100-libre", "400-libre", "25-mariposa", "50-mariposa", "25-espalda", "50-espalda", "25-pecho", "50-pecho", "100-combinado"];
  assert.deepEqual(lib.EVENTS, expected);
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const list = html.match(/var EVENTS = (\[[\s\S]*?\]);/)[1];
  const frontend = require("node:vm").runInNewContext("(" + list + ")");
  assert.deepEqual(Array.from(frontend, e => e.id), expected);
  assert.equal(frontend.find(e => e.id === "50-espalda").name, "50 m dorso");
  const f = fixtures(); f.swimmers.forEach(s => { s.events = [...expected]; });
  const book = await excel.createWorkbook(f.swimmers, []);
  assert.ok(book.getWorksheet("25 m dorso")); assert.ok(book.getWorksheet("50 m dorso"));
  const parsed = await read(book);
  assert.equal(parsed.errors.length, 0); assert.equal(parsed.rows.length, 66);
  assert.deepEqual(parsed.events, expected);
  const retired = ["200-libre", "100-espalda", "100-pecho", "100-mariposa"];
  assert.equal(lib.cleanEvents(retired), null);
});

test("Una hoja por prueba, series de 4, tiempos de texto, IDs ocultos e impresión", async () => {
  const book = await workbook(), sheet = book.getWorksheet("50 m libre");
  assert.equal(book.worksheets.length, lib.EVENTS.length);
  assert.deepEqual([7, 8, 9, 10, 11, 12].map(n => [sheet.getCell(n, 1).value, sheet.getCell(n, 2).value]), [[1,1],[1,2],[1,3],[1,4],[2,1],[2,2]]);
  assert.equal(sheet.getColumn(6).hidden, true);
  assert.equal(sheet.getCell("D7").numFmt, "@");
  assert.equal(sheet.pageSetup.printTitlesRow, "1:6");
  const parsed = await read(book);
  assert.equal(parsed.errors.length, 0); assert.equal(parsed.rows.length, 12);
  assert.equal(parsed.rows[5].name, "=Nombre seguro");
});
test("parsea coma, segundos y minutos sin adivinar fechas o fórmulas", () => {
  for (const [input, expected] of [["32.45",32450],["32,45",32450],["1:05.32",65320],["0.32",320],["59:59.99",3599990],[32.45,32450],["",null]]) assert.equal(excel.parseTime(input), expected);
  for (const invalid of ["0", "1:65.00", "60:00", "32.456", "3245", 3245, 0.5, new Date(), { formula: "1+1", result: 2 }, "-1"]) assert.throws(() => excel.parseTime(invalid));
});
test("vacíos conservan resultados y reimportar es idempotente", async () => {
  const f = fixtures(), book = await workbook();
  book.getWorksheet("50 m libre").getCell("D7").value = "32.45";
  const parsed = await read(book), plan = excel.planImport(parsed, f.swimmers, []);
  assert.equal(plan.operations.length, 1); assert.equal(plan.summary.vacios, 11);
  const again = excel.planImport(parsed, f.swimmers, [{ eventId: "50-libre", swimmerId: String(f.swimmers[0]._id), ms: 32450 }]);
  assert.equal(again.operations.length, 0); assert.equal(again.errors.length, 0);
});
test("corrección y borrado explícito respetan el resultado original", async () => {
  const f = fixtures(), times = [{ eventId: "50-libre", swimmerId: String(f.swimmers[0]._id), ms: 33000 }];
  const book = await workbook(times); book.getWorksheet("50 m libre").getCell("D7").value = "32.45";
  let plan = excel.planImport(await read(book), f.swimmers, times);
  assert.equal(plan.summary.correcciones, 1);
  book.getWorksheet("50 m libre").getCell("D7").value = "";
  plan = excel.planImport(await read(book), f.swimmers, times); assert.equal(plan.operations.length, 0);
  book.getWorksheet("50 m libre").getCell("E7").value = "BORRAR";
  plan = excel.planImport(await read(book), f.swimmers, times); assert.equal(plan.summary.borrados, 1);
});
test("archivo viejo no sobrescribe cambios posteriores ni revierte filas intactas", async () => {
  const f = fixtures(), current = [{ eventId: "50-libre", swimmerId: String(f.swimmers[0]._id), ms: 34000 }];
  const book = await workbook(); book.getWorksheet("50 m libre").getCell("D7").value = "32.45";
  const plan = excel.planImport(await read(book), f.swimmers, current);
  assert.match(plan.errors[0].message, /después de descargar/); assert.equal(plan.operations.length, 0);
  const old = await workbook([{ ...current[0], ms: 33000 }]);
  assert.equal(excel.planImport(await read(old), f.swimmers, current).operations.length, 0);
});
test("NO NADÓ tiene estado separado y no admite tiempo simultáneo", async () => {
  const f = fixtures(), book = await workbook(), sheet = book.getWorksheet("50 m libre");
  sheet.getCell("E7").value = "NO NADÓ";
  const plan = excel.planImport(await read(book), f.swimmers, []);
  assert.equal(plan.summary.noNado, 1); assert.equal(plan.operations[0].desired, "DNS");
  sheet.getCell("D7").value = "32.45";
  assert.match((await read(book)).errors[0].message, /vacía/);
});
test("ordenar filas completas conserva IDs; alterar un nombre o ID se rechaza", async () => {
  const book = await workbook(), sheet = book.getWorksheet("50 m libre");
const a = sheet.getRow(7).values.slice(1), b = sheet.getRow(8).values.slice(1);
  sheet.getRow(7).values = b; sheet.getRow(8).values = a;
  assert.equal((await read(book)).errors.length, 0);
  sheet.getCell("C7").value = "Otra persona";
  assert.match((await read(book)).errors[0].message, /nombre/);
  sheet.getCell("C7").value = b[2]; sheet.getCell("F7").value = String(fixtures().swimmers[4]._id);
  assert.match((await read(book)).errors[0].message, /identificadores/);
});
test("detecta nadadores duplicados y carriles repetidos", async () => {
  const f = fixtures(), book = await workbook(), sheet = book.getWorksheet("50 m libre");
  sheet.getRow(8).values = sheet.getRow(7).values.slice(1);
  assert.match(excel.planImport(await read(book), f.swimmers, []).errors[0].message, /repetido/);
  const other = await workbook(); other.getWorksheet("50 m libre").getCell("B8").value = 1;
  assert.match(excel.planImport(await read(other), f.swimmers, []).errors[0].message, /carril/);
});
test("un retirado con tiempo en Excel bloquea la importación; un inscrito nuevo genera aviso", async () => {
  const f = fixtures(), book = await workbook(); book.getWorksheet("50 m libre").getCell("D7").value = "32.45";
  assert.match(excel.planImport(await read(book), f.swimmers.slice(1), []).errors[0].message, /ya no/);
  const newcomer = { ...f.swimmers[0], _id: "000000000000000000000099", name: "Nuevo" };
  assert.ok(excel.planImport(await read(book), [...f.swimmers, newcomer], []).warnings.length);
});
test("un cambio de nombre en la web usa el ID e informa el nombre actual", async () => {
  const f = fixtures(), book = await workbook(); book.getWorksheet("50 m libre").getCell("D7").value = "32.45"; f.swimmers[0].name = "Ana corregida";
  const plan = excel.planImport(await read(book), f.swimmers, []);
  assert.equal(plan.operations[0].name, "Ana corregida"); assert.equal(plan.warnings.length, 1);
});
test("revisión firmada vence y queda ligada al archivo y sus cambios", async () => {
  const f = fixtures(), book = await workbook(); book.getWorksheet("50 m libre").getCell("D7").value = "32.45";
  const plan = excel.planImport(await read(book), f.swimmers, []), token = excel.reviewToken(plan, "file1");
  excel.verifyReview(token, plan, "file1");
  assert.throws(() => excel.verifyReview(token, plan, "file2"));
  assert.throws(() => excel.verifyReview(token + "x", plan, "file1"));
  const dateNow = Date.now; Date.now = () => dateNow() + 16 * 60 * 1000;
  try { assert.throws(() => excel.verifyReview(token, plan, "file1")); } finally { Date.now = dateNow; }
});
test("rechaza ZIP inválido, fórmulas, hoja desconocida y tamaño excesivo", async () => {
  await assert.rejects(() => excel.readWorkbook(Buffer.from("no es excel")), /xlsx/);
  await assert.rejects(() => excel.readWorkbook(Buffer.alloc(excel.MAX_BYTES + 1)), /2 MB/);
  const book = await workbook(); book.getWorksheet("50 m libre").getCell("D7").value = { formula: "32+1", result: 33 };
  assert.match((await read(book)).errors[0].message, /fórmulas/);
  book.getWorksheet("50 m libre").getCell("G2").value = "otra"; await assert.rejects(() => read(book), /no reconocida/);
});
test("API exige organizador y exporta un XLSX real", async () => {
  memory = memoryDb(); assert.equal((await request("GET", null, false)).statusCode, 401);
  assert.equal((await request("POST", {}, false)).statusCode, 401);
  const res = await request("GET"); assert.equal(res.statusCode, 200); assert.ok(Buffer.isBuffer(res.body));
  assert.equal((await excel.readWorkbook(res.body)).rows.length, 12);
});
test("API revisión no escribe; confirmación aplica lote; repetir no duplica", async () => {
  memory = memoryDb(); const book = await workbook(); book.getWorksheet("50 m libre").getCell("D7").value = "32.45"; book.getWorksheet("50 m libre").getCell("E8").value = "NO NADÓ";
  const file = await upload(book), preview = await request("POST", { action: "preview", file });
  assert.equal(preview.statusCode, 200); assert.equal(memory.store.times.length, 0);
  assert.equal((await request("POST", { action: "commit", file })).statusCode, 409);
  const saved = await request("POST", { action: "commit", file, reviewToken: preview.body.reviewToken });
  assert.equal(saved.statusCode, 200); assert.equal(saved.body.saved, 2); assert.equal(memory.store.times[1].status, "dns");
  const repeat = await request("POST", { action: "commit", file, reviewToken: preview.body.reviewToken });
  assert.equal(repeat.body.saved, 0); assert.equal(memory.store.times.length, 2);
});
test("un error en cualquier fila bloquea todo el lote", async () => {
  memory = memoryDb(); const book = await workbook(); book.getWorksheet("50 m libre").getCell("D7").value = "32.45"; book.getWorksheet("50 m libre").getCell("D8").value = "mal";
  const file = await upload(book), preview = await request("POST", { action: "preview", file });
  assert.equal(preview.body.reviewToken, null); assert.equal(preview.body.errors.length, 1);
  assert.equal((await request("POST", { action: "commit", file })).statusCode, 409); assert.equal(memory.store.times.length, 0);
});
test("un cambio entre revisión y confirmación bloquea el guardado", async () => {
  memory = memoryDb(); const book = await workbook(); book.getWorksheet("50 m libre").getCell("D7").value = "32.45";
  const file = await upload(book), preview = await request("POST", { action: "preview", file });
  memory.store.times.push({ eventId: "50-libre", swimmerId: String(memory.store.swimmers[0]._id), ms: 35000 });
  assert.equal((await request("POST", { action: "commit", file, reviewToken: preview.body.reviewToken })).statusCode, 409);
  assert.equal(memory.store.times[0].ms, 35000);
});
test("se vuelve a comprobar dentro de la transacción", async () => {
  memory = memoryDb(); const book = await workbook(); book.getWorksheet("50 m libre").getCell("D7").value = "32.45";
  const file = await upload(book), preview = await request("POST", { action: "preview", file });
  memory.beforeTransaction(store => { store.swimmers[0].events = []; });
  assert.equal((await request("POST", { action: "commit", file, reviewToken: preview.body.reviewToken })).statusCode, 409);
  assert.equal(memory.store.times.length, 0);
});
test("fallo al escribir revierte el lote completo y permite reintentar", async () => {
  memory = memoryDb(); const book = await workbook(); book.getWorksheet("50 m libre").getCell("D7").value = "32.45"; book.getWorksheet("50 m libre").getCell("D8").value = "33.00";
  const file = await upload(book), preview = await request("POST", { action: "preview", file });
  memory.failWrites(true);
  const oldError = console.error; console.error = () => {};
  let res; try { res = await request("POST", { action: "commit", file, reviewToken: preview.body.reviewToken }); } finally { console.error = oldError; }
  assert.equal(res.statusCode, 500); assert.equal(memory.store.times.length, 0); assert.equal(memory.store.swimmers[0].excelRevision, undefined);
  memory.failWrites(false);
  assert.equal((await request("POST", { action: "commit", file, reviewToken: preview.body.reviewToken })).statusCode, 200);
  assert.equal(memory.store.times.length, 2);
});
