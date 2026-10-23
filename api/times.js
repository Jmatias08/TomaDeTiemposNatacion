const { ObjectId } = require("mongodb");
const { EVENTS, getDb, isAdmin, send, handler } = require("./_lib");

module.exports = handler(async (req, res) => {
  if (req.method !== "PUT") return send(res, 405, { error: "Método no permitido" });
  if (!isAdmin(req)) return send(res, 401, { error: "Necesitas la contraseña de organizador" });

  const { eventId, swimmerId, ms, status } = req.body || {};
  if (status !== undefined && status !== "ok") return send(res, 400, { error: "Estado no válido. Guarda un tiempo o deja el resultado sin tiempo." });
  if (!EVENTS.includes(eventId)) return send(res, 400, { error: "Prueba no válida" });
  if (typeof swimmerId !== "string" || !ObjectId.isValid(swimmerId)) return send(res, 400, { error: "Nadador no válido" });

  const db = await getDb();
  const swimmer = await db.collection("swimmers").findOne({ _id: new ObjectId(swimmerId) });
  if (!swimmer || !(swimmer.events || []).includes(eventId)) return send(res, 400, { error: "Ese nadador no está en esa prueba" });

  const filter = { eventId, swimmerId };
  if (ms === null) {
    await db.collection("times").deleteOne(filter);
    return send(res, 200, { ok: true });
  }
  if (!Number.isInteger(ms) || ms <= 0 || ms >= 3600000) return send(res, 400, { error: "Tiempo no válido" });
  await db.collection("times").updateOne(filter, { $set: { ms, status: "ok", updatedAt: Date.now() } }, { upsert: true });
  send(res, 200, { ok: true });
});
