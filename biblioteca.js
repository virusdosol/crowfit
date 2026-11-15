/* Biblioteca de exercícios: categorias (ícone) -> lista de exercícios -> página do exercício.
   Funções puras (recebem LIB e BIB_TXT). Testes: node --test biblioteca.test.js */
(function (root) {
  var CATS = [
    { id: "peito", n: "Peito", c: "#E3182D", ids: ["fl_inc", "fl_j", "fl", "fl_dec", "fl_arq", "fl_lar", "fl_pau", "fl_exp", "fl_iso", "pr_alta", "pr_toque", "pr_flx"] },
    { id: "bracos", n: "Braços", c: "#303036", ids: ["fl_fec_j", "fl_fec", "fl_dia", "fl_dia_dec", "bi_toalha", "bi_mochila", "bi_mochila_l", "bi_mochila_u", "chin_mesa", "tri_par", "mg", "mg_ret", "mg_1"] },
    { id: "ombros", n: "Ombros", c: "#E3182D", ids: ["pk_par", "pk", "pk_lent", "pk_ele", "pk_ele_l", "cir_br", "elev_lat", "urso_t", "ytw", "ytw_seg", "desl_par", "parada"] },
    { id: "costas", n: "Costas", c: "#303036", ids: ["sup", "sup_alt", "nadad", "sup_seg", "rem_mesa", "bird", "pr_rev_j", "pr_rev", "pr_rev_p", "bomdia", "bomdia_l", "stiff_u", "stiff_mo", "esc_ret", "rem_toalha"] },
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

  /* state: { view: "cats" | "cat" | "ex", cat: id, ex: id } */
  function html(LIB, TXT, state) {
    state = state || { view: "cats" };
    var back = '<button type="button" class="cw-back-ico bib-back" data-act="bib-back" aria-label="Voltar"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>';
    if (state.view === "ex" && LIB[state.ex]) {
      var e = LIB[state.ex], t = TXT[state.ex] || ["", "", ""];
      var passos = t[0].split(" | ").map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("");
      var erros = t[2].split(" | ").map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("");
      return '<div class="bib-top">' + back + '</div><article class="bib-ex">' +
        '<h2>' + esc(e[0]) + '</h2><p class="bib-meta">' + typeText(e[1]) + ' · valor base ' + esc(baseText(e[1], e[2])) + '</p>' +
        '<p class="bib-orient">' + esc(e[3]) + '</p>' +
        '<h3>Passo a passo</h3><ol class="bib-list">' + passos + '</ol>' +
        '<h3>Respiração</h3><p>' + esc(t[1]) + '</p>' +
        '<h3>Erros comuns</h3><ul class="bib-list">' + erros + '</ul></article>';
    }
    if (state.view === "cat") {
      var cat = CATS.filter(function (c) { return c.id === state.cat; })[0];
      if (!cat) return html(LIB, TXT, { view: "cats" });
      var items = cat.ids.filter(function (id) { return LIB[id]; }).map(function (id) {
        var e = LIB[id];
        return '<li><button type="button" class="bib-row" data-act="bib-ex" data-ex="' + esc(id) + '"><span class="bib-row-n">' + esc(e[0]) + '</span><small>' + typeText(e[1]) + ' · ' + esc(baseText(e[1], e[2])) + '</small></button></li>';
      }).join("");
      return '<div class="bib-top">' + back + '</div><h2 class="bib-title">' + esc(cat.n) + '</h2><ul class="bib-rows">' + items + '</ul>';
    }
    var cards = CATS.map(function (c) {
      return '<button type="button" class="bib-card" data-act="bib-cat" data-cat="' + esc(c.id) + '">' + catIcon(c) +
        '<span class="bib-card-n">' + esc(c.n) + '</span><small>' + c.ids.filter(function (id) { return LIB[id]; }).length + ' exercícios</small></button>';
    }).join("");
    return '<h2 class="bib-title">Biblioteca</h2><p class="bib-hint">Toque numa categoria para ver os exercícios.</p><div class="bib-grid">' + cards + '</div>';
  }

  var api = { CATS: CATS, catIcon: catIcon, html: html };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CFBib = api;
})(typeof window !== "undefined" ? window : globalThis);
