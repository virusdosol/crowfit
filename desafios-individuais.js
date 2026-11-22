/* Desafios individuais: liga a RPC individual_challenges_list aos marcos da trilha (etapa 1, integração).
   O servidor é a ÚNICA fonte de estado (bloqueado | disponivel | em_progresso | concluido | inativo).
   Não calcula desbloqueio, não lê rolagem e não guarda nada no aparelho.
   CFI.load(): chamado ao montar a trilha. No máximo uma chamada a cada 30 s; se já houver uma em voo, reutiliza.
   Em erro, mantém o último estado recebido do servidor (não inventa estado). */
(function (root) {
  "use strict";
  var MIN_GAP = 30000, last = 0, inflight = null;

  function toMarcos(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(function (r) { return r && typeof r.id === "string" && typeof r.ancora === "string"; })
      .map(function (r) { return { id: r.id, nome: r.nome, ancora: r.ancora, estado: r.estado, estrelas: r.estrelas }; });
  }

  function client() {
    var A = root.CrowfitAuth;
    return A && A.getClient ? A.getClient() : null;
  }

  function load(force) {
    if (inflight) return inflight;
    var now = Date.now();
    if (!force && last && now - last < MIN_GAP) return Promise.resolve(false);
    var c = client();
    if (!c || !root.CFT || !root.CFT.setChallenges) return Promise.resolve(false);
    last = now;
    var zona = root.CFZ && root.CFZ.ensure ? root.CFZ.ensure() : Promise.resolve(false);
    inflight = zona.then(function () { return c.rpc("individual_challenges_list"); }).then(function (r) {
      if (r.error) throw r.error;
      root.CFT.setChallenges(toMarcos(r.data));
      return true;
    }).catch(function () {
      last = 0;      // permite nova tentativa na próxima montagem
      return false;  // mantém o último estado recebido do servidor
    }).then(function (ok) { inflight = null; return ok; });
    return inflight;
  }

  /* Atualização sem recarregar o app: volta à aba, reconecta à rede e, com a aba visível, a cada 60 s.
     load() respeita o intervalo mínimo de 30 s, então nunca gera rajada. Ligado uma única vez. */
  var REFRESH_MS = 60000, attached = false;
  function attachRefresh() {
    if (attached || typeof document === "undefined") return;
    attached = true;
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") load();
    });
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("online", function () { load(true); });
    }
    setInterval(function () {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
  }

  /* Lista atual do servidor para a página do desafio. Não usa o intervalo de load(). null = falha. */
  function fetchRows() {
    var c = client();
    if (!c) return Promise.resolve(null);
    var zona = root.CFZ && root.CFZ.ensure ? root.CFZ.ensure() : Promise.resolve(false);
    return zona.then(function () { return c.rpc("individual_challenges_list"); }).then(function (r) {
      if (r.error) return null;
      return Array.isArray(r.data) ? r.data : [];
    }).catch(function () { return null; });
  }

  var api = { load: load, toMarcos: toMarcos, attachRefresh: attachRefresh, fetchRows: fetchRows };
  if (typeof module === "object" && module.exports) module.exports = api; else root.CFI = api;
  attachRefresh();
})(typeof self !== "undefined" ? self : this);
