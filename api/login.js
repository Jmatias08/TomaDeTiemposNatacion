const { makeToken, safeEqual, send, handler } = require("./_lib");

let fails = 0, lockUntil = 0; // freno básico contra adivinar la contraseña

module.exports = handler(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  if (!process.env.ADMIN_PASSWORD) return send(res, 500, { error: "Falta ADMIN_PASSWORD en el servidor" });
  if (Date.now() < lockUntil) return send(res, 429, { error: "Demasiados intentos. Espera un minuto." });
  const pw = req.body && typeof req.body.password === "string" ? req.body.password : "";
  if (pw && safeEqual(pw, process.env.ADMIN_PASSWORD)) {
    fails = 0;
    return send(res, 200, { token: makeToken() });
  }
  if (++fails >= 5) { lockUntil = Date.now() + 60000; fails = 0; }
  await new Promise((r) => setTimeout(r, 600));
  send(res, 401, { error: "Contraseña incorrecta" });
});
