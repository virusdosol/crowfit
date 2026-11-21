/* Página do desafio individual. Abre a partir de um marco da trilha (estado "open").
   Fonte de verdade: o servidor. Total, estrelas, metas e estado vêm de individual_challenges_list.
   Registrar série: RPC individual_challenge_record_series (idempotente pela chave).
   Regras de interface:
   - o total só muda depois da confirmação do servidor (nunca localmente antes);
   - em falha sem confirmação (timeout, rede), a mesma chave é reutilizada: nada é duplicado;
   - desafio concluído (3 estrelas) ou bloqueado/inativo não mostra formulário;
   - erros mostram mensagem genérica; nenhum dado de outra pessoa aparece. */
(function (root) {
  "use strict";
  var MAX_REPS = 1000;
  var MSG = {
    locked: "Este desafio ainda não está liberado.",
    completed: "Desafio concluído. Não é possível registrar novas séries.",
    challenge_inactive: "Este desafio não está disponível no momento.",
    challenge_not_found: "Desafio não encontrado.",
    idempotency_conflict: "Esta série já foi registrada com outros dados. Atualize a página.",
    xp_divergente: "Não foi possível confirmar a recompensa. Nada foi registrado. Tente novamente mais tarde.",
    overflow: "Quantidade acima do limite.",
    invalid_reps: "Informe um número inteiro de repetições entre 1 e " + MAX_REPS + ".",
    invalid_key: "Não foi possível identificar o envio. Tente novamente.",
    not_authenticated: "Entre na sua conta para registrar séries.",
    generic: "Não foi possível registrar agora. Tente novamente."
  };
  var api = { config: { timeoutMs: 8000 }, MSG: MSG, MAX_REPS: MAX_REPS };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function intOr(v, d) { var n = Number(v); return Number.isInteger(n) ? n : d; }
  function validReps(n) { return Number.isInteger(n) && n >= 1 && n <= MAX_REPS; }
  function validMetas(m) {
    if (!Array.isArray(m) || m.length !== 3) return null;
    for (var i = 0; i < 3; i++) {
      if (!Number.isInteger(m[i]) || m[i] <= 0) return null;
      if (i > 0 && m[i] <= m[i - 1]) return null;
    }
    return m;
  }

  /* Modelo de exibição derivado só do que o servidor informou. */
  function model(row) {
    var estrelas = Math.min(3, Math.max(0, intOr(row.estrelas, 0)));
    var total = Math.max(0, intOr(row.total_reps, 0));
    var metas = validMetas(row.metas);
    var concluido = row.estado === "concluido" || estrelas === 3;
    var estado = concluido ? "concluido" : row.estado;
    var proxima = metas && !concluido ? metas[estrelas] : null;
    var anterior = metas && estrelas > 0 ? metas[estrelas - 1] : 0;
    var pct = concluido ? 100 : proxima != null
      ? Math.min(100, Math.max(0, Math.round((total - anterior) * 100 / (proxima - anterior))))
      : 0;
    return {
      id: row.id, nome: String(row.nome || ""), atividade: String(row.atividade || ""),
      total: total, estrelas: estrelas, metas: metas, proxima: proxima,
      faltam: proxima != null ? Math.max(0, proxima - total) : 0,
      pct: pct, estado: estado, concluido: concluido,
      podeRegistrar: !concluido && (estado === "disponivel" || estado === "em_progresso"),
    };
  }

  function codeOf(err) {
    var m = err && err.message ? String(err.message) : "";
    return Object.prototype.hasOwnProperty.call(MSG, m) ? m : "generic";
  }

  /* Envia uma série. Resolve sempre (nunca rejeita). unconfirmed=true quando o servidor pode ou não ter gravado. */
  function submit(client, challengeId, reps, key) {
    if (!validReps(reps)) return Promise.resolve({ ok: false, code: "invalid_reps", unconfirmed: false });
    var tid = null;
    var call = Promise.resolve().then(function () {
      return client.rpc("individual_challenge_record_series", {
        p_challenge_id: challengeId, p_repeticoes: reps, p_chave: key,
      });
    });
    var limite = new Promise(function (res) {
      tid = setTimeout(function () { res({ __timeout: true }); }, api.config.timeoutMs);
    });
    return Promise.race([call, limite]).then(function (r) {
      if (r && r.__timeout) return { ok: false, code: "timeout", unconfirmed: true };
      if (!r || r.error) {
        var code = codeOf(r && r.error);
        return { ok: false, code: code, unconfirmed: code === "generic" };
      }
      return { ok: true, data: r.data };
    }).catch(function () {
      return { ok: false, code: "network", unconfirmed: true };
    }).then(function (out) {
      if (tid) clearTimeout(tid);
      return out;
    });
  }

  /* Prepara o envio. Se já existe um envio pendente (falha sem confirmação), reutiliza reps e chave. */
  function prepare(ui, raw) {
    if (ui.pendingKey) return { ok: true, reps: ui.pendingReps, key: ui.pendingKey };
    var reps = Number(raw);
    if (!validReps(reps)) return { ok: false, code: "invalid_reps" };
    return { ok: true, reps: reps, key: newKey() };
  }

  function newKey() {
    var c = root.crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    var b = [], i;
    for (i = 0; i < 16; i++) b.push(Math.floor(Math.random() * 256));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = b.map(function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  /* Atualiza a linha só com o que o servidor confirmou. */
  function applyConfirmed(row, data) {
    var estrelas = Math.min(3, Math.max(0, intOr(data.estrelas, 0)));
    return Object.assign({}, row, {
      total_reps: intOr(data.total, row.total_reps),
      estrelas: estrelas,
      estado: estrelas === 3 ? "concluido" : estrelas > 0 ? "em_progresso" : "disponivel",
    });
  }

  function render(row, ui) {
    var m = model(row); ui = ui || {};
    var stars = [0, 1, 2].map(function (i) {
      return '<span class="cd-star' + (i < m.estrelas ? " on" : "") + '" aria-hidden="true">★</span>';
    }).join("");
    var metas = m.metas
      ? '<ol class="cd-metas">' + m.metas.map(function (x, i) {
          return "<li" + (i < m.estrelas ? ' class="ok"' : "") + ">Estrela " + (i + 1) + ": " + x + " repetições</li>";
        }).join("") + "</ol>"
      : "";
    var proximo = m.metas && !m.concluido ? '<p class="cd-next">Faltam ' + m.faltam + " repetições para a próxima estrela.</p>" : "";
    var bar = '<div class="cd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + m.pct + '"><i style="width:' + m.pct + '%"></i></div>';
    var msg = ui.msg ? '<p class="cd-msg" role="status">' + esc(ui.msg) + "</p>" : "";
    var acao;
    if (m.concluido) {
      acao = '<p class="cd-done" role="status">Desafio concluído</p>';
    } else if (!m.podeRegistrar) {
      acao = '<p class="cd-locked" role="status">' + esc(row.estado === "inativo" ? MSG.challenge_inactive : MSG.locked) + "</p>";
    } else {
      var val = ui.pendingReps ? ' value="' + ui.pendingReps + '"' : "";
      acao = '<label class="cd-label" for="cd-reps">Repetições desta série</label>' +
        '<input id="cd-reps" class="cd-input" type="number" inputmode="numeric" min="1" max="' + MAX_REPS + '" step="1"' + val + (ui.busy ? " disabled" : "") + ">" +
        '<button id="cd-send" class="btn cd-send" type="button"' + (ui.busy ? " disabled" : "") + ">" +
        (ui.pendingKey ? "Tentar de novo" : "Registrar série") + "</button>";
    }
    return '<div class="cd-top"><button class="chip" id="cd-back" type="button" aria-label="Voltar à trilha">← Trilha</button></div>' +
      '<div class="cd-wrap"><p class="cd-kicker">' + esc(m.atividade) + "</p><h1>" + esc(m.nome) + "</h1>" +
      '<div class="cd-stars">' + stars + "</div>" +
      '<p class="cd-total"><b>' + m.total + "</b> repetições</p>" + bar + proximo + metas + msg + acao + "</div>";
  }

  /* Abre a página. Usa o servidor como fonte; nada é gravado localmente. */
  function open(ctx, challengeId) {
    var I = root.CFI, A = root.CrowfitAuth;
    var C = A && A.getClient ? A.getClient() : null;
    var st = { row: null, ui: { msg: "", busy: false, pendingReps: null, pendingKey: null } };

    function bind() {
      var b = document.getElementById("cd-back"); if (b) b.onclick = ctx.back;
      var s = document.getElementById("cd-send"); if (s) s.onclick = send;
      var r = document.getElementById("cd-retry"); if (r) r.onclick = function () { open(ctx, challengeId); };
    }
    function paint() { ctx.view(render(st.row, st.ui)); bind(); }
    function errorView(msg) {
      ctx.view('<div class="cd-top"><button class="chip" id="cd-back" type="button">← Trilha</button></div>' +
        '<div class="cd-wrap"><p class="cd-msg" role="status">' + esc(msg) + '</p>' +
        '<button class="btn sec" id="cd-retry" type="button">Tentar de novo</button></div>');
      bind();
    }
    function send() {
      var input = document.getElementById("cd-reps");
      var pr = prepare(st.ui, input ? input.value : "");
      if (!pr.ok) { st.ui.msg = MSG[pr.code]; paint(); return; }
      st.ui.pendingReps = pr.reps; st.ui.pendingKey = pr.key;
      st.ui.busy = true; st.ui.msg = ""; paint();
      submit(C, st.row.id, pr.reps, pr.key).then(function (out) {
        st.ui.busy = false;
        if (out.ok) {
          st.row = applyConfirmed(st.row, out.data);
          var novas = Array.isArray(out.data.conquistas) ? out.data.conquistas : [];
          st.ui = { msg: out.data.replay ? "Esta série já estava registrada."
                       : novas.length ? "Estrela " + novas[novas.length - 1].estrela + " conquistada!"
                       : "Série registrada.",
                    busy: false, pendingReps: null, pendingKey: null };
          if (I && I.load) I.load(true);   // atualiza a trilha com o estado do servidor
        } else if (out.unconfirmed) {
          st.ui.msg = "Não confirmamos o registro. Toque em Tentar de novo: a série não será duplicada.";
        } else {
          st.ui.msg = MSG[out.code] || MSG.generic;
          st.ui.pendingReps = null; st.ui.pendingKey = null;
        }
        paint();
      });
    }

    ctx.view('<div class="cd-top"><button class="chip" id="cd-back" type="button">← Trilha</button></div><p class="cd-loading" role="status">Carregando…</p>');
    bind();
    if (!I || !I.fetchRows) { errorView("Não foi possível carregar o desafio."); return; }
    I.fetchRows().then(function (rows) {
      if (rows === null) { errorView("Não foi possível carregar o desafio."); return; }
      var row = rows.filter(function (r) { return r && r.id === challengeId; })[0];
      if (!row) { errorView(MSG.challenge_not_found); return; }
      st.row = row; paint();
    });
  }

  api.model = model;
  api.validReps = validReps;
  api.submit = submit;
  api.prepare = prepare;
  api.applyConfirmed = applyConfirmed;
  api.render = render;
  api.newKey = newKey;
  api.open = open;
  if (typeof module === "object" && module.exports) module.exports = api; else root.CFDI = api;
})(typeof self !== "undefined" ? self : this);
