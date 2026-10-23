(function (root) {
  'use strict';
  function parse(value) {
    var text = String(value).trim().replace(',', '.');
    if (!text) return null;
    var m = text.match(/^(?:(\d{1,2}):)?(\d{1,4})(?:\.(\d{1,2}))?$/);
    if (!m) return NaN;
    var minutes = +(m[1] || 0), seconds = +m[2];
    if (m[1] && m[2].length > 2) return NaN;
    if (!m[1] && m[2].length > 2) { minutes = +m[2].slice(0, -2); seconds = +m[2].slice(-2); }
    if ((m[1] || m[2].length > 2) && seconds >= 60) return NaN;
    var ms = (minutes * 60 + seconds) * 1000 + +(m[3] || '').padEnd(2, '0') * 10;
    return ms > 0 && ms < 3600000 ? ms : NaN;
  }
  function format(ms) {
    var cs = Math.round(ms / 10), min = Math.floor(cs / 6000), sec = Math.floor(cs / 100) % 60;
    return (min ? min + ':' + String(sec).padStart(2, '0') : sec) + '.' + String(cs % 100).padStart(2, '0');
  }
  function description(ms) {
    if (ms === null) return 'Escribe un tiempo y presiona Guardar o Enter.';
    if (Number.isNaN(ms)) return 'Revisa el tiempo: debe ser mayor que cero. Ej.: 32.5, 100.00 o 1:05.32.';
    var min = Math.floor(ms / 60000), seconds = ((ms % 60000) / 1000).toFixed(2);
    return min ? min + ' min ' + seconds.padStart(5, '0') + ' s' : seconds + ' segundos';
  }
  function preview(value) {
    return /^0{1,2}(?:[.,]0{1,2})?$/.test(String(value).trim()) ? '0.00 segundos · ingresá un tiempo mayor que cero.' : description(parse(value));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { parse: parse, format: format, description: description, preview: preview };
  if (!root.document) return;
  var hooks, eventId = '', search = '', pendingOnly = false, drafts = {}, messages = {}, saving = {}, confirmation = null;
  try { drafts = JSON.parse(sessionStorage.getItem('swim_time_drafts') || '{}') || {}; } catch (e) { drafts = {}; }
  if (typeof drafts !== 'object' || Array.isArray(drafts)) drafts = {};
  function persist() { try { sessionStorage.setItem('swim_time_drafts', JSON.stringify(drafts)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function key(sid) { return eventId + '__' + sid; }
  function hasDraft(k) { return Object.prototype.hasOwnProperty.call(drafts, k); }
  function people() { return hooks.swimmers().filter(function (s) { return (s.events || []).indexOf(eventId) >= 0; }); }
  function saved(sid) { return hooks.time(eventId, sid) !== null; }
  function raw(sid) { var k = key(sid), time = hooks.time(eventId, sid); return hasDraft(k) ? drafts[k] : time !== null ? format(time) : ''; }
  function html() {
    if (!eventId) eventId = (hooks.events.filter(function (e) { return hooks.swimmers().some(function (s) { return (s.events || []).indexOf(e.id) >= 0; }); })[0] || hooks.events[0]).id;
    var all = people(), completed = all.filter(function (s) { return saved(s.id); }).length;
    var ev = hooks.events.filter(function (e) { return e.id === eventId; })[0];
    var h = '<section class="capture-head"><div class="capture-eyebrow">ORGANIZADOR</div><h2>Cargar tiempos</h2><p>Elegí una prueba y cargá a quien acaba de nadar. Sin series asignadas ni orden de salida.</p>';
    h += '<div class="capture-tools"><div><label class="lbl" for="capture-event">Prueba</label><select id="capture-event">';
    hooks.events.forEach(function (e) { h += '<option value="' + e.id + '"' + (e.id === eventId ? ' selected' : '') + '>' + esc(e.name) + ' · ' + hooks.swimmers().filter(function (s) { return (s.events || []).indexOf(e.id) >= 0; }).length + ' inscritos</option>'; });
    h += '</select></div><div><label class="lbl" for="capture-search">Buscar nadador</label><input id="capture-search" type="search" placeholder="Escribí su nombre…" value="' + esc(search) + '"></div></div>';
    h += '<div class="capture-progress"><span><strong>' + completed + '</strong> de ' + all.length + ' registrados</span><label><input id="capture-pending" type="checkbox"' + (pendingOnly ? ' checked' : '') + '> Solo pendientes</label></div>';
    h += '</section><div class="capture-guide"><span><b>Segundos</b> 32.5 → 32.50 s</span><span><b>Minutos</b> 100.00 → 1:00.00</span><span>También podés escribir 1:05.32</span></div>';
    var needle = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    var list = all.filter(function (s) { return (!pendingOnly || !saved(s.id) || hasDraft(key(s.id))) && s.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().indexOf(needle) >= 0; });
    list.sort(function (a, b) { return a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id); });
    h += '<div class="capture-list-heading"><h3>' + esc(ev.name) + '</h3><span>' + list.length + ' nadadores a la vista</span></div>';
    if (!list.length) h += '<div class="empty">' + (!all.length ? 'Todavía no hay inscritos en esta prueba.' : 'No hay nadadores que coincidan con este filtro.') + '</div>';
    h += '<div class="capture-grid">';
    list.forEach(function (s) {
      var k = key(s.id), time = hooks.time(eventId, s.id), draft = hasDraft(k), value = raw(s.id), msg = messages[k];
      h += '<article class="capture-card' + (draft ? ' has-draft' : '') + '"><div class="capture-person"><h4>' + esc(s.name) + '</h4><span class="capture-state' + (saved(s.id) ? ' done' : '') + '">' + (draft ? 'Sin guardar' : time !== null ? 'Registrado' : 'Sin tiempo') + '</span></div>';
      h += '<div class="capture-current"><span>EN RESULTADOS</span><strong>' + (time !== null ? format(time) : 'Sin tiempo') + '</strong></div>';
      h += '<label class="lbl" for="capture-' + s.id + '">' + (saved(s.id) ? 'Anotar o corregir tiempo' : 'Tiempo del nadador') + '</label><div class="capture-entry"><input id="capture-' + s.id + '" class="capture-time" data-capture-sid="' + s.id + '" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="32.50 / 100.00" value="' + esc(value) + '" aria-describedby="capture-hint-' + s.id + '"' + (saving[k] ? ' disabled' : '') + '><button class="btn" data-capture="save" data-sid="' + s.id + '"' + (saving[k] ? ' disabled' : '') + '>' + (saving[k] ? 'Guardando…' : 'Guardar') + '</button></div>';
      h += '<p id="capture-hint-' + s.id + '" class="capture-hint">' + esc(preview(value)) + '</p>';
      h += '<div class="capture-actions">';
      if (saved(s.id)) h += '<button class="capture-link danger-text" data-capture="clear" data-sid="' + s.id + '"' + (saving[k] ? ' disabled' : '') + '>Borrar resultado</button>';
      if (draft) h += '<button class="capture-link" data-capture="discard" data-sid="' + s.id + '">Descartar cambio</button>';
      h += '</div>';
      if (confirmation && confirmation.key === k) h += '<div class="capture-confirm">¿Borrar este resultado? Quedará sin tiempo.<div class="row"><button class="btn sm" data-capture="confirm" data-sid="' + s.id + '">Confirmar</button><button class="btn ghost sm" data-capture="cancel">Cancelar</button></div></div>';
      if (msg) h += '<p role="status" class="msg ' + (msg.error ? 'err' : 'ok') + '">' + esc(msg.text) + '</p>';
      h += '</article>';
    });
    return h + '</div><p class="note capture-foot">Se guarda cada nadador por separado. Si la conexión falla, el tiempo escrito permanece para volver a intentar.</p>';
  }
  async function save(sid, action) {
    var selected = eventId, k = key(sid);
    if (saving[k]) return;
    var ms = action === 'save' ? parse(raw(sid)) : null;
    if (action === 'save' && (ms === null || Number.isNaN(ms))) { messages[k] = { error: true, text: description(ms === null ? NaN : ms) }; hooks.render(); return; }
    saving[k] = true; delete messages[k]; confirmation = null; hooks.render();
    try {
      await hooks.api('/api/times', { method: 'PUT', body: { eventId: selected, swimmerId: sid, ms: ms } });
      hooks.saved(selected, sid, ms, ms === null ? null : 'ok');
      delete drafts[k]; persist();
      messages[k] = { text: action === 'clear' ? 'Resultado borrado. Queda sin tiempo.' : 'Guardado · ' + description(ms) };
    } catch (e) {
      hooks.auth(e);
      messages[k] = { error: true, text: (e.message || 'No se pudo guardar.') + ' El resultado no se confirmó. Revisá la conexión y volvé a intentar.' };
    } finally { saving[k] = false; hooks.render(); }
  }
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (!hooks) return;
    if (t.id === 'capture-search') { search = t.value; hooks.render(); return; }
    if (!t.matches || !t.matches('[data-capture-sid]')) return;
    var sid = t.getAttribute('data-capture-sid'), k = key(sid);
    drafts[k] = t.value; delete messages[k]; persist();
    var hint = document.getElementById('capture-hint-' + sid); if (hint) hint.textContent = preview(t.value);
    var card = t.closest('.capture-card'); if (card) { card.classList.add('has-draft'); var state = card.querySelector('.capture-state'); if (state) state.textContent = 'Sin guardar'; }
  });
  document.addEventListener('change', function (ev) {
    if (!hooks) return;
    if (ev.target.id === 'capture-event') { eventId = ev.target.value; search = ''; confirmation = null; hooks.render(); }
    if (ev.target.id === 'capture-pending') { pendingOnly = ev.target.checked; hooks.render(); }
  });
  document.addEventListener('click', function (ev) {
    var button = ev.target.closest('[data-capture]'); if (!button || !hooks) return;
    var action = button.getAttribute('data-capture'), sid = button.getAttribute('data-sid'), k = key(sid);
    if (action === 'save') save(sid, action);
    else if (action === 'clear') { confirmation = { key: k, action: action }; hooks.render(); }
    else if (action === 'confirm' && confirmation && confirmation.key === k) save(sid, confirmation.action);
    else if (action === 'cancel') { confirmation = null; hooks.render(); }
    else if (action === 'discard') { delete drafts[k]; delete messages[k]; persist(); hooks.render(); }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('[data-capture-sid]')) { ev.preventDefault(); save(ev.target.getAttribute('data-capture-sid'), 'save'); } });
  root.SwimCapture = { init: function (value) { hooks = value; }, html: html, reset: function () { confirmation = null; search = ''; messages = {}; } };
})(typeof window === 'undefined' ? globalThis : window);
