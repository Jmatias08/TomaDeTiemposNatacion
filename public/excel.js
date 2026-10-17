/* Excel UI. Credentials stay in the existing organizer session. */
(function () {
  "use strict";
  var hooks, file = null, preview = null, busy = false, message = "", error = false;
  var MAX_BYTES = 2 * 1024 * 1024;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function refresh() { if (hooks) hooks.render(); }
  function notice(text, bad) { message = text; error = !!bad; }
  function panel() {
    var h = '<section class="card"><h2>Tiempos desde Excel</h2>' +
      '<p class="note">Descarga un archivo con una hoja por prueba y series de 4, en orden de inscripción. Llena los tiempos, guarda el archivo y súbelo aquí para revisarlo.</p>' +
      '<div class="row"><button class="btn" data-excel-action="download"' + (busy ? ' disabled' : '') + '>Descargar Excel por series</button></div>' +
      '<p class="note">Tiempo: <strong>32.45</strong> o <strong>1:05.32</strong>. Vacío conserva el resultado. Usa la columna Acción para NO NADÓ o BORRAR. Puedes subir avances parciales. Conserva el mismo archivo durante la jornada para mantener las series.</p>' +
      '<label class="lbl" for="excel-file">Subir Excel completado (.xlsx, máximo 2 MB)</label>' +
      '<input id="excel-file" type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"' + (busy ? ' disabled' : '') + '>' +
      '<button class="btn ghost" data-excel-action="choose"' + (busy ? ' disabled' : '') + '>' + (file ? 'Cambiar archivo' : 'Seleccionar archivo') + '</button>';
    if (file) h += '<p class="note">Archivo seleccionado: <strong>' + esc(file.name) + '</strong></p>';
    h += '<div class="row" style="margin-top:12px"><button class="btn ghost" data-excel-action="preview"' + (!file || busy ? ' disabled' : '') + '>Revisar archivo</button></div>';
    if (busy) h += '<p role="status">Procesando… Mantén esta página abierta.</p>';
    if (message) h += '<p role="status" class="msg ' + (error ? 'err' : 'ok') + '">' + esc(message) + '</p>';
    if (preview) {
      var s = preview.summary;
      h += '<h3>Revisión antes de publicar</h3><p>' + s.nuevos + ' nuevos · ' + s.correcciones + ' correcciones · ' + s.borrados + ' borrados · ' + s.noNado + ' no nadó · ' + s.sinCambios + ' sin cambios · ' + s.vacios + ' vacíos.</p>';
      if (preview.errors.length) {
        h += '<p class="msg err">Hay ' + preview.errors.length + ' error(es). No se guardará ningún cambio hasta corregirlos y revisar el archivo otra vez.</p>' + issues(preview.errors, 'Errores');
      }
      if (preview.warnings.length) h += issues(preview.warnings, 'Avisos');
      if (preview.changes.length) {
        h += '<details open><summary>Ver los ' + preview.changes.length + ' cambios</summary><div class="excel-scroll"><table class="excel-table"><caption>Cambios propuestos en los resultados</caption><thead><tr><th>Nadador / prueba</th><th>Actual</th><th>Al guardar</th></tr></thead><tbody>';
        preview.changes.forEach(function (c) {
          h += '<tr><td>' + esc(c.name) + '<br><small>' + esc(c.at) + '</small></td><td>' + esc(c.before) + '</td><td>' + esc(c.after) + '</td></tr>';
        });
        h += '</tbody></table></div></details>';
      }
      if (preview.reviewToken) h += '<p class="note">Al confirmar se publican exactamente estos cambios. Si los datos cambian mientras revisas, se pedirá una nueva revisión.</p><div class="row"><button class="btn" data-excel-action="commit"' + (busy ? ' disabled' : '') + '>Confirmar y publicar ' + preview.changes.length + ' cambios</button><button class="btn ghost" data-excel-action="cancel"' + (busy ? ' disabled' : '') + '>Cancelar revisión</button></div>';
      else if (!preview.errors.length) h += '<p class="note">No hay cambios pendientes para publicar.</p>';
    }
    return h + '</section>';
  }
  function issues(list, title) {
    return '<details open><summary>' + esc(title) + ' (' + list.length + ')</summary><ul class="excel-issues">' + list.map(function (e) {
      return '<li><strong>' + esc(e.at) + ':</strong> ' + esc(e.message) + '</li>';
    }).join('') + '</ul></details>';
  }
  async function download() {
    busy = true; notice('Preparando el Excel…'); refresh();
    try {
      var response = await fetch('/api/excel', { headers: { Authorization: 'Bearer ' + hooks.token() } });
      if (!response.ok) {
        var data = await response.json(); var err = new Error(data.error || 'No se pudo descargar el archivo.'); err.status = response.status; throw err;
      }
      var blob = await response.blob(), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'natacion-series.xlsx'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      notice('Excel descargado. Guarda una copia antes de empezar a llenar los tiempos.');
    } catch (e) { hooks.auth(e); notice(e.message || 'No se pudo descargar. Revisa tu conexión.', true); }
    finally { busy = false; refresh(); }
  }
  async function process(action) {
    if (busy || !file || (action === 'commit' && (!preview || !preview.reviewToken))) return;
    var selected = file, review = preview && preview.reviewToken;
    busy = true; notice(action === 'commit' ? 'Guardando resultados…' : 'Revisando el archivo…'); refresh();
    try {
      var result = await hooks.api('/api/excel', { method: 'POST', body: { action: action, file: selected.base64, reviewToken: review } });
      if (action === 'preview') {
        preview = result;
        notice(result.errors.length ? 'Corrige los errores en Excel, guarda el archivo y vuelve a seleccionarlo.' : 'Revisión completada. Todavía no se ha publicado ningún cambio.', !!result.errors.length);
      } else {
        preview = null;
        notice(result.message);
        await hooks.load();
      }
    } catch (e) {
      hooks.auth(e);
      if (action === 'commit') preview = null;
      notice((e.message === 'Error' ? 'No se pudo completar la operación.' : e.message) + (action === 'commit' ? ' Vuelve a revisar el mismo archivo para comprobar qué falta; no se duplicarán los resultados.' : ''), true);
    } finally { busy = false; refresh(); }
  }
  document.addEventListener('change', function (ev) {
    if (ev.target.id !== 'excel-file' || !hooks) return;
    var selected = ev.target.files[0];
    if (!selected) return;
    file = null; preview = null; message = '';
    if (!/\.xlsx$/i.test(selected.name) || selected.size > MAX_BYTES || !selected.size) { notice('Selecciona un archivo .xlsx de hasta 2 MB. No se aceptan CSV, XLS ni archivos con macros.', true); refresh(); return; }
    busy = true; refresh();
    var reader = new FileReader();
    reader.onload = function () { file = { name: selected.name, base64: String(reader.result).split(',')[1] }; busy = false; notice('Archivo listo para revisar. Si lo vuelves a editar en Excel, selecciónalo nuevamente.'); refresh(); };
    reader.onerror = function () { busy = false; notice('No se pudo leer el archivo. Selecciónalo otra vez.', true); refresh(); };
    reader.readAsDataURL(selected);
  });
  document.addEventListener('click', function (ev) {
    var button = ev.target.closest('[data-excel-action]');
    if (!button || busy || !hooks) return;
    var action = button.getAttribute('data-excel-action');
    if (action === 'choose') { var input = document.getElementById('excel-file'); input.value = ''; input.click(); }
    else if (action === 'download') download();
    else if (action === 'preview' || action === 'commit') process(action);
    else if (action === 'cancel') { preview = null; notice('Revisión cancelada. No se publicaron cambios.'); refresh(); }
  });
  window.SwimExcel = { init: function (value) { hooks = value; }, html: panel, reset: function () { file = null; preview = null; message = ''; } };
})();
