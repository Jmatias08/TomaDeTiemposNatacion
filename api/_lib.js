const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const EVENTS = [
  "25-libre", "50-libre", "100-libre", "400-libre",
  "25-mariposa", "50-mariposa",
  "25-espalda", "50-espalda",
  "25-pecho", "50-pecho",
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
  EVENTS, getDb, getClient, makeToken, isAdmin, safeEqual, send, cleanName, nameKey, cleanEvents, handler
};
