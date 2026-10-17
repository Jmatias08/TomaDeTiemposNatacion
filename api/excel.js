const crypto = require("crypto");
const { ObjectId } = require("mongodb");
const { getDb, getClient, isAdmin, send } = require("./_lib");
const { MAX_BYTES, createWorkbook, readWorkbook, planImport, reviewToken, verifyReview, fail, formatTime } = require("./_excel");

async function snapshot(db, session) {
  const opts = session ? { session } : {};
  const swimmers = await db.collection("swimmers").find({}, { ...opts, projection: { name: 1, events: 1, createdAt: 1 } }).toArray();
  const times = await db.collection("times").find({}, opts).toArray();
  return { swimmers, times };
}

module.exports = async (req, res) => {
  try {
    if (!["GET", "POST"].includes(req.method)) return send(res, 405, { error: "Método no permitido" });
    if (!isAdmin(req)) return send(res, 401, { error: "Entra como organizador para trabajar con Excel." });
    const db = await getDb();
    if (req.method === "GET") {
      const data = await snapshot(db);
      const workbook = await createWorkbook(data.swimmers, data.times);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      res.status(200);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="natacion-series.xlsx"');
      return res.end(buffer);
    }
    const body = req.body || {};
    if (!["preview", "commit"].includes(body.action)) fail("Acción no válida.");
    if (typeof body.file !== "string" || !body.file.length || body.file.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.file) || body.file.length % 4) fail("Selecciona un archivo .xlsx válido de hasta 2 MB.", 413);
    const buffer = Buffer.from(body.file, "base64");
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const parsed = await readWorkbook(buffer);
    const data = await snapshot(db);
    const plan = planImport(parsed, data.swimmers, data.times);
    if (body.action === "preview") {
      return send(res, 200, {
        summary: plan.summary, errors: plan.errors, warnings: plan.warnings,
        changes: plan.operations.map(op => ({ at: op.at, name: op.name, eventId: op.eventId, kind: op.kind,
          before: formatTime(op.previous) || "sin tiempo", after: formatTime(op.desired) || "sin tiempo" })),
        reviewToken: !plan.errors.length && plan.operations.length ? reviewToken(plan, fileHash) : null
      });
    }
    if (plan.errors.length) fail("Hay errores en el archivo. Revisa y corrige antes de guardar.", 409);
    // A replay after a successful import is harmless, including a retry after a lost response.
    if (!plan.operations.length) return send(res, 200, { ok: true, saved: 0, message: "El archivo no tiene cambios pendientes. Los resultados ya están actualizados." });
    verifyReview(body.reviewToken, plan, fileHash);
    const session = (await getClient()).startSession();
    try {
      await session.withTransaction(async () => {
        const latest = await snapshot(db, session);
        const checked = planImport(parsed, latest.swimmers, latest.times);
        if (checked.errors.length) fail("Los datos cambiaron durante la importación. Revisa el archivo otra vez.", 409);
        verifyReview(body.reviewToken, checked, fileHash);
        // Touch the affected registrations to conflict with concurrent edits/deletes.
        const ids = [...new Set(checked.operations.map(op => op.swimmerId))].map(id => new ObjectId(id));
        await db.collection("swimmers").updateMany({ _id: { $in: ids } }, { $inc: { excelRevision: 1 } }, { session });
        const now = Date.now();
        const writes = checked.operations.map(op => {
          const filter = { eventId: op.eventId, swimmerId: op.swimmerId };
          if (op.desired === null) return { deleteOne: { filter } };
          const value = op.desired === "DNS" ? { ms: null, status: "dns" } : { ms: op.desired, status: "ok" };
          return { updateOne: { filter, update: { $set: { ...value, updatedAt: now } }, upsert: true } };
        });
        if (writes.length) await db.collection("times").bulkWrite(writes, { session, ordered: true });
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    } finally { await session.endSession(); }
    return send(res, 200, { ok: true, saved: plan.operations.length, message: plan.operations.length + " resultado(s) guardado(s)." });
  } catch (e) {
    if (e.status) return send(res, e.status, { error: e.message });
    console.error("Excel:", e);
    return send(res, 500, { error: "No se pudo completar la operación con Excel. Si estabas guardando, vuelve a revisar el mismo archivo: no se duplicarán los resultados." });
  }
};
