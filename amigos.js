/* Crowfit: amigos (ID do jogador, pedidos, lista). Usa o cliente de CrowfitAuth e as RPCs de supabase-amigos-v8.sql.
   Não guarda nada no aparelho: tudo vem do servidor. Pontos de entrada: CrowAmigos.mount(elemento). */
(function (root, f) { root.CrowAmigos = f(root); })(typeof self !== "undefined" ? self : this, function (root) {
"use strict";
var HANDLE_RE = /^[a-z0-9_]{3,20}$/;
var MSG = {
  handle_taken: "Esse ID já está em uso. Escolha outro.",
  invalid_handle: "Use de 3 a 20 letras minúsculas, números ou _.",
  user_not_found: "Nenhum jogador com esse ID.",
  self_request: "Esse é o seu próprio ID.",
  already_sent: "Pedido já enviado.",
  already_friends: "Vocês já são amigos.",
  request_not_found: "Esse pedido não existe mais.",
  too_many: "Limite de amigos atingido.",
  not_authenticated: "Entre na sua conta para usar amigos.",
  handle_required: "Escolha seu ID antes de pedir amizade ou buscar jogadores.",
  profile_missing: "Seu perfil ainda não está pronto. Tente de novo em instantes."
};
var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var tab = "amigos";
var box = null, busy = false, flash = "", lastData = null, filterText = "", found = null, lastLb = null, rankMode = "xp", view = null;

function validHandle(h) { return typeof h === "string" && HANDLE_RE.test(h); }
function normHandle(h) { return String(h == null ? "" : h).trim().toLowerCase(); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
function msgFor(err) {
  var m = (err && (err.message || err.code)) || "";
  for (var k in MSG) if (m.indexOf(k) >= 0) return MSG[k];
  return "Não foi possível concluir agora. Tente de novo.";
}
function client() { var A = root.CrowfitAuth; return A && A.getClient ? A.getClient() : null; }
async function call(name, args) {
  var c = client(); if (!c) throw new Error("not_authenticated");
  var r = await c.rpc(name, args || {});
  if (r.error) throw r.error;
  return r.data;
}

/* ---------- visual ---------- */
function row(p, actions) {
  return '<li class="am-row"><div class="am-who"><b>' + esc(p.name || "Atleta") + '</b><span>@' + esc(p.handle || "") + '</span></div>' +
    (p.level != null ? '<span class="am-lv">Nv ' + esc(p.level) + ' · ' + esc(p.xp) + ' XP</span>' : '') +
    '<div class="am-acts">' + actions + '</div></li>';
}
function section(title, items, fn, empty) {
  return '<h3 class="am-sec">' + title + '</h3>' +
    (items.length ? '<ul class="am-list">' + items.map(fn).join("") + '</ul>' : '<p class="cw-empty">' + esc(empty) + '</p>');
}
/* Cartão do jogador buscado: mostra quem é e a ação possível conforme a relação (sem duplicar pedidos). */
function foundCard() {
  if (!found) return "";
  var r = found.relation, id = esc(found.handle), who = '<div class="am-who"><b>' + esc(found.name || "Atleta") + '</b><span>@' + id + '</span></div>' +
    (found.level != null ? '<span class="am-lv">Nv ' + esc(found.level) + '</span>' : '');
  var acts = {
    self: '<span class="am-hint">Esse é o seu ID.</span>',
    none: '<button type="button" class="am-btn am-pri" data-act="ask" data-h="' + id + '">Pedir amizade</button>',
    out: '<span class="am-hint">Pedido enviado.</span><button type="button" class="am-btn" data-act="cancel" data-h="' + id + '">Cancelar pedido</button>',
    in: '<button type="button" class="am-btn am-pri" data-act="accept" data-h="' + id + '">Aceitar</button><button type="button" class="am-btn" data-act="decline" data-h="' + id + '">Recusar</button>',
    friends: '<span class="am-hint">Vocês são amigos.</span><button type="button" class="am-btn" data-act="unfriend" data-h="' + id + '">Remover amizade</button>'
  }[r] || "";
  return '<div class="am-found" role="status">' + who + '<div class="am-acts">' + acts + '</div></div>';
}
function html(d) {
  var idBlock = d.handle
    ? '<div class="am-id"><span>Seu ID</span><b>@' + esc(d.handle) + '</b><button type="button" class="am-btn" data-act="copy">Copiar</button></div>'
    : '<p class="am-flash">Seu ID ainda não foi definido. Escolha em Configurações > Conta e perfil.</p>';
  var friendsAll = d.friends || [];
  var q = normHandle(filterText).replace(/^@/, "");
  var friends = q ? friendsAll.filter(function (p) {
    return String(p.handle || "").indexOf(q) >= 0 || String(p.name || "").toLowerCase().indexOf(q) >= 0;
  }) : friendsAll;
  var searchBox = '<form class="am-form am-search" data-form="filter" role="search"><label>Buscar amigo<input name="q" type="search" maxlength="40" autocomplete="off" autocapitalize="off" placeholder="@usuario ou nome" value="' + esc(filterText) + '"></label></form>';
  var findForm = d.handle
    ? '<form class="am-form am-add" data-form="find" novalidate><label>Encontrar jogador pelo ID<input name="handle" maxlength="21" autocomplete="off" autocapitalize="off" placeholder="@do_amigo"></label><button type="submit" class="am-btn am-pri">Buscar</button></form>' + foundCard()
    : '';
  var head = tabsHtml(tab);
  var flashHtml = flash ? '<p class="am-flash" role="status">' + esc(flash) + '</p>' : '';
  if (tab === "buscar") {
    return head + '<h3 class="am-sec">Seu ID</h3>' + idBlock +
      (d.handle ? '<button type="button" class="am-btn am-pri am-meu" data-act="meu">Ver meu perfil</button>' : '') +
      '<h3 class="am-sec">Encontrar jogador</h3>' + findForm + flashHtml;
  }
  var byXp = friendsAll.slice().sort(function (a, b) { return (b.xp || 0) - (a.xp || 0); }).slice(0, 3);
  var best = byXp.length ? '<div class="am-best"><h3 class="am-sec">Melhores amigos</h3><div class="am-best-row">' + byXp.map(function (p) {
    var ini = esc(String(p.name || p.handle || "?").trim().charAt(0).toUpperCase());
    return '<button type="button" class="am-av" data-act="perfil" data-h="' + esc(p.handle) + '"><span class="am-av-c" aria-hidden="true">' + ini + '</span><b>' + esc(p.name || "Atleta") + '</b><small>' + (p.xp || 0) + ' XP</small></button>';
  }).join("") + '</div></div>' : '';
  return head + best + searchBox + flashHtml +
    (d.incoming && d.incoming.length ? section("Pedidos recebidos", d.incoming, function (p) {
      return row(p, '<button type="button" class="am-btn am-pri" data-act="accept" data-h="' + esc(p.handle) + '">Aceitar</button>' +
        '<button type="button" class="am-btn" data-act="decline" data-h="' + esc(p.handle) + '">Recusar</button>');
    }, "") : '') +
    (d.outgoing && d.outgoing.length ? section("Pedidos enviados", d.outgoing, function (p) {
      return row(p, '<button type="button" class="am-btn" data-act="remove" data-h="' + esc(p.handle) + '">Cancelar</button>');
    }, "") : '') +
    section("Todos os amigos", friends, function (p) {
      return row(p, '<button type="button" class="am-btn" data-act="perfil" data-h="' + esc(p.handle) + '">Ver perfil</button>' + '<button type="button" class="am-btn" data-act="remove" data-h="' + esc(p.handle) + '">Remover</button>');
    }, q ? "Nenhum amigo encontrado para essa busca." : "Ainda sem amigos. Compartilhe seu ID para alguém te adicionar.") + rankingHtml();
}

/* ---------- fluxo ---------- */
function openDesafios() {
  var A = root.CrowfitAuth, c = A && A.getClient ? A.getClient() : null;
  if (!root.CrowDesafios || !c || !box) return;
  view = null;
  box.innerHTML = tabsHtml("desafios") + '<div id="am-sub"></div>';
  var sub = box.querySelector("#am-sub");
  var r = root.CrowDesafios.open(sub, c, function () { load(); });
  setTimeout(function () { var bk = sub && sub.querySelector("#dg-bk"); if (bk) bk.remove(); }, 0);
  return r;
}
function switchTab(k) {
  if (k === "desafios") return openDesafios();
  tab = k; view = null; return render();
}
function render() { if (lastData && box) box.innerHTML = html(lastData); else return load(); }
async function load() {
  if (!box) return;
  if (view) return loadPerfil();
  try {
    var d = await call("get_my_social");
    var lb = await call("get_leaderboard");
    lastData = d || {};
    lastLb = lb || { rows: [] };
    box.innerHTML = html(lastData);
  } catch (e) {
    box.innerHTML = '<p class="am-flash" role="alert">' + esc(msgFor(e)) + '</p>';
  }
}
/* Envia ofensiva atual e troféus para o servidor (só quando mudam). Usa CF.trophyCatalog/CF.trophyCount já existentes. */
var lastPush = "";
/* Converte o catálogo de troféus do app no formato de set_my_trophies: { ex, lv (níveis desbloqueados, 1-4), value }. */
function buildTrophyItems(catalog) {
  return (catalog || []).map(function (r) {
    var lv = (r.levels || []).filter(function (l) { return l.unlocked; }).length;
    return { ex: String(r.id), lv: lv, value: Math.max(0, Math.floor(Number(r.value) || 0)) };
  }).filter(function (i) { return i.lv >= 1 && i.lv <= 4; });
}
function statsPayload() {
  var st = root.S, CFx = root.CF, T = root.CFT, P = root.CFP;
  if (!st || !CFx || !T || !P || !root.trailCtx) return null;
  var recs = T.trophyRecords(root.trailCtx()), kinds = {};
  Object.keys(P.LIB).forEach(function (id) { kinds[id] = P.LIB[id][1] === "s" ? "s" : "r"; });
  return { streak: Math.max(0, st.streak | 0), items: buildTrophyItems(CFx.trophyCatalog(recs, kinds)) };
}
/* Envia ofensiva atual e troféus (v14: set_my_current_streak e set_my_trophies). Só envia quando algo muda. */
async function pushStats() {
  try {
    var p = statsPayload(); if (!p) return;
    var key = JSON.stringify(p); if (key === lastPush) return;
    var c = client(); if (!c) return;
    var r1 = await c.rpc("set_my_current_streak", { p: { current_streak: p.streak } });
    if (r1.error) return;
    var r2 = await c.rpc("set_my_trophies", { p: { items: p.items } });
    if (!r2.error) lastPush = key;
  } catch (e) { /* tenta de novo na próxima vez */ }
}

/* Perfil social (próprio ou de amigo). Dados vêm de get_friend_profile, que já recusa quem não é amigo.
   Visível aos amigos: nome, ID, nível, XP, ofensiva atual e melhor, troféus, conquistas, último treino e data da amizade.
   Nunca aparecem: e-mail, dados de login e configurações. */
var TRN = ["Bronze", "Prata", "Ouro", "Diamante"];
function nomeConquista(id) {
  var ach = ((root.CF || {}).ACH || []), i;
  for (i = 0; i < ach.length; i++) if (ach[i].id === id) return ach[i].name;
  return null;
}
function totalTroféus(p) {
  return (p.trophies || []).reduce(function (n, t) { return n + (t.lv | 0); }, 0);
}
function perfilHtml(p, isMe) {
  var conq = (p.achievements || []).map(nomeConquista).filter(Boolean);
  var tro = (p.trophies || []).slice(0, 12);
  var acoes = isMe
    ? '<button type="button" class="am-btn am-pri" data-act="editar">Editar nome e ID</button>'
    : '<button type="button" class="am-btn" data-act="unfriend" data-h="' + esc(p.handle) + '">Remover amizade</button>';
  return '<section class="am-perfil' + (isMe ? ' am-perfil-eu' : '') + '">' +
    '<h2>' + esc(p.name || "Atleta") + (isMe ? ' <span class="am-tag">Você</span>' : '') + '</h2>' +
    '<p class="am-perfil-h">@' + esc(p.handle) + '</p>' +
    '<div class="am-stats">' +
      '<div><b>Nv ' + esc(p.level) + '</b><span>nível</span></div>' +
      '<div><b>' + esc(p.xp || 0) + '</b><span>XP total</span></div>' +
      '<div><b>' + esc(totalTroféus(p)) + '</b><span>troféus</span></div>' +
      '<div><b>' + esc(p.current_streak || 0) + '</b><span>ofensiva atual</span></div>' +
      '<div><b>' + esc(p.best_streak || 0) + '</b><span>melhor ofensiva</span></div>' +
      '<div><b>' + esc((p.achievements || []).length) + '</b><span>conquistas</span></div>' +
    '</div>' +
    '<h3 class="am-sec">Conquistas</h3>' +
    (conq.length ? '<ul class="am-tags">' + conq.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join("") + '</ul>' : '<p class="am-hint">Nenhuma conquista ainda.</p>') +
    '<h3 class="am-sec">Troféus</h3>' +
    (tro.length ? '<ul class="am-tags">' + tro.map(function (t) { return '<li>' + esc(String(t.ex).replace(/_/g, " ")) + ' · ' + esc(TRN[t.lv - 1] || "") + '</li>'; }).join("") + '</ul>' : '<p class="am-hint">Nenhum troféu ainda.</p>') +
    '<p class="am-hint">Último treino: ' + esc(fmtDia(p.last_workout)) + '</p>' +
    '<p class="am-hint">' + (isMe ? 'Só seus amigos veem este perfil.' : 'Amigos desde ' + esc(fmtDia(p.since)) + '.') + '</p>' +
    '<div class="am-acts am-perfil-acts">' + acoes + '</div>' +
    '</section>';
}
function fmtDia(iso) { if (!iso) return "ainda não treinou"; var p = String(iso).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso; }
async function loadPerfil() {
  try {
    var p = await call("get_friend_profile", { p: { handle: view.h } });
    box.innerHTML = '<button type="button" class="cw-back-ico am-voltar" data-act="voltar" aria-label="Voltar">' +
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      perfilHtml(p, !!view.me);
  } catch (e) {
    view = null;
    box.innerHTML = '<p class="am-flash" role="alert">' + esc(msgFor(e)) + '</p>';
  }
}

/* Classificação entre amigos. Critérios: XP (padrão), melhor ofensiva e troféus (só se o servidor enviar troféus na lista).
   Cada linha abre o perfil do jogador. Em empate, ordem alfabética do ID. */
function rankKey(mode) { return mode === "streak" ? "best_streak" : mode === "trophies" ? "trophies" : "xp"; }
function rankValue(r, mode) {
  if (mode === "streak") return (r.best_streak || 0) + " dias";
  if (mode === "trophies") return (r.trophies || 0) + " troféus";
  return (r.xp || 0) + " XP";
}
function ordenaRank(rows, mode) {
  var key = rankKey(mode);
  return rows.slice().sort(function (a, b) {
    return ((b[key] || 0) - (a[key] || 0)) || ((b.xp || 0) - (a.xp || 0)) || (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0);
  });
}
function rankingHtml() {
  var rows = (lastLb && lastLb.rows) || [];
  if (rows.length < 2) return '<p class="am-hint">Adicione amigos para ver a classificação.</p>';
  var temTroféus = rows.some(function (r) { return typeof r.trophies === "number"; });
  var mode = (rankMode === "trophies" && !temTroféus) ? "xp" : rankMode;
  var sorted = ordenaRank(rows, mode);
  var me = sorted.findIndex(function (r) { return r.me; });
  var tabs = '<div class="am-tabs" role="group" aria-label="Critério">' +
    '<button type="button" class="am-tab' + (mode === "xp" ? " on" : "") + '" data-act="rank" data-m="xp">XP</button>' +
    '<button type="button" class="am-tab' + (mode === "streak" ? " on" : "") + '" data-act="rank" data-m="streak">Melhor ofensiva</button>' +
    (temTroféus ? '<button type="button" class="am-tab' + (mode === "trophies" ? " on" : "") + '" data-act="rank" data-m="trophies">Troféus</button>' : '') +
    '</div>';
  var list = sorted.map(function (r, i) {
    return '<li class="am-rk' + (r.me ? " me" : "") + '"><button type="button" class="am-rk-btn" data-act="perfil" data-h="' + esc(r.handle) + '" data-me="' + (r.me ? "1" : "") + '">' +
      '<b>' + (i + 1) + '</b><span class="am-rk-w">' + esc(r.name || "Atleta") + (r.me ? " (você)" : "") + '<small>@' + esc(r.handle) + '</small></span>' +
      '<span class="am-rk-v">' + esc(rankValue(r, mode)) + '</span></button></li>';
  }).join("");
  var foot = me >= 0 ? '<p class="am-hint">Você está em ' + (me + 1) + 'º de ' + sorted.length + '.</p>' : "";
  return '<h3 class="am-sec">Classificação</h3>' + tabs + '<ul class="am-rank">' + list + '</ul>' + foot;
}

async function act(fn, ok) {
  if (busy) return; busy = true; flash = "";
  try { await fn(); flash = ok || ""; }
  catch (e) { flash = msgFor(e); }
  if (found) { try { found = await call("find_user", { p: { handle: found.handle } }); } catch (e) { found = null; } }
  busy = false;
  await load();
}
/* Confirmação antes de ações que desfazem vínculo. */
function confirmar(texto) { try { return root.confirm ? !!root.confirm(texto) : true; } catch (e) { return true; } }
function onClick(ev) {
  var b = ev.target.closest && ev.target.closest("[data-act]"); if (!b) return;
  var a = b.getAttribute("data-act"), h = b.getAttribute("data-h");
  if (a === "perfil") { view = { h: h, me: b.getAttribute("data-me") === "1" || (lastData && h === lastData.handle) }; box.innerHTML = '<p class="cw-empty">Carregando…</p>'; return load(); }
  if (a === "meu") { if (!lastData || !lastData.handle) return; view = { h: lastData.handle, me: true }; box.innerHTML = '<p class="cw-empty">Carregando…</p>'; return load(); }
  if (a === "editar") { var P = root.CrowfitProfile; if (P && P.open) P.open(); return; }
  if (a === "voltar") { view = null; return load(); }
  if (a === "tab-amigos") { tab = "amigos"; view = null; return render(); }
  if (a === "tab-buscar") { tab = "buscar"; view = null; return render(); }
  if (a === "tab-desafios") { return openDesafios(); }
  if (a === "desafios") { tab = "desafios"; return openDesafios(); }
  if (a === "desafios-old") { var A = root.CrowfitAuth, c = A && A.getClient ? A.getClient() : null; if (!root.CrowDesafios || !c) return; view = null; var r = root.CrowDesafios.open(box, c, function () { load(); }); if (box && !box.querySelector(".cf-tabs")) box.insertAdjacentHTML("afterbegin", tabsHtml("desafios")); return r; }
  if (a === "rank") { var m = b.getAttribute("data-m"); rankMode = m === "streak" || m === "trophies" ? m : "xp"; box.innerHTML = html(lastData); return; }
  if (a === "copy") {
    var txt = "@" + (box.querySelector(".am-id b") || { textContent: "" }).textContent.replace(/^@/, "");
    try { root.navigator.clipboard.writeText(txt); flash = "ID copiado."; } catch (e) { flash = "Copie seu ID: " + txt; }
    return load();
  }
  if (a === "accept") return act(function () { return call("respond_friend_request", { p: { handle: h, accept: true } }); }, "Amizade feita.");
  if (a === "decline") return act(function () { return call("respond_friend_request", { p: { handle: h, accept: false } }); }, "Pedido recusado.");
  if (a === "remove") { if (!confirmar("Remover @" + h + " da sua lista de amigos?")) return; return act(function () { return call("remove_friend", { p: { handle: h } }); }, "Pronto."); }
  if (a === "ask") return act(function () { return call("send_friend_request", { p: { handle: h } }); }, "Pedido enviado.");
  if (a === "cancel") { if (!confirmar("Cancelar o pedido para @" + h + "?")) return; return act(function () { return call("remove_friend", { p: { handle: h } }); }, "Pedido cancelado."); }
  if (a === "unfriend") { if (!confirmar("Remover @" + h + " da sua lista de amigos?")) return; view = null; return act(function () { return call("remove_friend", { p: { handle: h } }); }, "Amizade removida."); }
}
function onSubmit(ev) {
  var f = ev.target; if (!f || !f.getAttribute) return;
  ev.preventDefault();
  var kind = f.getAttribute("data-form"), input = f.querySelector("input[name=handle]");
  if (kind === "filter") return;
  if (kind === "find") {
    var fh = normHandle(input && input.value);
    if (!validHandle(fh)) { found = null; flash = MSG.invalid_handle; return load(); }
    if (busy) return; busy = true; flash = "";
    return call("find_user", { p: { handle: fh } }).then(function (r) { found = r; busy = false; load(); })
      .catch(function (e) { found = null; busy = false; flash = msgFor(e); load(); });
  }
  var h = normHandle(input && input.value);
  if (!validHandle(h)) { flash = MSG.invalid_handle; return load(); }
}

function onInput(ev) {
  var f = ev.target && ev.target.closest && ev.target.closest("form[data-form=filter]");
  if (!f || !lastData) return;
  var pos = ev.target.selectionStart;
  filterText = ev.target.value || "";
  box.innerHTML = html(lastData);
  var inp = box.querySelector("form[data-form=filter] input");
  if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (e) {} }
}

if (typeof document !== "undefined" && !document.getElementById("am-tabs-css")) {
  var __am = document.createElement("style"); __am.id = "am-tabs-css";
  __am.textContent = ".am-sec{font-size:15px;margin:16px 0 8px}.am-best-row{display:flex;gap:12px;overflow-x:auto;padding-bottom:4px}.am-av{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:84px;border:0;background:none;cursor:pointer;color:inherit}.am-av-c{width:56px;height:56px;border-radius:50%;background:#E3182D;color:#fff;display:grid;place-items:center;font-family:Fredoka,sans-serif;font-size:22px;font-weight:700}.am-av b{font-size:13px}.am-av small{font-size:11px;color:#5E5E73}";
  document.head.appendChild(__am);
}
var TAB_ORDER = ["amigos", "desafios", "buscar"], TAB_NAME = { amigos: "Amigos", desafios: "Desafios", buscar: "Buscar" };
if (typeof document !== "undefined" && !document.getElementById("cf-pager-css")) {
  var __pg = document.createElement("style"); __pg.id = "cf-pager-css";
  __pg.textContent = ".cf-pager{display:flex;justify-content:center;align-items:center;gap:8px;margin:6px 0 14px}.cf-pdot{width:8px;height:8px;border-radius:50%;border:0;padding:0;background:#D9D9E0;cursor:pointer;transition:width .2s,background .2s}.cf-pdot.on{width:22px;border-radius:6px;background:#E3182D}.am-pager{text-align:center}.am-ptitle{font-family:Fredoka,Nunito,sans-serif;font-size:22px;margin:4px 0 0}";
  document.head.appendChild(__pg);
}
function tabsHtml(on) {
  var dots = TAB_ORDER.map(function (k) {
    return '<button type="button" class="cf-pdot' + (on === k ? ' on' : '') + '" role="tab" aria-selected="' + (on === k) + '" aria-label="' + TAB_NAME[k] + '" data-act="tab-' + k + '"></button>';
  }).join("");
  return '<div class="am-pager"><h2 class="am-ptitle">' + TAB_NAME[on] + '</h2><div class="cf-pager" role="tablist" aria-label="Seções">' + dots + '</div></div>';
}
function mount(el) {
  if (!el) return;
  box = el; flash = ""; found = null; view = null;
  /* deixa o navegador passar os gestos horizontais para o app (só a rolagem vertical fica com ele) */
  el.style.touchAction = "pan-y";
  var px = null, py = null, pid = null;
  el.addEventListener("touchstart", function (e) { var t = e.touches && e.touches[0]; if (!t) return; px = t.clientX; py = t.clientY; }, { passive: true });
  el.addEventListener("touchend", function (e) {
    var t = e.changedTouches && e.changedTouches[0]; if (px == null || !t) return;
    var dx = t.clientX - px, dy = t.clientY - py; px = null;
    if (Math.abs(dx) < 50 || Math.abs(dy) > 60) return;
    var i = TAB_ORDER.indexOf(tab), j = dx < 0 ? Math.min(TAB_ORDER.length - 1, i + 1) : Math.max(0, i - 1);
    if (j !== i) switchTab(TAB_ORDER[j]);
  }, { passive: true });
  el.addEventListener("touchcancel", function () { px = null; }, { passive: true });
  el.addEventListener("click", onClick);
  el.addEventListener("submit", onSubmit);
  el.addEventListener("input", onInput);
  box.innerHTML = '<p class="cw-empty">Carregando…</p>';
  load();
}

return { mount: mount, validHandle: validHandle, normHandle: normHandle, msgFor: msgFor, MSG: MSG, pushStats: pushStats, perfilHtml: perfilHtml, buildTrophyItems: buildTrophyItems, ordenaRank: ordenaRank, rankValue: rankValue, rankKey: rankKey, totalTroféus: totalTroféus };
});
