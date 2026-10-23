const { test } = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
process.env.SESSION_SECRET = "test-secret";
const lib = require("../api/_lib");
const { fixtures, memoryDb } = require("./helpers");
let memory;
lib.getDb = async () => memory.db;
const { createWorkbook } = require("../api/_excel");
const handler = require("../api/excel");
const capture = require("../public/capture");
async function request(method, auth = true) {
  const req = { method, body: { action: "commit", file: "not-accepted" }, headers: auth ? { authorization: "Bearer " + lib.makeToken() } : {} };
  const res = { code: 200, status(n) { this.code=n; return this; }, setHeader() {}, json(body) { this.body=body; }, end(body) { this.body=body; } };
  await handler(req,res); return res;
}
test("descarga once hojas y grupos de tres, sin alterar los resultados", async () => {
  const f = fixtures();
  f.times.push({ eventId:"50-libre", swimmerId:String(f.swimmers[0]._id), ms:65320 }, { eventId:"50-libre", swimmerId:String(f.swimmers[1]._id), ms:null, status:"dns" });
  const book = await createWorkbook(f.swimmers,f.times), sheet=book.getWorksheet("50 m libre");
  assert.equal(book.worksheets.length,11);
  assert.deepEqual([7,8,9,10,11,12].map(n=>[sheet.getCell(n,1).value,sheet.getCell(n,2).value]), [[1,1],[1,2],[1,3],[2,1],[2,2],[2,3]]);
  assert.equal(sheet.getCell("D7").value,"1:05.32"); assert.equal(sheet.getCell("E8").value,"Sin tiempo"); assert.equal(sheet.getCell("D8").value,"");
  const roundtrip = new ExcelJS.Workbook(); await roundtrip.xlsx.load(await book.xlsx.writeBuffer());
  assert.equal(roundtrip.getWorksheet("50 m libre").getCell("C12").value,"=Nombre seguro");
  assert.equal(roundtrip.getWorksheet("50 m libre").getCell("C12").type,ExcelJS.ValueType.String);
  assert.ok(book.getWorksheet("25 m dorso")); assert.ok(book.getWorksheet("400 m libre"));
});
test("Excel solo permite descarga y requiere organizador", async () => {
  memory=memoryDb();
  assert.equal((await request("GET",false)).code,401);
  for (const method of ["POST","PUT","DELETE"]) assert.equal((await request(method)).code,405);
  const res=await request("GET"); assert.equal(res.code,200); assert.ok(Buffer.isBuffer(res.body)); assert.equal(memory.store.times.length,0);
});
test("entrada rápida distingue segundos de minutos y centésimas", () => {
  for (const [raw,ms] of [["100.00",60000],["105.32",65320],["32.5",32500],["00.5",500],["1:05.32",65320],["32,45",32450],["100",60000],["1234.56",754560],["59:59.99",3599990],["",null]]) assert.equal(capture.parse(raw),ms,raw);
  for (const raw of ["0","00.0","160.00","1:60.00","60:00.00","100.000","abc","-2"]) assert.ok(Number.isNaN(capture.parse(raw)),raw);
  assert.equal(capture.description(capture.parse("100.00")),"1 min 00.00 s");
  assert.equal(capture.description(capture.parse("32.5")),"32.50 segundos");
  assert.match(capture.preview("00.0"),/^0.00 segundos/);
});
test("los eventos de inscripción y Excel siguen coincidiendo", async () => {
  const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
  const html=fs.readFileSync(path.join(__dirname,"../public/index.html"),"utf8");
  const front=vm.runInNewContext("("+html.match(/var EVENTS = (\[[\s\S]*?\]);/)[1]+")");
  assert.deepEqual(Array.from(front,e=>e.id),lib.EVENTS);
  new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
});
