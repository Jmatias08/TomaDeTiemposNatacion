const { ObjectId } = require("mongodb");
const {
  getDb, isAdmin, swimmerIdFromReq, makeSwimmerToken, hashPin, cleanPin,
  send, cleanName, nameKey, cleanEvents, handler
} = require("./_lib");

const MAX_SWIMMERS = 1000;
const TAKEN = "Ese nombre ya está inscrito. Si eres tú, entra en «Mi inscripción» con tu PIN.";

// PIN opcional: vacío = no cambiar. Devuelve { fields } o { error }
async function pinFields(raw) {
  if (raw === undefined || raw === null || raw === "") return { fields: {} };
  const pin = cleanPin(raw);
  if (!pin) return { error: "El PIN debe tener 4 números." };
  return { fields: { ...(await hashPin(pin)), failCount: 0, lockUntil: 0 } };
}

module.exports = handler(async (req, res) => {
  const db = await getDb();
  const col = db.collection("swimmers");
  const body = req.body || {};
  const admin = isAdmin(req);

  if (req.method === "POST") {
    const name = cleanName(body.name);
    const events = cleanEvents(body.events);
    if (!name) return send(res, 400, { error: "Escribe el nombre del nadador (2 a 60 letras)." });
    if (!events) return send(res, 400, { error: "Elige al menos una prueba." });
    const pin = await pinFields(body.pin);
    if (pin.error) return send(res, 400, { error: pin.error });
    // solo el organizador puede inscribir a alguien sin PIN
    if (!admin && !pin.fields.pinHash) return send(res, 400, { error: "Elige un PIN de 4 números." });
    if ((await col.estimatedDocumentCount()) >= MAX_SWIMMERS) return send(res, 400, { error: "La lista está llena." });

    const key = nameKey(name);
    if (await col.findOne({ nameKey: key })) return send(res, 409, { error: TAKEN });
    let r;
    try {
      r = await col.insertOne({ name, nameKey: key, events, createdAt: Date.now(), failCount: 0, lockUntil: 0, ...pin.fields });
    } catch (e) {
      if (e && e.code === 11000) return send(res, 409, { error: TAKEN });
      throw e;
    }
    const id = String(r.insertedId);
    return send(res, 201, { id, token: !admin && pin.fields.pinHash ? makeSwimmerToken(id) : null });
  }

  if (req.method === "PUT" || req.method === "DELETE") {
    const id = String(req.query.id || "");
    if (!ObjectId.isValid(id)) return send(res, 400, { error: "Id no válido" });
    if (!admin && swimmerIdFromReq(req) !== id) return send(res, 403, { error: "Solo puedes modificar tu propia inscripción." });
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
    const pin = await pinFields(body.pin);
    if (pin.error) return send(res, 400, { error: pin.error });
    const key = nameKey(name);
    const other = await col.findOne({ nameKey: key });
    if (other && String(other._id) !== id) return send(res, 409, { error: TAKEN });
    try {
      await col.updateOne({ _id }, { $set: { name, nameKey: key, events, ...pin.fields } });
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
