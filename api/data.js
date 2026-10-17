const { getDb, send, handler } = require("./_lib");

module.exports = handler(async (req, res) => {
  if (req.method !== "GET") return send(res, 405, { error: "Método no permitido" });
  const db = await getDb();
  const [swimmers, times] = await Promise.all([
    db.collection("swimmers").find({}, { projection: { name: 1, events: 1, createdAt: 1 } }).sort({ createdAt: 1 }).toArray(),
    db.collection("times").find({}).toArray()
  ]);
  // solo campos públicos: nunca el PIN ni datos internos
  send(res, 200, {
    swimmers: swimmers.map((s) => ({ id: String(s._id), name: s.name, events: s.events || [], createdAt: s.createdAt })),
    times: times.map((t) => ({ eventId: t.eventId, swimmerId: t.swimmerId, ms: t.ms }))
  });
});
