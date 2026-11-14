/* Crowfit: parede de aparências (Etapa 6). Barra inferior fixa com ícone de coleção, parede de itens
   (bloqueados opacos), detalhes ao tocar e equipar/desequipar. Usa window.S, window.save e window.CF.
   Arte temporária: o Crow recebe um selo "TEMP" com o nome do item até existir arte definitiva. */
(function (root, f) { root.CrowWall = f(root); })(typeof self !== "undefined" ? self : this, function (root) {
"use strict";
var doc = root.document, RAR = { comum: "Comum", epica: "Épica", rara: "Rara", lendaria: "Lendária" };
var ov = null, sel = null;
function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function st() { return root.S; }
function cat() { return (root.CF && root.CF.ITENS) || []; }
function owned(id) { var s = st(); return !!(s && s.collection && s.collection[id]); }
function equippedId() { var s = st(); try { return root.CF.aparenciaEquipada(s); } catch (e) { return null; } }
function byId(id) { return cat().filter(function (x) { return x.id === id; })[0] || null; }

/* Camada do Crow: devolve o HTML do selo temporário para o item equipado (ou vazio). */
function crowLayers() {
  var id = equippedId(); if (!id) return "";
  var it = byId(id); if (!it) return "";
  return '<span class="cw-ap cw-ap-' + esc(it.raridade) + '" data-ap="' + esc(it.id) + '" title="' + esc(it.nome) + '">' + esc(it.nome) + ' · TEMP</span>';
}

function cardHtml(it) {
  var has = owned(it.id), eq = equippedId() === it.id;
  return '<button type="button" class="cw-card cw-' + esc(it.raridade) + (has ? "" : " cw-locked") + '" data-id="' + esc(it.id) + '" aria-label="' + esc(it.nome) + (has ? "" : ", bloqueada") + '">' +
    '<span class="cw-swatch"></span>' +
    '<span class="cw-name">' + (has ? esc(it.nome) : "???") + '</span>' +
    '<small>' + esc(RAR[it.raridade] || it.raridade) + (eq ? " · equipada" : "") + '</small>' +
    (has ? "" : '<span class="cw-lock" aria-hidden="true">🔒</span>') +
    '</button>';
}
function render() {
  if (!ov) return;
  var s = st(), n = Object.keys((s && s.collection) || {}).length, eq = equippedId(), it = eq && byId(eq);
  ov.querySelector(".cw-body").innerHTML =
    '<div class="cw-head"><h2>Aparências</h2><span>' + n + ' de ' + cat().length + '</span></div>' +
    '<div class="cw-preview"><div class="cw-crow"><img src="mascot.png" alt="Crow">' + (it ? '<span class="cw-ap cw-ap-' + esc(it.raridade) + '">' + esc(it.nome) + ' · TEMP</span>' : '') + '</div>' +
    '<p>' + (it ? "Equipada: " + esc(it.nome) : "Nenhuma aparência equipada.") + '</p></div>' +
    '<div class="cw-grid">' + cat().map(cardHtml).join("") + '</div>';
  if (sel) detail(sel);
}
function detail(id) {
  sel = id; var it = byId(id), box = ov.querySelector(".cw-detail"); if (!it) { box.hidden = true; return; }
  var has = owned(id), eq = equippedId() === id;
  var how = has ? "Obtida em caixa mensal." : "Bloqueada. Obtenha em uma caixa mensal.";
  var act = !has ? "" : (eq ? '<button type="button" class="cw-btn" data-act="unequip">Desequipar</button>' : '<button type="button" class="cw-btn cw-primary" data-act="equip">Equipar</button>');
  box.hidden = false;
  box.innerHTML = '<div class="cw-dcard cw-' + esc(it.raridade) + '">' +
    '<b>' + (has ? esc(it.nome) : "???") + '</b>' +
    '<small>' + esc(RAR[it.raridade] || it.raridade) + ' · TEMP (arte provisória)</small>' +
    '<p>' + esc(how) + '</p><div class="cw-acts">' + act + '<button type="button" class="cw-btn" data-act="close">Fechar</button></div></div>';
}
function act(kind) {
  var s = st(); if (!s || !sel) return;
  var now = new Date().toISOString();
  if (kind === "equip") root.CF.equipar(s, sel, now);
  if (kind === "unequip") root.CF.desequipar(s, now);
  if (kind === "close") { sel = null; ov.querySelector(".cw-detail").hidden = true; return; }
  if (typeof root.save === "function") root.save();
  render();
}
function open() {
  if (!ov) build();
  sel = null; ov.hidden = false; doc.body.classList.add("cw-open"); render();
}
function close() { if (ov) ov.hidden = true; doc.body.classList.remove("cw-open"); sel = null; }
function build() {
  ov = doc.createElement("div"); ov.className = "cw-ov"; ov.hidden = true;
  ov.innerHTML = '<div class="cw-sheet" role="dialog" aria-modal="true" aria-label="Parede de aparências">' +
    '<button type="button" class="cw-x" aria-label="Fechar">✕</button><div class="cw-body"></div>' +
    '<div class="cw-detail" hidden></div></div>';
  doc.body.appendChild(ov);
  ov.addEventListener("click", function (e) {
    if (e.target === ov || (e.target.closest && e.target.closest(".cw-x"))) return close();
    var a = e.target.closest && e.target.closest("[data-act]"); if (a) return act(a.getAttribute("data-act"));
    var c = e.target.closest && e.target.closest(".cw-card"); if (c) { detail(c.getAttribute("data-id")); }
  });
}
function bar() {
  var b = doc.createElement("nav"); b.className = "cw-bar"; b.setAttribute("aria-label", "Atalhos");
  b.innerHTML = '<button type="button" class="cw-tab" id="cw-tab-wall" aria-label="Parede de aparências">' +
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>' +
    '<span>Parede</span></button>';
  doc.body.appendChild(b);
  b.querySelector("#cw-tab-wall").addEventListener("click", open);
  doc.body.classList.add("cw-has-bar");
}
if (doc) { if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", bar); else bar(); }
return { open: open, close: close, render: render, crowLayers: crowLayers, equippedId: equippedId };
});
