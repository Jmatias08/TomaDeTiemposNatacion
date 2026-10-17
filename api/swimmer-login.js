const { getDb, makeSwimmerToken, verifyPin, cleanName, nameKey, cleanPin, send, handler } = require("./_lib");

const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;
const BAD = "Nombre o PIN incorrecto.";

module.exports = handler(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  const name = cleanName(req.body && req.body.name);
  const pin = cleanPin(req.body && req.body.pin);
  if (!name || !pin) return send(res, 400, { error: "Escribe tu nombre y tu PIN de 4 números." });

  const col = (await getDb()).collection("swimmers");
  const doc = await col.findOne({ nameKey: nameKey(name) });
  if (!doc) { await new Promise((r) => setTimeout(r, 600)); return send(res, 401, { error: BAD }); }

  // el bloqueo se guarda en la base de datos, así vale en todas las instancias del servidor
  if ((doc.lockUntil || 0) > Date.now()) return send(res, 429, { error: "Demasiados intentos. Espera unos minutos y vuelve a intentar." });

  if (await verifyPin(pin, doc)) {
    if (doc.failCount) await col.updateOne({ _id: doc._id }, { $set: { failCount: 0, lockUntil: 0 } });
    return send(res, 200, { id: String(doc._id), name: doc.name, token: makeSwimmerToken(String(doc._id)) });
  }
  const fails = (doc.failCount || 0) + 1;
  await col.updateOne({ _id: doc._id }, { $set: fails >= MAX_FAILS ? { failCount: 0, lockUntil: Date.now() + LOCK_MS } : { failCount: fails } });
  await new Promise((r) => setTimeout(r, 600));
  send(res, 401, { error: BAD });
});
