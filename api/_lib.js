const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const EVENTS = [
  "50-libre", "100-libre", "200-libre",
  "50-espalda", "100-espalda",
  "50-pecho", "100-pecho",
  "50-mariposa", "100-mariposa",
  "100-combinado"
];

/* ---------- Mongo (conexión reutilizada entre llamadas) ---------- */
let clientPromise = global._swimMongo;
async function getDb() {
  if (!process.env.MONGODB_URI) throw new Error("Falta la variable MONGODB_URI");
  if (!clientPromise) {
    clientPromise = global._swimMongo = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 })
      .connect()
      .catch((e) => { global._swimMongo = clientPromise = null; throw e; });
  }
  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || "natacion");
  if (!global._swimIndexes) {
    global._swimIndexes = Promise.all([
      db.collection("times").createIndex({ eventId: 1, swimmerId: 1 }, { unique: true }),
      db.collection("swimmers").createIndex({ nameKey: 1 }, { unique: true })
    ]).catch(() => {});
  }
  await global._swimIndexes;
  return db;
}
async function getClient() { await getDb(); return clientPromise; }

/* ---------- Sesión de organizador (token firmado, 12 h) ---------- */
function secret() {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("Falta ADMIN_PASSWORD o SESSION_SECRET");
  return s;
}
function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function makeToken() {
  const exp = String(Date.now() + 12 * 60 * 60 * 1000);
  return exp + "." + sign("a:" + exp);
}
function isAdmin(req) {
  const h = req.headers["authorization"] || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const i = t.indexOf(".");
  if (i < 1) return false;
  const exp = t.slice(0, i), sig = t.slice(i + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign("a:" + exp));
}

/* ---------- Sesión de nadador (token firmado, 12 h) ---------- */
function makeSwimmerToken(id) {
  const exp = String(Date.now() + 12 * 60 * 60 * 1000);
  return id + "." + exp + "." + sign("s:" + id + ":" + exp);
}
function swimmerIdFromReq(req) {
  const parts = String(req.headers["x-swimmer-token"] || "").split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  if (!/^[a-f0-9]{24}$/.test(id) || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  return safeEqual(sig, sign("s:" + id + ":" + exp)) ? id : null;
}

/* ---------- PIN (se guarda cifrado con scrypt) ---------- */
const scrypt = (pin, salt) => new Promise((res, rej) => crypto.scrypt(pin, salt, 32, (e, k) => (e ? rej(e) : res(k))));
async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(pin, salt);
  return { pinSalt: salt.toString("hex"), pinHash: h.toString("hex") };
}
async function verifyPin(pin, doc) {
  if (!doc || !doc.pinSalt || !doc.pinHash) return false;
  const h = await scrypt(pin, Buffer.from(doc.pinSalt, "hex"));
  return crypto.timingSafeEqual(h, Buffer.from(doc.pinHash, "hex"));
}
function cleanPin(v) {
  return typeof v === "string" && /^\d{4}$/.test(v) ? v : null;
}

/* ---------- Utilidades ---------- */
function send(res, status, body) {
  res.status(status).setHeader("Cache-Control", "no-store");
  res.json(body);
}
function cleanName(v) {
  if (typeof v !== "string") return null;
  const n = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return n.length >= 2 && n.length <= 60 ? n : null;
}
function nameKey(n) {
  return n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function cleanEvents(v) {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v)].filter((e) => EVENTS.includes(e));
  return out.length ? out : null;
}
function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error(e);
      send(res, 500, { error: "Error del servidor" });
    }
  };
}

module.exports = {
  EVENTS, getDb, getClient, makeToken, isAdmin, safeEqual, send, cleanName, nameKey, cleanEvents, handler,
  makeSwimmerToken, swimmerIdFromReq, hashPin, verifyPin, cleanPin
};
