/* Crowfit: barra inferior e páginas do Award System.
   A barra só aparece na tela inicial. Trilha, Conquistas, Aparências, Troféus e Caixas trocam apenas a área da trilha:
   o topo (mascote, nível, ofensivas) não muda. Nível abre uma página própria em tela cheia.
   Lê window.S, window.CF, window.CFT, window.CFP. Não cria dados. Arte provisória marcada como TEMP. */
(function (root, f) { root.CrowWall = f(root); })(typeof self !== "undefined" ? self : this, function (root) {
"use strict";
var doc = root.document, RAR = { comum: "Comum", epica: "Épica", rara: "Rara", lendaria: "Lendária" };
var PENA = "<svg viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M20.5 3.5C13 3.2 7.4 6.6 5.6 13.2L4 19.5l.6.6 6.3-1.6C18.4 16.9 21.2 11.4 20.5 3.5z\"/><path d=\"M4.5 19.5 14 10\" stroke=\"#F5F5F5\" stroke-width=\"1.4\" stroke-linecap=\"round\" fill=\"none\"/></svg>";
var TABS = [["home", "Trilha"], ["ach", "Conquistas"], ["app", "Aparências"], ["tro", "Troféus"], ["cx", "Caixas"]];
var LABEL = { ach: "Conquistas", app: "Aparências", tro: "Troféus", cx: "Caixas" };
var CROW = {
  vazio_ach: "Nenhuma conquista. Não é pra olhar, é pra fazer.",
  vazio_tro: "Nenhum troféu. Treinar também é uma opção.",
  vazio_cx: "Nenhuma caixa ainda. Cumpra o combinado primeiro.",
  nivel: ["Nível subiu. Não se acostume.", "Mais um nível. Agora mantenha.", "Subiu. Ainda falta muito.", "Nível novo. Quero ver repetir."]
};
var page = null, sel = null, queue = [], showing = false, shownAch = [];
var lastLevel = null, lastS = null, seenPending = {}, lastTro = -1;

function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function S() { return root.S; }
function CF() { return root.CF; }
function plural(n, a, b) { return n + " " + (n === 1 ? a : b); }
function today() { return typeof root.today === "function" ? root.today() : new Date().toISOString().slice(0, 10); }
function save() { if (typeof root.save === "function") root.save(); }
function trailEl() { return doc.getElementById("trail"); }
function cat() { return (CF() && CF().ITENS) || []; }
function byItem(id) { return cat().filter(function (x) { return x.id === id; })[0] || null; }
function gotAch(id) { var s = S(); return !!(s && s.achievements && Object.prototype.hasOwnProperty.call(s.achievements, id)); }
function owned(id) { var s = S(); return !!(s && s.collection && s.collection[id]); }
function equipped() { try { return CF().aparenciaEquipada(S()); } catch (e) { return null; } }
function trophyTotal() { try { return CF().trophyCount(root.CFT.trophyRecords(root.trailCtx())); } catch (e) { return 0; } }
function lineFor(n) { return CROW.nivel[n % CROW.nivel.length]; }

/* ---------- barra inferior: só na tela inicial ---------- */
var ICONS = {
  home: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  ach: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  app: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
  tro: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" stroke="#B57F00" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path fill="#F5B301" d="M7 4h10v5a5 5 0 0 1-10 0z"/><path fill="none" d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/><path fill="#F5B301" stroke="#B57F00" d="M10.5 14h3v4h-3z"/><path fill="none" d="M8 20h8"/></svg>',
  cx: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8c-2-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3-2-5 1"/></svg>'
};
function bar() {
  var b = doc.createElement("nav"); b.className = "cw-bar"; b.setAttribute("aria-label", "Navegação principal");
  b.innerHTML = TABS.map(function (t) {
    var cls = t[0] === "tro" ? "cw-tab cw-tro" : "cw-tab";
    return '<button type="button" class="' + cls + '" data-tab="' + t[0] + '" aria-label="' + t[1] + '">' +
      '<span class="cw-ico">' + ICONS[t[0]] + (t[0] === "tro" ? '<b class="cw-badge" data-badge>0</b>' : '') + '</span><span class="cw-lbl">' + t[1] + '</span></button>';
  }).join("");
  doc.body.appendChild(b);
}
function syncBar() {
  var home = !!trailEl(); doc.body.classList.toggle("cw-home", home);
  if (!home) { page = null; return; }
  var n = trophyTotal();
  if (n !== lastTro) { lastTro = n; var bd = doc.querySelector("[data-badge]"); if (bd) bd.textContent = String(n); }
  var cur = page || "home";
  doc.querySelectorAll(".cw-bar [data-tab]").forEach(function (t) { t.setAttribute("aria-current", t.getAttribute("data-tab") === cur ? "page" : "false"); });
}

/* ---------- páginas dentro da área da trilha ---------- */
function go(t) {
  if (t === "home") { page = null; sel = null; if (typeof root.renderHome === "function") root.renderHome(); return; }
  page = t; sel = null; renderPage();
}
function renderPage() {
  var el = trailEl(); if (!el || !page || !S()) return;
  var body = page === "ach" ? viewAch() : page === "app" ? viewApp() : page === "tro" ? viewTro() : viewCx();
  el.innerHTML = '<section class="cw-page" aria-label="' + LABEL[page] + '">' + body + '<div class="cw-detail" hidden></div></section>';
  syncBar();
  if (sel) detail(sel.kind, sel.id);
}
function viewAch() {
  var list = (CF().ACH || []), n = list.filter(function (a) { return gotAch(a.id); }).length;
  return '<div class="cw-head"><h2>Conquistas</h2><span>' + n + ' de ' + list.length + '</span></div>' +
    (list.length ? '<div class="cw-grid">' + list.map(function (a) {
      var got = gotAch(a.id);
      return '<button type="button" class="cw-card' + (got ? "" : " cw-locked") + '" data-kind="ach" data-id="' + esc(a.id) + '">' +
        '<span class="cw-art">' + (got ? "★" : "?") + '</span><span class="cw-name">' + (got ? esc(a.name) : "???") + '</span>' +
        '<small>' + (got ? "Desbloqueada" : "Bloqueada") + '</small></button>';
    }).join("") + '</div>' : '<p class="cw-empty">' + esc(CROW.vazio_ach) + '</p>');
}
function viewApp() {
  var s = S(), n = Object.keys(s.collection || {}).length, eq = equipped(), it = eq && byItem(eq);
  return '<div class="cw-head"><h2>Aparências</h2><span>' + n + ' de ' + cat().length + '</span></div>' +
    '<div class="cw-preview"><div class="cw-crow"><img src="mascot.png" alt="Crow">' +
    (it ? '<span class="cw-ap">' + esc(it.nome) + ' · TEMP</span>' : '') + '</div>' +
    '<p>' + (it ? "Equipada: " + esc(it.nome) : "Nenhuma aparência equipada. Eu continuo igual, e você também.") + '</p></div>' +
    '<div class="cw-grid">' + cat().map(function (x) {
      var has = owned(x.id), e = eq === x.id;
      return '<button type="button" class="cw-card cw-' + esc(x.raridade) + (has ? "" : " cw-locked") + '" data-kind="app" data-id="' + esc(x.id) + '">' +
        '<span class="cw-swatch"></span><span class="cw-name">' + (has ? esc(x.nome) : "???") + '</span>' +
        '<small>' + esc(RAR[x.raridade] || x.raridade) + (e ? " · equipada" : "") + '</small></button>';
    }).join("") + '</div>';
}
function viewTro() {
  var names = (root.CFP && root.CFP.LIB) || {}, ids = Object.keys(names), recs = [];
  try { recs = root.CFT.trophyRecords(root.trailCtx()); } catch (e) { recs = []; }
  var rows = CF().trophyCatalog(recs, ids).sort(function (a, b) { return b.exercises - a.exercises; });
  var any = rows.some(function (r) { return r.exercises > 0; });
  return '<div class="cw-head"><h2>Troféus</h2><span>' + trophyTotal() + ' no total</span></div>' +
    (!any ? '<p class="cw-empty">' + esc(CROW.vazio_tro) + '</p>' : '') +
    '<ul class="cw-list">' + rows.map(function (r) {
      return '<li><span class="cw-li-name">' + esc(names[r.id] ? names[r.id][0] : r.id) + '</span>' +
        '<span class="cw-li-val">' + esc(plural(r.exercises, "vez", "vezes")) + ' · nível ' + r.stage + (r.next ? ' · próximo marco: ' + r.next : ' · marcos completos') + '</span></li>';
    }).join("") + '</ul>';
}
function viewCx() {
  var hist = [];
  try { hist = CF().boxHistory(S(), today()); } catch (e) { hist = []; }
  if (!hist.length) return '<div class="cw-head"><h2>Caixas</h2></div><p class="cw-empty">' + esc(CROW.vazio_cx) + '</p>';
  return '<div class="cw-head"><h2>Caixas</h2><span>' + hist.length + '</span></div><ul class="cw-list">' + hist.map(function (h) {
    var nome = h.tipo === "semanal" ? "Noz da semana de " + h.data : "Caixa mensal de " + h.data.slice(0, 7);
    var st = h.status === "aberta" ? "Aberta" : "Pronta para abrir";
    var btn = h.status === "aberta" ? "" : '<button type="button" class="cw-btn cw-primary" data-act="' + (h.tipo === "semanal" ? "noz" : "box") + '" data-box="' + esc(h.id) + '">Abrir</button>';
    return '<li class="cw-cx"><span><b>' + esc(nome) + '</b><small>' + esc(st) + (h.xp != null ? " · " + plural(h.xp, "XP", "XP") : "") + '</small></span>' + btn + '</li>';
  }).join("") + '</ul>';
}
function detail(kind, id) {
  sel = { kind: kind, id: id };
  var el = trailEl(); if (!el) return; var box = el.querySelector(".cw-detail"); if (!box) return;
  box.hidden = false;
  if (kind === "ach") {
    var a = (CF().ACH || []).filter(function (x) { return x.id === id; })[0]; if (!a) { box.hidden = true; return; }
    var got = gotAch(id), info = got ? S().achievements[id] : null;
    box.innerHTML = '<div class="cw-dcard"><div class="cw-dart' + (got ? "" : " cw-locked") + '">' + (got ? "★" : "?") + '</div>' +
      '<b>' + esc(got ? a.name : "???") + '</b><small>Ilustração provisória (TEMP)</small>' +
      (got ? '<p><b>Como foi desbloqueada:</b> ' + esc(info.reason || a.how) + '</p><p class="cw-crowq">“' + esc(a.line) + '”</p><small>Desbloqueada em ' + esc(info.day) + '</small>'
           : '<p><b>Requisito:</b> ' + esc(a.how) + '.</p><p class="cw-crowq">Ainda não. Não me faça esperar.</p>') +
      '<div class="cw-acts"><button type="button" class="cw-btn" data-act="closed">Fechar</button></div></div>';
    return;
  }
  var it = byItem(id); if (!it) { box.hidden = true; return; }
  var has = owned(id), e = equipped() === id;
  var act2 = !has ? "" : e ? '<button type="button" class="cw-btn" data-act="unequip">Desequipar</button>' : '<button type="button" class="cw-btn cw-primary" data-act="equip" data-id="' + esc(id) + '">Equipar</button>';
  box.innerHTML = '<div class="cw-dcard cw-' + esc(it.raridade) + '"><b>' + esc(has ? it.nome : "???") + '</b>' +
    '<small>' + esc(RAR[it.raridade] || it.raridade) + ' · arte provisória (TEMP)</small>' +
    '<p>' + (has ? "Obtida em caixa mensal." : "Bloqueada. Só sai de caixa mensal, e não duplica.") + '</p>' +
    '<div class="cw-acts">' + act2 + '<button type="button" class="cw-btn" data-act="closed">Fechar</button></div></div>';
}
function act(kind, el) {
  if (kind === "closed") { sel = null; var b = trailEl() && trailEl().querySelector(".cw-detail"); if (b) b.hidden = true; return; }
  if (kind === "equip" && el) { CF().equipar(S(), el.getAttribute("data-id"), new Date().toISOString()); save(); return renderPage(); }
  if (kind === "unequip") { CF().desequipar(S(), new Date().toISOString()); save(); return renderPage(); }
  if (kind === "box" && el) return openBoxNow(el.getAttribute("data-box"));
  if (kind === "noz" && el) return openNozNow(el.getAttribute("data-box"));
}
function openBoxNow(id) {
  var s = S(); var res = CF().openBox(s, id, new Date().toISOString());
  if (!res) return; save();
  var names = res.items.map(function (i) { var it = byItem(i); return it ? it.nome : i; });
  celebrate({ title: "Caixa aberta", name: plural(res.xp, "XP", "XP") + (names.length ? " e " + names.join(", ") : ""), line: names.length ? "Não é grande coisa. Mas é seu." : "Só XP desta vez. Trate de treinar mais." });
  renderPage();
}
function openNozNow(id) { var k = String(id).replace(/^noz:/, ""); if (typeof root.openNozScreen === "function") root.openNozScreen(k); }

/* ---------- nível: página própria, tela cheia ---------- */
function openLevel() {
  if (!S() || typeof root.lvlInfo !== "function") return;
  var li = root.lvlInfo(), pct = li.need ? Math.min(100, li.into / li.need * 100) : 0;
  var f = doc.createElement("div"); f.className = "cw-full"; f.setAttribute("role", "dialog"); f.setAttribute("aria-label", "Nível");
  f.innerHTML = '<div class="cf-bar cf-topbar"><button type="button" class="cf-back" data-full-close>← Voltar</button></div>' +
    '<section class="cw-level"><div class="cw-pena">' + PENA + '</div><b class="cw-lvnum">Nível ' + li.l + '</b>' +
    '<p class="cw-title">' + esc(li.title || "") + '</p><p><b>' + S().points + '</b> XP no total</p>' +
    '<div class="cw-lvbar" role="img" aria-label="Progresso do nível"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
    '<small>Faltam ' + (li.need - li.into) + ' XP para o nível ' + (li.l + 1) + '</small></section>';
  doc.body.appendChild(f);
  f.querySelector("[data-full-close]").addEventListener("click", function () { f.remove(); });
}

/* ---------- feedback: conquista nova e subida de nível ---------- */
function celebrate(item) { queue.push(item); if (!showing) next(); }
var cel = null;
function next() {
  var item = queue.shift(); if (!item) { showing = false; return; }
  showing = true;
  if (!cel) {
    cel = doc.createElement("div"); cel.className = "cw-cel"; cel.hidden = true;
    cel.innerHTML = '<div class="cw-celcard" role="alertdialog" aria-live="assertive"><div class="cw-celtag"></div><b class="cw-celname"></b><p class="cw-crowq cw-celline"></p><button type="button" class="cw-btn cw-primary" id="cw-cel-ok">Continuar</button></div>';
    doc.body.appendChild(cel);
    cel.querySelector("#cw-cel-ok").addEventListener("click", function () { cel.hidden = true; afterCel(); next(); });
  }
  cel.querySelector(".cw-celtag").textContent = item.title;
  cel.querySelector(".cw-celname").textContent = item.name;
  cel.querySelector(".cw-celline").textContent = item.line;
  cel.hidden = false;
}
function afterCel() { var s = S(); if (!s || !shownAch.length) return; CF().achAck(s, shownAch); shownAch = []; save(); }
function afterSave() {
  var s = S(), C = CF(); if (!s || !C) return;
  if (s !== lastS) { lastS = s; lastLevel = C.levelOf(s.points); }
  var lvl = C.levelOf(s.points);
  if (lastLevel !== null && lvl > lastLevel) celebrate({ title: "Subiu de nível", name: "Nível " + lvl, line: lineFor(lvl) });
  lastLevel = lvl;
  C.achPendingEvents(s).filter(function (e) { return !seenPending[e.id]; }).forEach(function (e) {
    seenPending[e.id] = true; shownAch.push(e.id);
    celebrate({ title: "Conquista desbloqueada", name: e.name, line: e.line });
  });
  if (page) renderPage();
  syncBar();
}
function onAchievement(events) {
  (events || []).forEach(function (e) {
    if (!e || e.type !== "achievement_unlocked" || seenPending[e.id]) return;
    seenPending[e.id] = true; shownAch.push(e.id);
    celebrate({ title: "Conquista desbloqueada", name: e.name, line: e.line });
  });
}

/* ---------- ligação ---------- */
function hookSave() {
  var orig = root.save; if (typeof orig !== "function" || orig.__cw) return false;
  var wrapped = function () { var r = orig.apply(this, arguments); try { afterSave(); } catch (e) { console.error("Crowfit: feedback", e); } return r; };
  wrapped.__cw = true; root.save = wrapped; return true;
}
function init() {
  bar();
  doc.addEventListener("click", function (e) {
    var tb = e.target.closest && e.target.closest(".cw-bar [data-tab]");
    if (tb) return go(tb.getAttribute("data-tab"));
    var inPage = e.target.closest && e.target.closest("#trail .cw-page"); if (!inPage) return;
    var a = e.target.closest("[data-act]"); if (a) return act(a.getAttribute("data-act"), a);
    var c = e.target.closest("[data-kind]"); if (c) return detail(c.getAttribute("data-kind"), c.getAttribute("data-id"));
  });
  root.onAchievement = onAchievement;
  setInterval(syncBar, 400);
  var tries = 0, t = setInterval(function () {
    tries++;
    if (hookSave() || tries > 100) { clearInterval(t); if (S()) { lastS = S(); lastLevel = CF().levelOf(S().points); } }
  }, 100);
}
if (doc) { if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init); else init(); }
return { go: go, openLevel: openLevel, onAchievement: onAchievement, celebrate: celebrate };
});
