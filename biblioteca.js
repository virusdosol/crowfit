/* Biblioteca de exercícios: categorias (ícone) -> lista de exercícios -> página do exercício.
   Funções puras (recebem LIB e BIB_TXT). Testes: node --test biblioteca.test.js */
(function (root) {
  var CATS = [
    { id: "peito", n: "Peito", c: "#E3182D", ids: ["fl_inc", "fl_j", "fl", "fl_dec", "fl_arq", "fl_lar", "fl_pau", "fl_exp", "fl_iso", "pr_alta", "pr_toque", "pr_flx"] },
    { id: "bracos", n: "Braços", c: "#303036", ids: ["fl_fec_j", "fl_fec", "fl_dia", "fl_dia_dec", "parede_bi", "chao_bi", "chin_mesa", "tri_par", "mg", "mg_ret", "mg_1"] },
    { id: "ombros", n: "Ombros", c: "#E3182D", ids: ["pk_par", "pk", "pk_lent", "pk_ele", "pk_ele_l", "cir_br", "elev_lat", "urso_t", "ytw", "ytw_seg", "desl_par", "parada"] },
    { id: "costas", n: "Costas", c: "#303036", ids: ["sup", "sup_alt", "nadad", "sup_seg", "rem_mesa", "bird", "pr_rev_j", "pr_rev", "pr_rev_p", "bomdia", "bomdia_l", "stiff_u", "stiff_par", "esc_ret"] },
    { id: "abdomen", n: "Abdômen", c: "#E3182D", ids: ["ab_cur", "ab", "ab_cruz", "ab_v", "ab_hol", "pr_j", "pr", "pr_c", "pr_ant", "pe_j", "pe", "bi", "tes", "pr_lat_j", "pr_lat", "pr_lat_el", "mc"] },
    { id: "pernas", n: "Pernas", c: "#303036", ids: ["ag_ap", "ag", "ag_pau", "ag_bul", "ag_pist", "af_est", "af", "af_rev", "af_cam", "af_salto", "pg", "pg_pau", "pg_u", "pg_el", "pa", "ag_s", "pa_u", "ag_salto"] },
    { id: "geral", n: "Geral", c: "#E3182D", ids: ["marcha", "po", "corrida_l", "joelho_a", "bu", "al", "cam_lev"] },
    { id: "recuperacao", n: "Recuperação", c: "#303036", ids: ["mob_quad", "gato_vaca", "cri", "resp"] }
  ];

  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* Ícone da categoria: tile arredondado com um símbolo simples, no estilo do app. */
  var SYM = {
    peito: '<path d="M10 22c0-6 4-9 8-7 2-2 6-2 8 0 4-2 8 1 8 7 0 6-6 10-12 14-6-4-12-8-12-14z" fill="#fff"/>',
    bracos: '<rect x="8" y="20" width="32" height="8" rx="4" fill="#fff"/><rect x="4" y="16" width="8" height="16" rx="3" fill="#fff"/><rect x="36" y="16" width="8" height="16" rx="3" fill="#fff"/>',
    ombros: '<path d="M8 30h32" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M14 30c0-10 20-10 20 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="14" cy="16" r="4" fill="#fff"/><circle cx="34" cy="16" r="4" fill="#fff"/>',
    costas: '<path d="M24 8c-4 8-4 14 0 32M24 8c4 8 4 14 0 32" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M12 18l12-6 12 6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
    abdomen: '<rect x="14" y="8" width="20" height="32" rx="6" fill="#fff"/><path d="M24 8v32M14 19h20M14 29h20" stroke="#E3182D" stroke-width="2.5"/>',
    pernas: '<path d="M18 8h12l-2 16 4 16h-6l-4-14-4 14h-6l4-16z" fill="#fff"/>',
    geral: '<circle cx="28" cy="12" r="4" fill="#fff"/><path d="M24 20l4-2 4 6 4 2M24 20l-6 4 3 10-4 6M24 20v8" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
    recuperacao: '<path d="M24 36c-8 0-14-6-14-14 6 0 10 3 14 8 4-5 8-8 14-8 0 8-6 14-14 14z" fill="#fff"/><path d="M24 36V20" stroke="#E3182D" stroke-width="2.5" stroke-linecap="round"/>'
  };
  function catIcon(cat) {
    var key = cat.id, col = cat.c;
    return '<svg class="bib-ico" viewBox="0 0 48 48" aria-hidden="true"><rect x="0" y="0" width="48" height="48" rx="14" fill="' + col + '"/>' + (SYM[key] || "") + '</svg>';
  }

  function typeText(kind) { return kind === "s" ? "Tempo" : "Repetições"; }
  function baseText(kind, v) { return kind === "s" ? (v >= 60 ? Math.round(v / 60) + " min" : v + " s") : v + " repetições"; }

  /* Normaliza para busca: minúsculas e sem acento. */
  function norm(s) { return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }

  /* Filtra exercícios. o = { q: texto, kind: "r" | "s" | "", cat: id da categoria, favs: [ids] }. Mantém a ordem das categorias. */
  function filterLib(LIB, CATS, o) {
    o = o || {};
    var q = norm(o.q), out = [];
    CATS.forEach(function (c) {
      if (o.cat && c.id !== o.cat) return;
      c.ids.forEach(function (id) {
        var e = LIB[id];
        if (!e) return;
        if (o.kind && e[1] !== o.kind) return;
        if (q && norm(e[0]).indexOf(q) < 0) return;
        if (o.favs && o.favs.indexOf(id) < 0) return;
        if (out.indexOf(id) < 0) out.push(id);
      });
    });
    return out;
  }

  /* Nível de dificuldade por cor: i = iniciante (verde), m = intermediário (âmbar), a = avançado (vermelho). Proposta aprovada. */
  var NIVEL = {
    i: { cor: "#2E9E5B", n: "Iniciante" },
    m: { cor: "#E0A800", n: "Intermediário" },
    a: { cor: "#E3182D", n: "Avançado" }
  };
  var BIB_NIVEL = {
    marcha: "i", po: "i", corrida_l: "i", joelho_a: "i", al: "i", cam_lev: "i", mob_quad: "i", gato_vaca: "i", cri: "i", resp: "i",
    fl_inc: "i", fl_j: "i", pr_j: "i", pr: "i", pr_lat_j: "i", pr_alta: "i", pg: "i", ag: "i", af_est: "i", pa: "i", cir_br: "i",
    sup: "i", sup_seg: "i", esc_ret: "i", ytw: "i", desl_par: "i", tri_par: "i", mg: "i", pk_par: "i", parede_bi: "i", chao_bi: "i",
    ag_ap: "i", pe_j: "i", bird: "i", ag_s: "i", nadad: "i",
    bu: "m", fl: "m", fl_lar: "m", fl_pau: "m", fl_iso: "m", fl_fec_j: "m", fl_fec: "m", fl_dia: "m", fl_exp: "m", pr_toque: "m", pr_flx: "m",
    pr_ant: "m", pr_c: "m", pr_lat: "m", pr_rev_j: "m", pr_rev: "m", ab_cur: "m", ab: "m", ab_cruz: "m", ab_v: "m", bi: "m", tes: "m",
    mc: "m", af: "m", af_rev: "m", af_cam: "m", pg_pau: "m", pg_u: "m", pa_u: "m", ag_pau: "m", ag_bul: "m", ag_pist: "m", pk: "m",
    pk_lent: "m", ytw_seg: "m", stiff_u: "m", stiff_par: "m", bomdia: "m", bomdia_l: "m", chin_mesa: "m", rem_mesa: "m", sup_alt: "m",
    pe: "m", ab_hol: "m", pr_lat_el: "m", mg_ret: "m", elev_lat: "m", pr_rev_p: "m", pg_el: "m", urso_t: "m",
    fl_dec: "a", fl_arq: "a", fl_dia_dec: "a", pk_ele: "a", pk_ele_l: "a", parada: "a", ag_salto: "a", af_salto: "a", mg_1: "a",
  };
  function nivelOf(id) { return NIVEL[BIB_NIVEL[id]] || null; }
  function dot(id) {
    var n = nivelOf(id); if (!n) return "";
    return '<i class="bib-lvl" style="background:' + n.cor + '" role="img" aria-label="Nível: ' + n.n + '"></i>';
  }

  function heart(id, on) {
    return '<button type="button" class="bib-heart' + (on ? " on" : "") + '" data-act="bib-fav" data-ex="' + esc(id) + '" aria-pressed="' + (on ? "true" : "false") + '" aria-label="' + (on ? "Remover dos favoritos" : "Adicionar aos favoritos") + '">' + (on ? "♥" : "♡") + "</button>";
  }
  function row(id, LIB, favs, extra) {
    var e = LIB[id];
    return '<li class="bib-li"><button type="button" class="bib-row" data-act="bib-ex" data-ex="' + esc(id) + '">' + dot(id) + '<span class="bib-row-n">' + esc(e[0]) + "</span><small>" +
      (extra ? esc(extra) + " · " : "") + typeText(e[1]) + " · " + esc(baseText(e[1], e[2])) + "</small></button>" + heart(id, favs.indexOf(id) >= 0) + "</li>";
  }
  function chip(k, label, cur) {
    return '<button type="button" class="bib-chip" data-act="bib-kind" data-kind="' + k + '" aria-pressed="' + (cur === k) + '">' + label + "</button>";
  }
  function searchBar(state) {
    return '<div class="bib-search"><input type="search" data-bib-q value="' + esc(state.q || "") + '" placeholder="Buscar exercício" aria-label="Buscar exercício" autocomplete="off"></div>' +
      '<div class="bib-chips" role="group" aria-label="Tipo de exercício">' + chip("", "Todos", state.kind || "") + chip("r", "Repetições", state.kind || "") + chip("s", "Tempo", state.kind || "") + "</div>";
  }
  function catOf(id) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].ids.indexOf(id) >= 0) return CATS[i].n;
    return "";
  }

  /* state: { view: "cats" | "cat" | "ex" | "fav", cat, ex, q, kind, fav: [ids] } */
  function html(LIB, TXT, state) {
    state = state || { view: "cats" };
    var favs = state.fav || [];
    var back = '<button type="button" class="cw-back-ico bib-back" data-act="bib-back" aria-label="Voltar"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>';
    if (state.view === "ex" && LIB[state.ex]) {
      var e = LIB[state.ex], t = TXT[state.ex] || ["", "", ""];
      var passos = t[0].split(" | ").map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("");
      var erros = t[2].split(" | ").map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("");
      return '<div class="bib-top">' + back + heart(state.ex, favs.indexOf(state.ex) >= 0) + '</div><article class="bib-ex">' +
        "<h2>" + esc(e[0]) + '</h2><p class="bib-meta">' + dot(state.ex) + (nivelOf(state.ex) ? esc(nivelOf(state.ex).n) + " · " : "") + esc(catOf(state.ex)) + " · " + typeText(e[1]) + " · valor base " + esc(baseText(e[1], e[2])) + "</p>" +
        '<p class="bib-orient">' + esc(e[3]) + '</p>' +
        '<h3>Passo a passo</h3><ol class="bib-list">' + passos + "</ol>" +
        "<h3>Respiração</h3><p>" + esc(t[1]) + "</p>" +
        '<h3>Erros comuns</h3><ul class="bib-list">' + erros + "</ul></article>";
    }
    if (state.view === "cat") {
      var cat = CATS.filter(function (c) { return c.id === state.cat; })[0];
      if (!cat) return html(LIB, TXT, { view: "cats", fav: favs });
      var items = cat.ids.filter(function (id) { return LIB[id]; }).map(function (id) { return row(id, LIB, favs); }).join("");
      return '<div class="bib-top">' + back + '</div><h2 class="bib-title">' + esc(cat.n) + '</h2><ul class="bib-rows">' + items + "</ul>";
    }
    if (state.view === "fav") {
      var ids = filterLib(LIB, CATS, { favs: favs, kind: state.kind, q: state.q });
      var body = ids.length
        ? '<ul class="bib-rows">' + ids.map(function (id) { return row(id, LIB, favs, catOf(id)); }).join("") + "</ul>"
        : '<p class="bib-empty">' + (favs.length ? "Nenhum favorito combina com a busca ou o filtro." : "Você ainda não marcou favoritos. Toque no coração em um exercício.") + "</p>";
      return '<div class="bib-top">' + back + '</div><h2 class="bib-title">Favoritos</h2>' + searchBar(state) + body;
    }
    /* Início: com busca ou filtro ativo mostra os resultados; sem isso, mostra as categorias. */
    if (state.q || state.kind) {
      var res = filterLib(LIB, CATS, { q: state.q, kind: state.kind });
      var list = res.length
        ? '<ul class="bib-rows">' + res.map(function (id) { return row(id, LIB, favs, catOf(id)); }).join("") + "</ul>"
        : '<p class="bib-empty">Nenhum exercício encontrado.</p>';
      return hero() + searchBar(state) + list;
    }
    var cards = CATS.map(function (c) {
      return '<button type="button" class="bib-card" data-act="bib-cat" data-cat="' + esc(c.id) + '">' + catIcon(c) +
        '<span class="bib-card-n">' + esc(c.n) + "</span><small>" + c.ids.filter(function (id) { return LIB[id]; }).length + " exercícios</small></button>";
    }).join("");
    var favCard = '<button type="button" class="bib-card bib-card-fav" data-act="bib-fav-open"><span class="bib-card-n">♥ Favoritos</span><small>' + favs.length + " salvo" + (favs.length === 1 ? "" : "s") + "</small></button>";
    return hero() + searchBar(state) + '<h2 class="bib-title">Biblioteca</h2><div class="bib-grid">' + cards + favCard + "</div>";
  }

  /* História da primeira vez: Bóris apresenta a biblioteca. */
  var STORY = [
    { img: "boris-frente.png", fala: "Oi! Eu sou o Bóris. Eu cuido da biblioteca." },
    { img: "boris-comemora.png", fala: "Aqui estão todos os exercícios do Crowfit, organizados por categoria: peito, braços, pernas e mais." },
    { img: "boris-pensa.png", fala: "Antes de treinar, entenda o movimento. Não é só fazer. É fazer direito." },
    { img: "boris-bracos.png", fala: "Cada exercício tem o passo a passo, a respiração e os erros mais comuns." },
    { img: "boris-incentiva.png", fala: "Forma antes de carga. Se algo estiver errado, eu aviso!" },
    { img: "boris-perfil.png", fala: "Escolha uma categoria e bora treinar!" }
  ];
  function storyHtml(i) {
    var s = STORY[i], last = i === STORY.length - 1, dots = "";
    for (var k = 0; k < STORY.length; k++) dots += '<i class="' + (k < i ? "done" : k === i ? "on" : "") + '"></i>';
    return '<section class="bib-story" aria-live="polite"><div class="bib-story-top"><div class="in-dots bib-story-dots">' + dots + '</div>' +
      '<button type="button" class="bib-skip" data-act="bib-story-skip">Pular</button></div>' +
      '<div class="bib-story-bubble">' + esc(s.fala) + '</div>' +
      '<img class="bib-story-img" src="' + esc(s.img) + '" alt="Bóris">' +
      '<button type="button" class="bib-story-btn" data-act="bib-story-next">' + (last ? "Começar" : "Continuar") + '</button></section>';
  }
  /* Cabeçalho da biblioteca com o Bóris, o instrutor. */
  function hero() {
    return '<div class="bib-hero"><img src="boris-frente.png" alt="Bóris, o instrutor"><div><b>Bóris</b><small>Instrutor da biblioteca. Toque numa categoria.</small></div></div>';
  }

  if (typeof document !== "undefined" && !document.getElementById("bib-search-css")) {
    var bst = document.createElement("style"); bst.id = "bib-search-css";
    bst.textContent = ".bib-search{margin:8px 0 10px}.bib-search input{width:100%;box-sizing:border-box;border:2px solid var(--line);border-radius:14px;padding:12px 14px;font:inherit;font-size:16px;background:#fff;color:#17171C}.bib-chips{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}.bib-chip{border:2px solid var(--line);border-radius:999px;background:#fff;color:var(--mute);padding:6px 14px;font:inherit;font-size:14px;font-weight:700;cursor:pointer}.bib-chip[aria-pressed=true]{background:#E3182D;border-color:#E3182D;color:#fff}.bib-li{display:flex;align-items:center;gap:8px}.bib-li .bib-row{flex:1}.bib-heart{flex:none;border:0;background:none;font-size:22px;line-height:1;color:var(--mute);cursor:pointer;padding:8px}.bib-heart.on{color:#E3182D}.bib-empty{color:var(--mute);font-size:15px;margin:16px 0}.bib-card-fav{grid-column:1/-1}.bib-lvl{display:inline-block;flex:none;width:10px;height:10px;border-radius:50%;margin-right:8px;vertical-align:middle}";
    document.head.appendChild(bst);
  }
  var api = { BIB_NIVEL: BIB_NIVEL, NIVEL: NIVEL, CATS: CATS, catIcon: catIcon, html: html, STORY: STORY, storyHtml: storyHtml, hero: hero, filterLib: filterLib, norm: norm };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CFBib = api;
})(typeof window !== "undefined" ? window : globalThis);
