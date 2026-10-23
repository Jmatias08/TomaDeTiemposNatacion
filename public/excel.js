(function () {
  var hooks, busy = false, message = "";
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function html() {
    return '<section class="card download-card"><button class="btn ghost" data-excel-action="download"' + (busy ? ' disabled' : '') + '>Descargar Excel</button>' + (message ? '<p role="status" class="note">' + esc(message) + '</p>' : '') + '</section>';
  }
  async function download() {
    busy = true; message = 'Preparando el archivo…'; hooks.render();
    try {
      var response = await fetch('/api/excel', { headers: { Authorization: 'Bearer ' + hooks.token() } });
      if (!response.ok) { var data = await response.json(), err = new Error(data.error || 'No se pudo descargar.'); err.status = response.status; throw err; }
      var blob = await response.blob(), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'natacion-resultados.xlsx'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      message = 'Excel descargado.';
    } catch (e) { hooks.auth(e); message = e.message || 'Revisa la conexión y vuelve a intentar.'; }
    finally { busy = false; hooks.render(); }
  }
  document.addEventListener('click', function (ev) { if (ev.target.closest('[data-excel-action="download"]') && hooks && !busy) download(); });
  window.SwimExcel = { init: function (value) { hooks = value; }, html: html, reset: function () { message = ''; } };
})();
