const { ObjectId } = require("mongodb");
function fixtures() {
  const swimmers = Array.from({ length: 6 }, (_, i) => ({ _id: new ObjectId(String(i + 1).padStart(24, "0")), name: ["Ana López", "Pedro García", "María Pérez", "Luis Gómez", "Carlos Ruiz", "=Nombre seguro"][i], events: ["50-libre", "100-libre"], createdAt: i }));
  return { swimmers, times: [] };
}
function memoryDb(initial = fixtures()) {
  let store = initial, failWrites = false, beforeTransaction = null;
  const key = x => x.eventId + ":" + x.swimmerId;
  const db = { collection(name) { return {
    find() { return { async toArray() { return store[name].map(x => ({ ...x })); } }; },
    async updateMany(filter, update) { store.swimmers.forEach(s => { if (filter._id.$in.some(id => String(id) === String(s._id))) s.excelRevision = (s.excelRevision || 0) + update.$inc.excelRevision; }); },
    async bulkWrite(ops) {
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i], value = op.updateOne || op.deleteOne, index = store.times.findIndex(t => key(t) === key(value.filter));
        if (op.deleteOne) { if (index >= 0) store.times.splice(index, 1); }
        else if (index >= 0) store.times[index] = { ...store.times[index], ...value.update.$set };
        else store.times.push({ ...value.filter, ...value.update.$set });
        if (failWrites) throw new Error("simulated write failure");
      }
    }
  }; } };
  const client = { startSession() { return {
    async withTransaction(fn) {
      if (beforeTransaction) { const hook = beforeTransaction; beforeTransaction = null; hook(store); }
      const backup = { swimmers: store.swimmers.map(s => ({ ...s })), times: store.times.map(t => ({ ...t })) };
      try { await fn(); } catch (e) { store = backup; throw e; }
    }, async endSession() {}
  }; } };
  return { db, client, get store() { return store; }, failWrites(value) { failWrites = value; }, beforeTransaction(fn) { beforeTransaction = fn; } };
}
module.exports = { fixtures, memoryDb };
