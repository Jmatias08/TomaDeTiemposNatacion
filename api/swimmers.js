const { ObjectId } = require("mongodb");
const {
  getDb, isAdmin,
  send, cleanName, nameKey, cleanEvents, handler
} = require("./_lib");

const MAX_SWIMMERS = 1000;
const TAKEN = "Ese nombre ya está inscrito. Si necesitas corregir algún dato, comunícate con el organizador.";

module.exports = handler(async (req, res) => {
  if (!["POST", "PUT", "DELETE"].includes(req.method)) return send(res, 405, { error: "Método no permitido" });
  if (req.method !== "POST" && !isAdmin(req)) return send(res, 403, { error: "Solo el organizador puede modificar o quitar inscripciones. Comunícate con él si necesitas una corrección." });
  const db = await getDb();
  const col = db.collection("swimmers");
  const body = req.body || {};

  if (req.method === "POST") {
    const name = cleanName(body.name);
    const events = cleanEvents(body.events);
    if (!name) return send(res, 400, { error: "Escribe el nombre del nadador (2 a 60 letras)." });
    if (!events) return send(res, 400, { error: "Elige al menos una prueba." });
    if ((await col.estimatedDocumentCount()) >= MAX_SWIMMERS) return send(res, 400, { error: "La lista está llena." });

    const key = nameKey(name);
    if (await col.findOne({ nameKey: key })) return send(res, 409, { error: TAKEN });
    let r;
    try {
      r = await col.insertOne({ name, nameKey: key, events, createdAt: Date.now() });
    } catch (e) {
      if (e && e.code === 11000) return send(res, 409, { error: TAKEN });
      throw e;
    }
    const id = String(r.insertedId);
    return send(res, 201, { id });
  }

  if (req.method === "PUT" || req.method === "DELETE") {
    const id = String(req.query.id || "");
    if (!ObjectId.isValid(id)) return send(res, 400, { error: "Id no válido" });
    const _id = new ObjectId(id);
    const doc = await col.findOne({ _id });
    if (!doc) return send(res, 404, { error: "No existe ese nadador" });

    if (req.method === "DELETE") {
      await col.deleteOne({ _id });
      await db.collection("times").deleteMany({ swimmerId: id });
      return send(res, 200, { ok: true });
    }

    const name = cleanName(body.name);
    const events = cleanEvents(body.events);
    if (!name) return send(res, 400, { error: "Escribe el nombre del nadador (2 a 60 letras)." });
    if (!events) return send(res, 400, { error: "Elige al menos una prueba." });
    const key = nameKey(name);
    const other = await col.findOne({ nameKey: key });
    if (other && String(other._id) !== id) return send(res, 409, { error: TAKEN });
    try {
      await col.updateOne({ _id }, { $set: { name, nameKey: key, events } });
    } catch (e) {
      if (e && e.code === 11000) return send(res, 409, { error: TAKEN });
      throw e;
    }
    // si quitó una prueba, se borra el tiempo que tenía en ella
    await db.collection("times").deleteMany({ swimmerId: id, eventId: { $nin: events } });
    return send(res, 200, { ok: true });
  }

  send(res, 405, { error: "Método no permitido" });
});
