const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.SESSION_SECRET = "times-test";
const lib = require("../api/_lib"), { memoryDb } = require("./helpers");
let memory;
lib.getDb = async () => memory.db;
const handler = require("../api/times");
async function request(body, auth = true) {
  const req = { method: "PUT", body, headers: auth ? { authorization: "Bearer " + lib.makeToken() } : {} };
  const res = { code: 200, status(n) { this.code=n; return this; }, setHeader() {}, json(body) { this.body=body; } };
  await handler(req,res); return res;
}
function base() { return { eventId: "50-libre", swimmerId: String(memory.store.swimmers[0]._id), ms: 60000 }; }
test("guardar un minuto y corregirlo no duplica resultados", async () => {
  memory=memoryDb(); const body=base();
  assert.equal((await request(body)).code,200); assert.equal(memory.store.times[0].ms,60000);
  assert.equal((await request({...body,ms:65320})).code,200); assert.equal(memory.store.times.length,1); assert.equal(memory.store.times[0].ms,65320);
});
test("un registro antiguo sin tiempo se puede reemplazar por un tiempo", async () => {
  memory=memoryDb(); const body=base();
  memory.store.times.push({...body,ms:null,status:"dns"});
  assert.equal((await request({...body,ms:null,status:"dns"})).code,400);
  await request(body); assert.equal(memory.store.times[0].status,"ok"); assert.equal(memory.store.times[0].ms,60000);
});
test("borrado explícito limpia un resultado sin borrar la inscripción", async () => {
  memory=memoryDb(); const body=base(); await request(body);
  assert.equal((await request({...body,ms:null})).code,200); assert.equal(memory.store.times.length,0); assert.equal(memory.store.swimmers.length,6);
});
test("rechaza anónimos, estados inválidos y tiempos para no inscritos", async () => {
  memory=memoryDb(); const body=base();
  assert.equal((await request(body,false)).code,401);
  for (const input of [{...body,status:"dns"},{...body,ms:0},{...body,status:"otro"},{...body,eventId:"25-pecho"}]) assert.equal((await request(input)).code,400);
  assert.equal(memory.store.times.length,0);
});
