/* Fuso do aparelho (v11): envia ao servidor o fuso IANA do dispositivo (RPC set_my_time_zone),
   para que "hoje" (cf_user_today) siga o calendário da pessoa, e não America/Sao_Paulo.
   - O fuso vem de Intl a cada chamada. Nenhum fuso é fixado no código.
   - Envia no máximo uma vez por conta e fuso nesta sessão (só em memória, sem localStorage).
     Se o fuso mudar durante o uso, envia de novo na próxima verificação.
   - Falha da RPC (rede, versão antiga do banco, tempo esgotado) nunca interrompe o app:
     ensure() resolve false e só tenta de novo depois de RETRY_MS.
   - A RPC grava apenas user_clock. Não altera XP, datas, sessões ou histórico já contabilizados.
   Sem fuso enviado, o servidor usa o padrão de sempre (America/Sao_Paulo): nenhum usuário perde nada. */
(function (root) {
  "use strict";
  var api = { config: { timeoutMs: 8000, retryMs: 5 * 60000 } };
  var sentKey = null, inflight = null, retryAt = 0;

  function deviceZone() {
    try {
      var z = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return typeof z === "string" && z.length >= 3 && z.length <= 64 ? z : null;
    } catch (e) { return null; }
  }
  function client() { var A = root.CrowfitAuth; return A && A.getClient ? A.getClient() : null; }
  function userId() {
    var A = root.CrowfitAuth, st = A && A.getState ? A.getState() : null;
    return st && st.user && st.user.id ? st.user.id : null;
  }

  /* Resolve true se o servidor confirmou o fuso atual; false em qualquer outro caso. Nunca rejeita. */
  function ensure() {
    var z = deviceZone(), uid = userId(), c = client();
    if (!z || !uid || !c) return Promise.resolve(false);
    var key = uid + "|" + z;
    if (key === sentKey) return Promise.resolve(true);
    if (Date.now() < retryAt) return Promise.resolve(false);
    if (inflight && inflight.key === key) return inflight.p;

    var tid = null;
    var call = Promise.resolve().then(function () {
      return c.rpc("set_my_time_zone", { p: { time_zone: z } });
    });
    var limite = new Promise(function (res) {
      tid = setTimeout(function () { res({ error: { message: "timeout" } }); }, api.config.timeoutMs);
    });
    var p = Promise.race([call, limite]).then(function (r) {
      if (!r || r.error) { retryAt = Date.now() + api.config.retryMs; return false; }
      sentKey = key; return true;
    }).catch(function () {
      retryAt = Date.now() + api.config.retryMs; return false;
    }).then(function (ok) {
      if (tid) clearTimeout(tid);
      inflight = null; return ok;
    });
    inflight = { key: key, p: p };
    return p;
  }

  api.ensure = ensure;
  api.deviceZone = deviceZone;
  if (typeof module === "object" && module.exports) module.exports = api; else root.CFZ = api;
})(typeof self !== "undefined" ? self : this);
