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
  profile_missing: "Seu perfil ainda não está pronto. Tente de novo em instantes."
};
var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var box = null, busy = false, flash = "", lastData = null, filterText = "";

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
  var addForm = d.handle
    ? '<form class="am-form am-add" data-form="add"><label>Adicionar amigo pelo ID<input name="handle" maxlength="21" autocomplete="off" autocapitalize="off" placeholder="@do_amigo"></label><button type="submit" class="am-btn am-pri">Pedir</button></form>'
    : '';
  return '<div class="cw-head"><h2>Amigos</h2><span>' + (d.friends || []).length + '</span></div>' +
    idBlock + addForm + searchBox +
    (flash ? '<p class="am-flash" role="status">' + esc(flash) + '</p>' : '') +
    (d.incoming && d.incoming.length ? section("Pedidos recebidos", d.incoming, function (p) {
      return row(p, '<button type="button" class="am-btn am-pri" data-act="accept" data-h="' + esc(p.handle) + '">Aceitar</button>' +
        '<button type="button" class="am-btn" data-act="decline" data-h="' + esc(p.handle) + '">Recusar</button>');
    }, "") : '') +
    (d.outgoing && d.outgoing.length ? section("Pedidos enviados", d.outgoing, function (p) {
      return row(p, '<button type="button" class="am-btn" data-act="remove" data-h="' + esc(p.handle) + '">Cancelar</button>');
    }, "") : '') +
    section("Seus amigos", friends, function (p) {
      return row(p, '<button type="button" class="am-btn" data-act="remove" data-h="' + esc(p.handle) + '">Remover</button>');
    }, q ? "Nenhum amigo encontrado para essa busca." : "Ainda sem amigos. Compartilhe seu ID para alguém te adicionar.");
}

/* ---------- fluxo ---------- */
async function load() {
  if (!box) return;
  try {
    var d = await call("get_my_social");
    lastData = d || {};
    box.innerHTML = html(lastData);
  } catch (e) {
    box.innerHTML = '<p class="am-flash" role="alert">' + esc(msgFor(e)) + '</p>';
  }
}
async function act(fn, ok) {
  if (busy) return; busy = true; flash = "";
  try { await fn(); flash = ok || ""; }
  catch (e) { flash = msgFor(e); }
  busy = false;
  await load();
}
function onClick(ev) {
  var b = ev.target.closest && ev.target.closest("[data-act]"); if (!b) return;
  var a = b.getAttribute("data-act"), h = b.getAttribute("data-h");
  if (a === "copy") {
    var txt = "@" + (box.querySelector(".am-id b") || { textContent: "" }).textContent.replace(/^@/, "");
    try { root.navigator.clipboard.writeText(txt); flash = "ID copiado."; } catch (e) { flash = "Copie seu ID: " + txt; }
    return load();
  }
  if (a === "accept") return act(function () { return call("respond_friend_request", { p: { handle: h, accept: true } }); }, "Amizade feita.");
  if (a === "decline") return act(function () { return call("respond_friend_request", { p: { handle: h, accept: false } }); }, "Pedido recusado.");
  if (a === "remove") return act(function () { return call("remove_friend", { p: { handle: h } }); }, "Pronto.");
}
function onSubmit(ev) {
  var f = ev.target; if (!f || !f.getAttribute) return;
  ev.preventDefault();
  var kind = f.getAttribute("data-form"), input = f.querySelector("input[name=handle]");
  if (kind === "filter") return;
  var h = normHandle(input && input.value);
  if (!validHandle(h)) { flash = MSG.invalid_handle; return load(); }
  if (kind === "add") { input.value = ""; return act(function () { return call("send_friend_request", { p: { handle: h } }); }, "Pedido enviado."); }
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

function mount(el) {
  if (!el) return;
  box = el; flash = "";
  el.addEventListener("click", onClick);
  el.addEventListener("submit", onSubmit);
  el.addEventListener("input", onInput);
  box.innerHTML = '<p class="cw-empty">Carregando…</p>';
  load();
}

return { mount: mount, validHandle: validHandle, normHandle: normHandle, msgFor: msgFor, MSG: MSG };
});
