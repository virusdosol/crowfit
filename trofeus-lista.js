/* Página de troféus: funções puras de organização (categorias, busca e filtros).
   Não altera nenhum dado: recebem as linhas de trophyRows() (catálogo já existente). Testes: trofeus-lista.test.js */
(function (root) {
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }
  function won(row) { return row.levels.filter(function (l) { return l.unlocked; }).length; }
  /* Filtros reais, sobre os níveis já calculados pelo sistema:
     prog = começou (tem progresso) mas ainda não desbloqueou tudo; unl = pelo menos 1 troféu; done = os 4 níveis. */
  function matches(row, f) {
    var w = won(row);
    if (f === "prog") return row.value > 0 && w < row.levels.length;
    if (f === "unl") return w >= 1;
    if (f === "done") return w === row.levels.length;
    return true;
  }
  function filterRows(rows, f, q) {
    var qq = norm(q);
    return rows.filter(function (r) { return matches(r, f) && (!qq || norm(r.name).indexOf(qq) >= 0); });
  }
  /* Resumo por categoria (categorias = as da biblioteca). Só conta exercícios que existem no catálogo. */
  function categorySummary(rows, cats) {
    return cats.map(function (c) {
      var rs = rows.filter(function (r) { return c.ids.indexOf(r.id) >= 0; });
      var w = rs.reduce(function (a, r) { return a + won(r); }, 0);
      return { id: c.id, n: c.n, cat: c, exercises: rs.length, won: w, total: rs.length * 4 };
    });
  }
  function catOf(cats, id) {
    for (var i = 0; i < cats.length; i++) if (cats[i].ids.indexOf(id) >= 0) return cats[i];
    return null;
  }
  var api = { norm: norm, won: won, matches: matches, filterRows: filterRows, categorySummary: categorySummary, catOf: catOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CFTrL = api;
})(typeof window !== "undefined" ? window : globalThis);
