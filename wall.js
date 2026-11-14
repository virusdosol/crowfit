/* Crowfit: barra inferior, páginas independentes em tela cheia, balões dos ícones, nível e visão do perfil.
   Conquistas, nozes e troféus aparecem como ícones; ao tocar, um balão mostra o que é.
   Lê window.S, window.CF, window.CFT, window.CFP e window.CrowfitProfile. Não cria dados. Arte provisória marcada como TEMP. */
(function (root, f) { root.CrowWall = f(root); })(typeof self !== "undefined" ? self : this, function (root) {
"use strict";
var doc = root.document, RAR = { comum: "Comum", epica: "Épica", rara: "Rara", lendaria: "Lendária" };
var I = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  medal: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><circle cx="12" cy="9" r="6"/><path d="M8.5 14.2 7 21l5-2.5 5 2.5-1.5-6.8"/></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
  // noz descascada: casca aberta com a semente à mostra
  noz: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2.8c-4.6 0-7.6 3.6-7.6 8.2 0 3.9 2.3 6.9 4.7 8.4.8.5 1.6.5 2.3 0 .5-.3 1-.3 1.5 0 .7.5 1.5.5 2.3 0 2.4-1.5 4.8-4.5 4.8-8.4 0-4.6-3-8.2-7.9-8.2z"/><path d="M8.6 9.2c1.3 1.1 1.4 3.6.2 5.2M15.4 9.2c-1.3 1.1-1.4 3.6-.2 5.2"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/><path d="M12 14v4M8 20h8M9 18h6"/></svg>',
  crow: '<img src="mascot.png" alt="Crow">'
};
var TABS = [["home", "home", "Trilha"], ["ach", "medal", "Conquistas"], ["app", "grid", "Aparências"], ["noz", "noz", "Nozes"]];
var CROW = {
  vazio_ach: "Nenhuma conquista ainda. Não é pra olhar, é pra fazer.",
  vazio_tro: "Nenhum troféu. Treinar também é uma opção.",
  vazio_noz: "Nenhuma noz ainda. Cumpra o combinado primeiro.",
  nivel: ["Nível subiu. Não se acostume.", "Mais um nível. Agora mantenha.", "Subiu. Ainda falta muito.", "Nível novo. Quero ver repetir."]
};
var curPage = null, sel = null, queue = [], showing = false, shownAch = [];
var lastLevel = null, lastS = null, seenPending = {}, lastTro = -1, cel = null;

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
function trophyRecs() { try { return root.CFT.trophyRecords(root.trailCtx()); } catch (e) { return []; } }
function trophyRows() { var names = (root.CFP && root.CFP.LIB) || {}; try { return CF().trophyCatalog(trophyRecs(), Object.keys(names)).map(function (r) { r.name = names[r.id] ? names[r.id][0] : r.id; return r; }); } catch (e) { return []; } }
function trophyTotal() { try { return CF().trophyCount(trophyRecs()); } catch (e) { return 0; } }
function nozCount() { return Object.keys((S() && S().nozes) || {}).length; }
function achList() { return (CF().ACH || []); }
function unlockedAch() { var s = S(); return Object.keys((s && s.achievements) || {}).map(function (id) { return { id: id, info: s.achievements[id] }; }).sort(function (a, b) { return String(b.info.at).localeCompare(String(a.info.at)); }); }
function lineFor(n) { return CROW.nivel[n % CROW.nivel.length]; }

/* Ícone do nível: só o número dentro de um anel, sem texto. */
function lvIco(n) {
  var fs = String(n).length > 2 ? 11 : 15;
  return '<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" stroke-width="2.2"/><text x="18" y="23.5" text-anchor="middle" font-size="' + fs + '" font-weight="800" font-family="Nunito,system-ui,sans-serif" fill="currentColor">' + esc(n) + '</text></svg>';
}

/* ---------- barra inferior: só ícones ---------- */
function bar() {
  var b = doc.createElement("nav"); b.className = "cw-bar"; b.setAttribute("aria-label", "Navegação principal");
  b.innerHTML = TABS.map(function (t) {
    return '<button type="button" class="cw-tab" data-tab="' + t[0] + '" aria-label="' + t[2] + '" title="' + t[2] + '"><span class="cw-ico">' + I[t[1]] + '</span></button>';
  }).join("");
  doc.body.appendChild(b);
}
function syncBar() {
  var home = !!doc.getElementById("trail"); doc.body.classList.toggle("cw-home", home);
  var cur = curPage || (home ? "home" : "");
  doc.querySelectorAll(".cw-bar [data-tab]").forEach(function (t) { t.setAttribute("aria-current", t.getAttribute("data-tab") === cur ? "page" : "false"); });
}

/* ---------- páginas independentes (tela cheia; a trilha não aparece por baixo) ---------- */
function closePage() { if (curPage && curPage.el) curPage.el.remove(); curPage = null; sel = null; syncBar(); }
function openPage(kind) {
  if (kind === "home") { closePage(); if (typeof root.renderHome === "function") root.renderHome(); return; }
  closePage();
  var el = doc.createElement("div"); el.className = "cw-full"; el.setAttribute("role", "dialog");
  el.innerHTML = '<div class="cf-bar cf-topbar"><button type="button" class="cf-back" data-full-close>← Voltar</button></div><div class="cw-pagebody"></div>';
  doc.body.appendChild(el);
  curPage = { kind: kind, el: el };
  el.querySelector("[data-full-close]").addEventListener("click", function () { if (typeof root.renderHome === "function") root.renderHome(); closePage(); });
  renderPage();
  syncBar();
}
function renderPage() {
  if (!curPage || !S()) return;
  var k = curPage.kind, body = curPage.el.querySelector(".cw-pagebody");
  var html = k === "ach" ? pageAch() : k === "app" ? pageApp() : k === "tro" ? pageTro() : k === "noz" ? pageNoz() : pageLevel();
  body.innerHTML = html;
  if (sel && sel.kind === "app") detailApp(sel.id);
}
function cell(inner, label, bubble, extraCls) {
  return '<div class="cw-cell"><button type="button" class="cw-ibtn ' + (extraCls || "") + '" data-bub aria-label="' + esc(label) + '">' + inner + '</button>' +
    '<div class="cw-bub" hidden>' + bubble + '</div></div>';
}
function pageAch() {
  var list = achList(), n = list.filter(function (a) { return gotAch(a.id); }).length;
  return '<div class="cw-head"><h2>Conquistas</h2><span>' + n + ' de ' + list.length + '</span></div>' +
    (list.length ? '<div class="cw-icons">' + list.map(function (a) {
      var got = gotAch(a.id);
      var bub = got ? '<b>' + esc(a.name) + '</b><span>' + esc(a.how) + '.</span>' : '<b>Bloqueada</b><span>' + esc(a.how) + '.</span>';
      return cell('<span class="cw-glyph' + (got ? " on" : " off") + '">' + I.medal + '</span>', (got ? a.name : "Conquista bloqueada"), bub);
    }).join("") + '</div>' : '<p class="cw-empty">' + esc(CROW.vazio_ach) + '</p>');
}
function pageNoz() {
  var hist = [];
  try { hist = CF().boxHistory(S(), today()); } catch (e) { hist = []; }
  if (!hist.length) return '<div class="cw-head"><h2>Nozes</h2></div><p class="cw-empty">' + esc(CROW.vazio_noz) + '</p>';
  return '<div class="cw-head"><h2>Nozes</h2><span>' + nozCount() + ' abertas</span></div><div class="cw-icons">' + hist.map(function (h) {
    var aberta = h.status === "aberta", semanal = h.tipo === "semanal";
    var nome = semanal ? "Noz da semana de " + h.data : "Caixa mensal de " + h.data.slice(0, 7);
    var st = aberta ? "Aberta" : "Pronta para abrir";
    var act = aberta ? "" : '<button type="button" class="cw-btn cw-primary cw-bbtn" data-act="' + (semanal ? "noz" : "box") + '" data-box="' + esc(h.id) + '">Abrir</button>';
    return cell('<span class="cw-glyph' + (aberta ? " on" : " off") + '">' + I.noz + '</span>', nome, '<b>' + esc(nome) + '</b><span>' + esc(st) + (h.xp != null ? " · " + plural(h.xp, "XP", "XP") : "") + '</span>' + act);
  }).join("") + '</div>';
}
function pageTro() {
  var rows = trophyRows().sort(function (a, b) { return b.exercises - a.exercises; });
  var pinned = (S().showTro || []);
  return '<div class="cw-head"><h2>Troféus</h2><span>' + trophyTotal() + ' no total</span></div>' +
    (!rows.some(function (r) { return r.exercises > 0; }) ? '<p class="cw-empty">' + esc(CROW.vazio_tro) + '</p>' : '') +
    '<div class="cw-icons">' + rows.map(function (r) {
      var on = pinned.indexOf(r.id) >= 0;
      var bub = '<b>' + esc(r.name) + '</b><span>' + esc(plural(r.exercises, "vez", "vezes")) + ' · nível ' + r.stage + (r.next ? ' · próximo marco: ' + r.next : ' · marcos completos') + '</span>' +
        '<button type="button" class="cw-btn cw-bbtn ' + (on ? "" : "cw-primary") + '" data-act="destaque" data-id="' + esc(r.id) + '">' + (on ? "Tirar do perfil" : "Mostrar no perfil") + '</button>';
      return cell('<span class="cw-glyph trophy s' + Math.min(r.stage, 3) + (on ? " on" : "") + '">' + I.trophy + '</span>', r.name, bub);
    }).join("") + '</div><p class="cw-hint">Até 4 troféus aparecem no seu perfil.</p>';
}
function pageApp() {
  var s = S(), n = Object.keys(s.collection || {}).length, eq = equipped(), it = eq && byItem(eq);
  return '<div class="cw-head"><h2>Aparências</h2><span>' + n + ' de ' + cat().length + '</span></div>' +
    '<div class="cw-preview"><div class="cw-crow"><img src="mascot.png" alt="Crow">' + (it ? '<span class="cw-ap">' + esc(it.nome) + ' · TEMP</span>' : '') + '</div>' +
    '<p>' + (it ? "Equipada: " + esc(it.nome) : "Nenhuma aparência equipada. Eu continuo igual, e você também.") + '</p></div>' +
    '<div class="cw-grid">' + cat().map(function (x) {
      var has = owned(x.id), e = eq === x.id;
      return '<button type="button" class="cw-card cw-' + esc(x.raridade) + (has ? "" : " cw-locked") + '" data-kind="app" data-id="' + esc(x.id) + '">' +
        '<span class="cw-swatch"></span><span class="cw-name">' + (has ? esc(x.nome) : "???") + '</span>' +
        '<small>' + esc(RAR[x.raridade] || x.raridade) + (e ? " · equipada" : "") + '</small></button>';
    }).join("") + '</div><div class="cw-detail" hidden></div>';
}
function detailApp(id) {
  var box = curPage && curPage.el.querySelector(".cw-detail"); if (!box) return;
  var it = byItem(id); if (!it) { box.hidden = true; return; }
  var has = owned(id), e = equipped() === id;
  var act2 = !has ? "" : e ? '<button type="button" class="cw-btn" data-act="unequip">Desequipar</button>' : '<button type="button" class="cw-btn cw-primary" data-act="equip" data-id="' + esc(id) + '">Equipar</button>';
  box.hidden = false;
  box.innerHTML = '<div class="cw-dcard cw-' + esc(it.raridade) + '"><b>' + esc(has ? it.nome : "???") + '</b>' +
    '<small>' + esc(RAR[it.raridade] || it.raridade) + ' · arte provisória (TEMP)</small>' +
    '<p>' + (has ? "Obtida em caixa mensal." : "Bloqueada. Só sai de caixa mensal, e não duplica.") + '</p>' +
    '<div class="cw-acts">' + act2 + '</div></div>';
}
function pageLevel() {
  var li = root.lvlInfo(), pct = li.need ? Math.min(100, li.into / li.need * 100) : 0;
  return '<section class="cw-level"><div class="cw-pena">' + lvIco(li.l) + '</div>' +
    '<p class="cw-title">' + esc(li.title || "") + '</p><p><b>' + S().points + '</b> XP no total</p>' +
    '<div class="cw-lvbar" role="img" aria-label="Progresso do nível"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
    '<small>Faltam ' + (li.need - li.into) + ' XP para o nível ' + (li.l + 1) + '</small></section>';
}
function openLevel() { if (S() && typeof root.lvlInfo === "function") { openPage("nivel"); } }

/* ---------- perfil: visão geral (preenche a página de perfil, abaixo do avatar) ---------- */
function since(iso) {
  var t = Date.parse(iso); if (!isFinite(t)) return "";
  var d = Math.floor((Date.now() - t) / 86400000);
  if (d < 1) return "Cadastrado hoje";
  if (d < 30) return "Cadastrado há " + plural(d, "dia", "dias");
  if (d < 365) return "Cadastrado há " + plural(Math.floor(d / 30), "mês", "meses");
  return "Cadastrado há " + plural(Math.floor(d / 365), "ano", "anos");
}
function profileHtml(p) {
  var s = S(), prof = (p && p.profile) || {}, name = prof.displayName || "", s2 = since(prof.createdAt);
  var li = s && root.lvlInfo ? root.lvlInfo() : { l: 0 };
  var pinned = (s && s.showTro) || [], names = (root.CFP && root.CFP.LIB) || {};
  var rows = trophyRows(), byId = {}; rows.forEach(function (r) { byId[r.id] = r; });
  var troH = pinned.length ? pinned.map(function (id) {
    var r = byId[id]; if (!r) return "";
    return cell('<span class="cw-glyph trophy s' + Math.min(r.stage, 3) + ' on">' + I.trophy + '</span>', r.name, '<b>' + esc(r.name) + '</b><span>' + esc(plural(r.exercises, "vez", "vezes")) + ' · nível ' + r.stage + '</span>');
  }).join("") : '<p class="cw-hint">Escolha até 4 troféus no menu de troféus para exibir aqui.</p>';
  var achH = unlockedAch().slice(0, 4).map(function (u) {
    var a = achList().filter(function (x) { return x.id === u.id; })[0]; if (!a) return "";
    return cell('<span class="cw-glyph on">' + I.medal + '</span>', a.name, '<b>' + esc(a.name) + '</b><span>' + esc(u.info.day || "") + '</span>');
  }).join("");
  return '<section class="cw-pf">' +
    '<div class="cw-pf-avatar"><img src="mascot.png" alt="Crow"></div>' +
    '<h1 class="cf-title cw-pf-name" tabindex="-1">' + esc(name) + '</h1>' +
    (s2 ? '<p class="cw-pf-since">' + esc(s2) + '</p>' : '') +
    '<div class="cw-ov-grid">' +
      '<div class="cw-ov"><span class="cw-ov-ico">' + lvIco(li.l) + '</span><b>' + (s ? s.points : 0) + '</b><small>XP total</small></div>' +
      '<div class="cw-ov"><span class="cw-ov-ico">' + I.trophy + '</span><b>' + trophyTotal() + '</b><small>Troféus</small></div>' +
      '<div class="cw-ov"><span class="cw-ov-ico">' + I.noz + '</span><b>' + nozCount() + '</b><small>Nozes</small></div>' +
      '<div class="cw-ov"><span class="cw-ov-ico">' + I.medal + '</span><b>' + unlockedAch().length + '</b><small>Conquistas</small></div>' +
    '</div>' +
    '<h2 class="cw-sec">Troféus em destaque</h2><div class="cw-icons cw-four">' + troH + '</div>' +
    '<h2 class="cw-sec">Últimas conquistas</h2><div class="cw-icons cw-four">' + (achH || '<p class="cw-hint">Nenhuma conquista ainda.</p>') + '</div>' +
  '</section>';
}

/* ---------- balões: um por vez, fecha ao tocar fora ---------- */
function bubbleToggle(btn) {
  var cellEl = btn.closest(".cw-cell"); if (!cellEl) return;
  var b = cellEl.querySelector(".cw-bub"); var open = b.hidden;
  doc.querySelectorAll(".cw-bub").forEach(function (x) { x.hidden = true; });
  b.hidden = !open;
}

/* ---------- ações ---------- */
function act(kind, el) {
  if (kind === "equip") { CF().equipar(S(), el.getAttribute("data-id"), new Date().toISOString()); save(); return renderPage(); }
  if (kind === "unequip") { CF().desequipar(S(), new Date().toISOString()); save(); return renderPage(); }
  if (kind === "destaque") { if (!CF().toggleDestaque(S(), el.getAttribute("data-id"))) { root.alert && root.alert("Até 4 troféus no perfil."); return; } save(); return renderPage(); }
  if (kind === "box") return openBoxNow(el.getAttribute("data-box"));
  if (kind === "noz") { var k = String(el.getAttribute("data-box")).replace(/^noz:/, ""); closePage(); if (typeof root.openNozScreen === "function") root.openNozScreen(k); }
}
function openBoxNow(id) {
  var res = CF().openBox(S(), id, new Date().toISOString());
  if (!res) return; save();
  var names = res.items.map(function (i) { var it = byItem(i); return it ? it.nome : i; });
  celebrate({ title: "Caixa aberta", name: plural(res.xp, "XP", "XP") + (names.length ? " e " + names.join(", ") : ""), line: names.length ? "Não é grande coisa. Mas é seu." : "Só XP desta vez. Trate de treinar mais." });
  renderPage();
}

/* ---------- feedback: conquista nova e subida de nível ---------- */
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
  if (curPage) renderPage();
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
    var t = e.target.closest && e.target.closest(".cw-bar [data-tab]"); if (t) return openPage(t.getAttribute("data-tab"));
    var bub = e.target.closest && e.target.closest("[data-bub]"); if (bub) return bubbleToggle(bub);
    if (!e.target.closest || !e.target.closest(".cw-bub")) doc.querySelectorAll(".cw-bub").forEach(function (x) { x.hidden = true; });
    var a = e.target.closest && e.target.closest(".cw-full [data-act]"); if (a) return act(a.getAttribute("data-act"), a);
    var c = e.target.closest && e.target.closest(".cw-full [data-kind]"); if (c) { sel = { kind: c.getAttribute("data-kind"), id: c.getAttribute("data-id") }; renderPage(); }
  });
  root.onAchievement = onAchievement;
  setInterval(syncBar, 400);
  var tries = 0, t = setInterval(function () {
    tries++;
    if (hookSave() || tries > 100) { clearInterval(t); if (S()) { lastS = S(); lastLevel = CF().levelOf(S().points); } }
  }, 100);
  if (root.CrowfitProfile && typeof root.CrowfitProfile.setExtras === "function") root.CrowfitProfile.setExtras(profileHtml);
}
if (doc) { if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init); else init(); }
return { openPage: openPage, openLevel: openLevel, go: openPage, onAchievement: onAchievement, celebrate: celebrate, lvIco: lvIco, profileHtml: profileHtml };
});
