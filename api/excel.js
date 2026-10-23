const { getDb, isAdmin, send, handler } = require("./_lib");
const { createWorkbook } = require("./_excel");
module.exports = handler(async (req, res) => {
  if (req.method !== "GET") return send(res, 405, { error: "Excel solo está disponible para descargar. Carga los tiempos directamente en la página." });
  if (!isAdmin(req)) return send(res, 401, { error: "Entra como organizador para descargar Excel." });
  const db = await getDb();
  const swimmers = await db.collection("swimmers").find({}, { projection: { name: 1, events: 1, createdAt: 1 } }).toArray();
  const times = await db.collection("times").find({}).toArray();
  const book = await createWorkbook(swimmers, times);
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  res.status(200);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="natacion-resultados.xlsx"');
  res.end(buffer);
});
