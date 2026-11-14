/* Crowfit: menu do Crow. Abre ao tocar no mascote e mostra: o corvo no galho, nível (pena), ofensivas,
   as conquistas mais recentes e os troféus com mais marcos. A engrenagem abre as configurações existentes.
   Expõe window.CrowMenu.open(ancora, dados) e CrowMenu.close(). Os dados vêm de index.html (crowData). */
(function (root, f) { root.CrowMenu = f(root); })(typeof self !== "undefined" ? self : this, function (root) {
"use strict";
var doc = root.document, ov = null, opener = null, data = null, screen = "main";
var ICO = {
  feather: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M20.5 3.5C13 3.2 7.4 6.6 5.6 13.2L4 19.5l.6.6 6.3-1.6C18.4 16.9 21.2 11.4 20.5 3.5z"/><path d="M4.5 19.5 14 10" stroke="#F5F5F5" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/><path d="M12 14v4M8 20h8M9 18h6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 16.9l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  branch: '<svg class="cm-branch" viewBox="0 0 320 60" aria-hidden="true"><path d="M10 40C90 30 200 52 310 26" fill="none" stroke="#5B4A3A" stroke-width="9" stroke-linecap="round"/><path d="M222 44l34-22M118 46l-6-24" fill="none" stroke="#5B4A3A" stroke-width="5" stroke-linecap="round"/></svg>'
};
function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

function listOf(items, empty, row) {
  if (!items.length) return '<p class="cm-empty">' + esc(empty) + '</p>';
  return '<ul class="cm-list">' + items.map(row).join("") + '</ul>';
}
function achRow(a) { return '<li><span class="cm-ico">★</span><span><b>' + esc(a.name) + '</b><small>' + esc(a.day) + '</small></span></li>'; }
function troRow(t) { return '<li><span class="cm-ico">' + ICO.trophy + '</span><span><b>' + esc(t.name) + '</b><small>' + esc(plural(t.count, "vez", "vezes")) + ' · nível ' + t.stage + '</small></span></li>'; }

function mainHtml() {
  return '<div class="cm-perch"><img class="cm-crow" src="mascot.png" alt="Crow, o corvo mascote">' + ICO.branch + '</div>' +
    '<div class="cm-stats">' +
      '<button type="button" class="cm-stat cm-lvl" id="cm-lvl" aria-label="Ver nível e XP">' + ICO.feather + '<b>Nv ' + data.level + '</b></button>' +
      '<div class="cm-stat" title="Ofensiva atual">🔥<b>' + data.streak + '</b><small>' + esc(plural(data.streak, "dia", "dias")) + ' · melhor ' + data.best + '</small></div>' +
    '</div>' +
    '<section class="cm-panel" aria-label="Destaques">' +
      '<h3>Conquistas</h3>' + listOf(data.ach, "Nenhuma conquista ainda.", achRow) +
      '<h3>Troféus</h3>' + listOf(data.tro, "Nenhum troféu ainda.", troRow) +
    '</section>';
}
function levelHtml() {
  var pct = data.need ? Math.min(100, data.into / data.need * 100) : 0;
  return '<button type="button" class="cm-back" id="cm-back" aria-label="Voltar">← Voltar</button>' +
    '<section class="cm-level" aria-label="Nível">' +
      '<div class="cm-big">' + ICO.feather + '<b>Nível ' + data.level + '</b></div>' +
      '<p class="cm-cat">' + esc(data.title) + '</p>' +
      '<p><b>' + data.points + '</b> XP no total</p>' +
      '<div class="cm-bar" role="img" aria-label="Progresso do nível"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      '<small>Faltam ' + (data.need - data.into) + ' XP para o nível ' + (data.level + 1) + '</small>' +
    '</section>';
}
function render() {
  if (!ov) return;
  ov.querySelector("#cm-body").innerHTML = screen === "level" ? levelHtml() : mainHtml();
  var lvl = ov.querySelector("#cm-lvl"), back = ov.querySelector("#cm-back");
  if (lvl) lvl.onclick = function () { screen = "level"; render(); ov.querySelector("#cm-back").focus(); };
  if (back) back.onclick = function () { screen = "main"; render(); ov.querySelector("#cm-lvl").focus(); };
}
function build() {
  ov = doc.createElement("div");
  ov.id = "cm-overlay"; ov.className = "cm-overlay"; ov.hidden = true;
  ov.innerHTML = '<div class="cm-dialog" role="dialog" aria-modal="true" aria-label="Meu Crow">' +
    '<div class="cm-top"><span class="cm-title">Crow</span>' +
      '<button type="button" class="cm-gear" id="cm-gear" aria-label="Configurações">' + ICO.gear + '</button>' +
      '<button type="button" class="cm-close" id="cm-close" aria-label="Fechar">✕</button></div>' +
    '<div id="cm-body"></div></div>';
  doc.body.appendChild(ov);
  ov.querySelector("#cm-close").onclick = function () { close(true); };
  ov.querySelector("#cm-gear").onclick = function () {
    close(false);
    if (root.CrowfitProfile && root.CrowfitProfile.openSettings) root.CrowfitProfile.openSettings(opener);
  };
  ov.addEventListener("click", function (e) { if (e.target === ov) close(true); });
  ov.addEventListener("keydown", function (e) { if (e.key === "Escape") close(true); });
}
function open(anchor, d) {
  if (!doc) return;
  if (!ov) build();
  data = d || { level: 1, points: 0, into: 0, need: 200, title: "Iniciante", streak: 0, best: 0, ach: [], tro: [] };
  opener = anchor || null; screen = "main";
  render(); ov.hidden = false;
  ov.querySelector("#cm-close").focus();
}
function close(restore) {
  if (!ov || ov.hidden) return;
  ov.hidden = true;
  if (restore && opener && opener.focus) { try { opener.focus(); } catch (e) {} }
}
return { open: open, close: close };
});
