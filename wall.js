/* Crowfit: Award System, interface (Etapa 7). Barra inferior fixa com quatro atalhos que abrem uma folha
   com as abas Conquistas, Aparências, Troféus e Caixas. Também mostra o feedback de conquista e de subida de nível.
   Só lê o estado real (window.S, window.CF, window.CFT, window.CFP). Não cria dados. Arte provisória marcada como TEMP.
   Não altera a lógica dos sistemas: apenas chama as funções existentes do core. */
(function (root, f) { root.CrowWall = f(root); })(typeof self !== "undefined" ? self : this, function (root) {
"use strict";
var doc = root.document, RAR = { comum: "Comum", epica: "Épica", rara: "Rara", lendaria: "Lendária" };
var ov = null, cel = null, tab = "ach", sel = null, queue = [], showing = false, shownAch = [];
var lastLevel = null, lastS = null, seenPending = {};
var CROW = {
  vazio_ach: "Nenhuma conquista. Não é pra olhar, é pra fazer.",
  vazio_tro: "Nenhum troféu. Treinar também é uma opção.",
  vazio_cx: "Nenhuma caixa ainda. Cumpra o combinado primeiro.",
  nivel: ["Nível subiu. Não se acostume.", "Mais um nível. Agora mantenha.", "Subiu. Ainda falta muito.", "Nível novo. Quero ver repetir."]
};
function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function S() { return root.S; }
function CF() { return root.CF; }
function plural(n, a, b) { return n + " " + (n === 1 ? a : b); }
function today() { return typeof root.today === "function" ? root.today() : new Date().toISOString().slice(0, 10); }
function save() { if (typeof root.save === "function") root.save(); }
function cat() { return (CF() && CF().ITENS) || []; }
function byItem(id) { return cat().filter(function (x) { return x.id === id; })[0] || null; }
function gotAch(id) { var s = S(); return !!(s && s.achievements && Object.prototype.hasOwnProperty.call(s.achievements, id)); }
function owned(id) { var s = S(); return !!(s && s.collection && s.collection[id]); }
function equipped() { try { return CF().aparenciaEquipada(S()); } catch (e) { return null; } }
function lineFor(n) { return CROW.nivel[n % CROW.nivel.length]; }

/* ---------- barra inferior ---------- */
var ICONS = {
  ach: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  app: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
  tro: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/><path d="M12 14v4M8 20h8M9 18h6"/></svg>',
  cx: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 8h18v4H3zM5 12v8h14v-8M12 8v12M12 8c-2-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3-2-5 1"/></svg>'
};
var TABS = [["ach", "Conquistas"], ["app", "Aparências"], ["tro", "Troféus"], ["cx", "Caixas"]];
function bar() {
  var b = doc.createElement("nav"); b.className = "cw-bar"; b.setAttribute("aria-label", "Conquistas, aparências, troféus e caixas");
  b.innerHTML = TABS.map(function (t) {
    return '<button type="button" class="cw-tab" data-tab="' + t[0] + '" aria-label="' + t[1] + '">' + ICONS[t[0]] + '<span>' + t[1] + '</span></button>';
  }).join("");
  doc.body.appendChild(b);
  b.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-tab]"); if (t) open(t.getAttribute("data-tab")); });
  doc.body.classList.add("cw-has-bar");
}

/* ---------- folha com abas ---------- */
function build() {
  ov = doc.createElement("div"); ov.className = "cw-ov"; ov.hidden = true;
  ov.innerHTML = '<div class="cw-sheet" role="dialog" aria-modal="true" aria-label="Conquistas e coleção">' +
    '<div class="cw-tabs" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" class="cw-st" data-stab="' + t[0] + '">' + t[1] + '</button>'; }).join("") + '</div>' +
    '<button type="button" class="cw-x" data-act="close" aria-label="Fechar">✕</button>' +
    '<div class="cw-body"></div><div class="cw-detail" hidden></div></div>';
  doc.body.appendChild(ov);
  ov.addEventListener("click", function (e) {
    if (e.target === ov) return close();
    var st = e.target.closest && e.target.closest("[data-stab]"); if (st) return open(st.getAttribute("data-stab"));
    var a = e.target.closest && e.target.closest("[data-act]"); if (a) return act(a.getAttribute("data-act"), a);
    var c = e.target.closest && e.target.closest("[data-kind]"); if (c) return detail(c.getAttribute("data-kind"), c.getAttribute("data-id"));
  });
}
function open(t) { if (!ov) build(); tab = t || "ach"; sel = null; ov.hidden = false; doc.body.classList.add("cw-open"); render(); }
function close() { if (ov) ov.hidden = true; doc.body.classList.remove("cw-open"); sel = null; }
function render() {
  if (!ov || ov.hidden) return;
  ov.querySelectorAll(".cw-st").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-stab") === tab ? "true" : "false"); });
  var body = ov.querySelector(".cw-body");
  if (!S()) { body.innerHTML = '<p class="cw-empty">Carregando seus dados…</p>'; return; }
  body.innerHTML = tab === "ach" ? viewAch() : tab === "app" ? viewApp() : tab === "tro" ? viewTro() : viewCx();
  if (sel) detail(sel.kind, sel.id);
}

/* ---------- conquistas ---------- */
function viewAch() {
  var list = (CF().ACH || []), n = list.filter(function (a) { return gotAch(a.id); }).length;
  return '<div class="cw-head"><h2>Conquistas</h2><span>' + n + ' de ' + list.length + '</span></div>' +
    (list.length ? '<div class="cw-grid">' + list.map(function (a) {
      var got = gotAch(a.id);
      return '<button type="button" class="cw-card' + (got ? "" : " cw-locked") + '" data-kind="ach" data-id="' + esc(a.id) + '">' +
        '<span class="cw-swatch cw-art">' + (got ? "★" : "?") + '</span><span class="cw-name">' + (got ? esc(a.name) : "???") + '</span>' +
        '<small>' + (got ? "Desbloqueada" : "Bloqueada") + '</small></button>';
    }).join("") + '</div>' : '<p class="cw-empty">' + esc(CROW.vazio_ach) + '</p>');
}

/* ---------- aparências (inventário e seleção) ---------- */
function viewApp() {
  var s = S(), n = Object.keys(s.collection || {}).length, eq = equipped(), it = eq && byItem(eq);
  return '<div class="cw-head"><h2>Aparências</h2><span>' + n + ' de ' + cat().length + '</span></div>' +
    '<div class="cw-preview"><div class="cw-crow"><img src="mascot.png" alt="Crow">' +
    (it ? '<span class="cw-ap cw-ap-' + esc(it.raridade) + '">' + esc(it.nome) + ' · TEMP</span>' : '') + '</div>' +
    '<p>' + (it ? "Equipada: " + esc(it.nome) : "Nenhuma aparência equipada. Eu continuo igual, e você também.") + '</p></div>' +
    '<div class="cw-grid">' + cat().map(function (x) {
      var has = owned(x.id), e = eq === x.id;
      return '<button type="button" class="cw-card cw-' + esc(x.raridade) + (has ? "" : " cw-locked") + '" data-kind="app" data-id="' + esc(x.id) + '">' +
        '<span class="cw-swatch"></span><span class="cw-name">' + (has ? esc(x.nome) : "???") + '</span>' +
        '<small>' + esc(RAR[x.raridade] || x.raridade) + (e ? " · equipada" : "") + '</small></button>';
    }).join("") + '</div>';
}

/* ---------- troféus por exercício ---------- */
function viewTro() {
  var names = (root.CFP && root.CFP.LIB) || {}, ids = Object.keys(names), recs = [];
  try { recs = root.CFT.trophyRecords(root.trailCtx()); } catch (e) { recs = []; }
  var rows = CF().trophyCatalog(recs, ids).sort(function (a, b) { return b.exercises - a.exercises; });
  var any = rows.some(function (r) { return r.exercises > 0; });
  return '<div class="cw-head"><h2>Troféus</h2><span>' + rows.filter(function (r) { return r.stage > 0; }).length + ' com marcos</span></div>' +
    (!any ? '<p class="cw-empty">' + esc(CROW.vazio_tro) + '</p>' : '') +
    '<ul class="cw-list">' + rows.map(function (r) {
      return '<li><span class="cw-li-name">' + esc(names[r.id] ? names[r.id][0] : r.id) + '</span>' +
        '<span class="cw-li-val">' + esc(plural(r.exercises, "vez", "vezes")) + ' · nível ' + r.stage + (r.next ? ' · próximo marco: ' + r.next : ' · marcos completos') + '</span></li>';
    }).join("") + '</ul>';
}

/* ---------- caixas: semanais (nozes) e mensais ---------- */
function viewCx() {
  var s = S(), hist = [];
  try { hist = CF().boxHistory(s, today()); } catch (e) { hist = []; }
  if (!hist.length) return '<div class="cw-head"><h2>Caixas</h2></div><p class="cw-empty">' + esc(CROW.vazio_cx) + '</p>';
  return '<div class="cw-head"><h2>Caixas</h2><span>' + hist.length + '</span></div><ul class="cw-list">' + hist.map(function (h) {
    var nome = h.tipo === "semanal" ? "Noz da semana de " + h.data : "Caixa mensal de " + h.data.slice(0, 7);
    var st = h.status === "aberta" ? "Aberta" : "Pronta para abrir";
    var btn = h.status === "aberta" ? "" : '<button type="button" class="cw-btn cw-primary" data-act="' + (h.tipo === "semanal" ? "noz" : "box") + '" data-box="' + esc(h.id) + '">Abrir</button>';
    return '<li class="cw-cx"><span><b>' + esc(nome) + '</b><small>' + esc(st) + (h.xp != null ? " · " + plural(h.xp, "XP", "XP") : "") + '</small></span>' + btn + '</li>';
  }).join("") + '</ul>';
}
function openBoxNow(id) {
  var s = S(); var res = CF().openBox(s, id, new Date().toISOString());
  if (!res) return; save();
  var names = res.items.map(function (i) { var it = byItem(i); return it ? it.nome : i; });
  celebrate({ kind: "box", title: "Caixa aberta", name: plural(res.xp, "XP", "XP") + (names.length ? " e " + names.join(", ") : ""), line: names.length ? "Não é grande coisa. Mas é seu." : "Só XP desta vez. Trate de treinar mais." });
  render();
}
function openNozNow(id) { var k = String(id).replace(/^noz:/, ""); close(); if (typeof root.openNozScreen === "function") root.openNozScreen(k); }

/* ---------- detalhes (tocar em um item) ---------- */
function detail(kind, id) {
  sel = { kind: kind, id: id }; var box = ov.querySelector(".cw-detail"); box.hidden = false;
  if (kind === "ach") {
    var a = (CF().ACH || []).filter(function (x) { return x.id === id; })[0]; if (!a) { box.hidden = true; return; }
    var got = gotAch(id), info = got ? S().achievements[id] : null;
    box.innerHTML = '<div class="cw-dcard"><div class="cw-dart' + (got ? "" : " cw-locked") + '">' + (got ? "★" : "?") + '</div>' +
      '<b>' + esc(got ? a.name : "???") + '</b><small>Ilustração provisória (TEMP)</small>' +
      (got ? '<p><b>Como foi desbloqueada:</b> ' + esc(info.reason || a.how) + '</p><p class="cw-crowq">“' + esc(a.line) + '”</p><small>Desbloqueada em ' + esc(info.day) + '</small>' : '<p><b>Requisito:</b> ' + esc(a.how) + '.</p><p class="cw-crowq">Ainda não. Não me faça esperar.</p>') +
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
  if (kind === "close") return close();
  if (kind === "closed") { sel = null; ov.querySelector(".cw-detail").hidden = true; return; }
  if (kind === "equip" && el) { var id = el.getAttribute("data-id"); CF().equipar(S(), id, new Date().toISOString()); save(); return render(); }
  if (kind === "unequip") { CF().desequipar(S(), new Date().toISOString()); save(); return render(); }
  if (kind === "box" && el) return openBoxNow(el.getAttribute("data-box"));
  if (kind === "noz" && el) return openNozNow(el.getAttribute("data-box"));
}

/* ---------- feedback: conquistas novas e subida de nível ---------- */
function celebrate(item) { queue.push(item); if (!showing) next(); }
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
/* Depois de fechar: marca as conquistas mostradas como vistas (só remove o aviso pendente). */
function afterCel() {
  var s = S(); if (!s || !shownAch.length) return;
  CF().achAck(s, shownAch); shownAch = []; save();
}
function afterSave() {
  var s = S(), C = CF(); if (!s || !C) return;
  if (s !== lastS) { lastS = s; lastLevel = C.levelOf(s.points); }
  var lvl = C.levelOf(s.points);
  if (lastLevel !== null && lvl > lastLevel) celebrate({ kind: "lvl", title: "Subiu de nível", name: "Nível " + lvl, line: lineFor(lvl) });
  lastLevel = lvl;
  var pend = C.achPendingEvents(s).filter(function (e) { return !seenPending[e.id]; });
  pend.forEach(function (e) {
    seenPending[e.id] = true; shownAch.push(e.id);
    celebrate({ kind: "ach", title: "Conquista desbloqueada", name: e.name, line: e.line });
  });
  if (open && ov && !ov.hidden) render();
}
/* Hook esperado pelo index.html: novas conquistas chegam aqui (e também ficam pendentes no estado). */
function onAchievement(events) {
  (events || []).forEach(function (e) {
    if (!e || e.type !== "achievement_unlocked" || seenPending[e.id]) return;
    seenPending[e.id] = true; shownAch.push(e.id);
    celebrate({ kind: "ach", title: "Conquista desbloqueada", name: e.name, line: e.line });
  });
}

/* ---------- ligação com o save() existente ---------- */
function hookSave() {
  var orig = root.save; if (typeof orig !== "function" || orig.__cw) return false;
  var wrapped = function () { var r = orig.apply(this, arguments); try { afterSave(); } catch (e) { console.error("Crowfit: feedback", e); } return r; };
  wrapped.__cw = true; root.save = wrapped; return true;
}
function init() {
  bar();
  root.onAchievement = onAchievement;
  var tries = 0, t = setInterval(function () {
    tries++;
    if (hookSave() || tries > 100) { clearInterval(t); if (S()) { lastS = S(); lastLevel = CF().levelOf(S().points); } }
  }, 100);
}
if (doc) { if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init); else init(); }
return { open: open, close: close, render: render, onAchievement: onAchievement, celebrate: celebrate };
});
