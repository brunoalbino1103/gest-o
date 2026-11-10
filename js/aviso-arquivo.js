// Se a página foi aberta com dois cliques (file://), o navegador bloqueia os módulos do sistema.
// Mostra como abrir do jeito certo em vez de ficar parado em "Carregando".
(function () {
  if (location.protocol !== 'file:') return;
  function mostrar() {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#F5F7FA;display:grid;place-items:center;padding:16px;font:15px Poppins,system-ui,sans-serif;color:#1f2937';
    d.innerHTML = '<div style="max-width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:24px;line-height:1.6">' +
      '<h2 style="margin:0 0 8px;font-size:19px">Abra o sistema pelo atalho</h2>' +
      '<p style="margin:0 0 12px">Aberto com dois cliques, o navegador bloqueia o sistema por segurança e a tela fica parada em "Carregando".</p>' +
      '<p style="margin:0">Na pasta do sistema, dê dois cliques em <b>Abrir sistema.bat</b>. Ele abre o navegador no endereço certo (<b>http://localhost:8766</b>). Deixe a janela preta aberta enquanto usa.</p></div>';
    document.body.appendChild(d);
  }
  if (document.body) mostrar(); else document.addEventListener('DOMContentLoaded', mostrar);
})();
