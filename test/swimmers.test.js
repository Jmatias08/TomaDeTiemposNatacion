const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { ObjectId } = require("mongodb");
process.env.SESSION_SECRET = "registration-permissions-test";
const lib = require("../api/_lib");
let swimmers, times, dbCalls;
function reset() { swimmers = []; times = []; dbCalls = 0; }
function matches(doc, query) {
  return Object.entries(query).every(([key, value]) => value && value.$nin
    ? !value.$nin.includes(doc[key]) : String(doc[key]) === String(value));
}
lib.getDb = async () => {
  dbCalls++;
  return { collection(name) {
    const records = name === "swimmers" ? swimmers : times;
    return {
      async estimatedDocumentCount() { return records.length; },
      async findOne(query) { return records.find(row => matches(row, query)) || null; },
      async insertOne(doc) { const id = new ObjectId(); records.push({ _id: id, ...doc }); return { insertedId: id }; },
      async updateOne(query, update) { Object.assign(records.find(row => matches(row, query)), update.$set); },
      async deleteOne(query) { const index = records.findIndex(row => matches(row, query)); if (index >= 0) records.splice(index, 1); },
      async deleteMany(query) { for (let i = records.length - 1; i >= 0; i--) if (matches(records[i], query)) records.splice(i, 1); }
    };
  } };
};
const handler = require("../api/swimmers");
async function request(method, body = {}, id = "", headers = {}) {
  const req = { method, body, query: { id }, headers };
  const res = { code: 200, status(n) { this.code = n; return this; }, setHeader() { return this; }, json(value) { this.body = value; } };
  await handler(req, res); return res;
}
function admin() { return { authorization: "Bearer " + lib.makeToken() }; }

test("inscribirse requiere solo nombre y pruebas; no crea credenciales", async () => {
  reset(); const result = await request("POST", { name: "Ana López", events: ["50-libre"] });
  assert.equal(result.code, 201); assert.ok(result.body.id); assert.equal(result.body.token, undefined);
  assert.deepEqual(Object.keys(swimmers[0]).sort(), ["_id", "createdAt", "events", "name", "nameKey"].sort());
});
test("una petición de la interfaz anterior tampoco guarda PIN ni inicia sesión", async () => {
  reset(); const result = await request("POST", { name: "Ana López", events: ["50-libre"], pin: "1234", pinHash: "injected" });
  assert.equal(result.code, 201); assert.equal(swimmers[0].pin, undefined); assert.equal(swimmers[0].pinHash, undefined); assert.equal(result.body.token, undefined);
});
test("no permite nombres duplicados sin importar mayúsculas o tildes", async () => {
  reset(); await request("POST", { name: "Ana López", events: ["50-libre"] });
  const duplicate = await request("POST", { name: "ANA LOPEZ", events: ["100-libre"] });
  assert.equal(duplicate.code, 409); assert.match(duplicate.body.error, /organizador/); assert.equal(swimmers.length, 1);
});
test("inscripciones inválidas siguen rechazándose", async () => {
  reset();
  assert.equal((await request("POST", { name: "A", events: ["50-libre"] })).code, 400);
  assert.equal((await request("POST", { name: "Ana", events: [] })).code, 400);
  assert.equal((await request("POST", { name: "Ana", events: ["inventada"] })).code, 400);
  assert.equal(swimmers.length, 0);
});
test("nadadores anónimos no pueden editar ni borrar, sin siquiera consultar la base", async () => {
  reset(); const id = String(new ObjectId());
  for (const method of ["PUT", "DELETE"]) assert.equal((await request(method, { name: "Otro", events: ["100-libre"] }, id)).code, 403);
  assert.equal(dbCalls, 0);
});
test("una sesión antigua válida de nadador ya no autoriza editar ni borrar", async () => {
  reset(); const id = String(new ObjectId()), exp = String(Date.now() + 3600000);
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update("s:" + id + ":" + exp).digest("base64url");
  const oldToken = id + "." + exp + "." + sig;
  for (const method of ["PUT", "DELETE"]) {
    assert.equal((await request(method, {}, id, { "x-swimmer-token": oldToken })).code, 403);
    assert.equal((await request(method, {}, id, { authorization: "Bearer " + oldToken })).code, 403);
  }
  assert.equal(dbCalls, 0);
});
test("una sesión de organizador vencida tampoco puede modificar datos", async () => {
  reset(); const exp = String(Date.now() - 1000);
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update("a:" + exp).digest("base64url");
  assert.equal((await request("PUT", {}, String(new ObjectId()), { authorization: "Bearer " + exp + "." + sig })).code, 403);
  assert.equal(dbCalls, 0);
});
test("el organizador puede corregir una inscripción existente y conservar sus tiempos válidos", async () => {
  reset(); const inserted = await request("POST", { name: "Ana", events: ["50-libre", "100-libre"] });
  times.push({ swimmerId: inserted.body.id, eventId: "50-libre", ms: 32000 }, { swimmerId: inserted.body.id, eventId: "100-libre", ms: 65000 });
  const result = await request("PUT", { name: "Ana corregida", events: ["50-libre"] }, inserted.body.id, admin());
  assert.equal(result.code, 200); assert.equal(swimmers[0].name, "Ana corregida"); assert.deepEqual(swimmers[0].events, ["50-libre"]);
  assert.equal(times.length, 1); assert.equal(times[0].ms, 32000);
});
test("el organizador puede quitar una inscripción y se limpian solamente sus tiempos", async () => {
  reset(); const first = await request("POST", { name: "Ana", events: ["50-libre"] });
  const second = await request("POST", { name: "Pedro", events: ["50-libre"] });
  times.push({ swimmerId: first.body.id, eventId: "50-libre", ms: 32000 }, { swimmerId: second.body.id, eventId: "50-libre", ms: 33000 });
  assert.equal((await request("DELETE", {}, first.body.id, admin())).code, 200);
  assert.equal(swimmers.length, 1); assert.equal(swimmers[0].name, "Pedro"); assert.equal(times.length, 1); assert.equal(times[0].swimmerId, second.body.id);
});
test("editar como organizador tampoco puede apropiarse de un nombre inscrito", async () => {
  reset(); const first = await request("POST", { name: "Ana", events: ["50-libre"] });
  await request("POST", { name: "Pedro", events: ["50-libre"] });
  assert.equal((await request("PUT", { name: "PEDRO", events: ["100-libre"] }, first.body.id, admin())).code, 409);
  assert.equal(swimmers[0].name, "Ana");
});
test("se retiró la ruta de acceso de nadadores", () => {
  assert.equal(fs.existsSync(path.join(__dirname, "../api/swimmer-login.js")), false);
  assert.equal(lib.makeSwimmerToken, undefined); assert.equal(lib.verifyPin, undefined);
});
