/* Crowfit: desafios entre amigos (cliente).
   Tudo que é competitivo vem do servidor (list_my_challenges). O aparelho só exibe e envia intenções
   (criar, aceitar, recusar, sair). Nenhum progresso ou XP é enviado pelo cliente.
   Funções puras (validate, rank, timeLeft, html) são testáveis no Node. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.CrowDesafios = f(root); })(typeof self !== "undefined" ? self : this, function (root) {
"use strict";

var METRIC = {
  xp:    { name: "XP da trilha",       unit: "XP",         min: 10, max: 100000, hint: "XP ganho nas unidades da trilha" },
  units: { name: "Unidades da trilha", unit: "unidades",   min: 1,  max: 500,    hint: "unidades concluídas da trilha" },
  days:  { name: "Dias treinados",     unit: "dias",       min: 1,  max: 30,     hint: "dias diferentes com treino" }
};
var DURATIONS = [3, 7, 14, 30];
var MAX_FRIENDS = 5;

/* ---------- regras (espelham supabase-desafios-v1.sql) ---------- */
function validate(form) {
  var errors = [];
  var title = String(form.title || "").trim();
  if (title.length < 1 || title.length > 40) errors.push("Dê um nome de 1 a 40 caracteres.");
  if (!METRIC[form.metric]) errors.push("Escolha um objetivo.");
  if (DURATIONS.indexOf(Number(form.duration)) < 0) errors.push("Escolha a duração.");
  var t = Math.floor(Number(form.target));
  if (METRIC[form.metric] && !(t >= METRIC[form.metric].min && t <= METRIC[form.metric].max)) {
    errors.push("Meta entre " + METRIC[form.metric].min + " e " + METRIC[form.metric].max + " " + METRIC[form.metric].unit + ".");
  } else if (!METRIC[form.metric]) {
    /* objetivo inválido já reportado */
  } else if (!(t >= METRIC[form.metric].min && t <= METRIC[form.metric].max)) {
    errors.push("Meta entre " + METRIC[form.metric].min + " e " + METRIC[form.metric].max + " " + METRIC[form.metric].unit + ".");
  } else if (form.metric === "days" && t > Number(form.duration)) {
    errors.push("Dias treinados não pode ser maior que a duração.");
  }
  var handles = Array.isArray(form.handles) ? form.handles : [];
  if (handles.length < 1 || handles.length > MAX_FRIENDS) errors.push("Convide de 1 a " + MAX_FRIENDS + " amigos.");
  return { ok: errors.length === 0, errors: errors, title: title, target: t };
}

/* Ranking de um desafio: só participantes aceitos têm progresso.
   Ordena por progresso (maior primeiro) e desempate pelo nome do ID. Líder só existe se houver progresso. */
function rank(members) {
  var acc = (members || []).filter(function (m) { return m.status === "accepted"; })
    .map(function (m) { return { handle: m.handle, name: m.name, me: !!m.me, progress: m.progress || 0 }; });
  acc.sort(function (a, b) { return b.progress - a.progress || (a.handle < b.handle ? -1 : 1); });
  var top = acc.length ? acc[0].progress : 0;
  acc.forEach(function (r, i) {
    r.position = i + 1;
    r.leader = top > 0 && r.progress === top;
    r.tie = top > 0 && acc.filter(function (x) { return x.progress === top; }).length > 1 && r.progress === top;
  });
  return acc;
}

function pct(progress, target) { return Math.max(0, Math.min(100, Math.round((progress || 0) / Math.max(1, target) * 100))); }

/* Tempo restante a partir de horários ISO (relógio do servidor). */
function timeLeft(endsIso, nowIso) {
  var ms = new Date(endsIso).getTime() - new Date(nowIso).getTime();
  if (!(ms > 0)) return "Encerrado";
  var h = Math.floor(ms / 36e5), d = Math.floor(h / 24);
  if (d >= 1) return "Faltam " + d + (d === 1 ? " dia" : " dias") + " e " + (h % 24) + " h";
  var m = Math.floor(ms / 6e4);
  return h >= 1 ? "Faltam " + h + " h" : "Faltam " + Math.max(1, m) + " min";
}

function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

/* Quantos a meta falta para quem ainda não chegou. */
function remaining(progress, target) { return Math.max(0, target - (progress || 0)); }

/* ---------- datas e resultado (puras) ---------- */
function fmtDate(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
/* Janela do desafio, sempre visível: início e término (horário deste aparelho). */
function windowLine(ch) {
  return "Início " + fmtDate(ch.starts_at) + " · Término " + fmtDate(ch.ends_at);
}
/* Quem entra depois do início tem menos tempo: avisa antes de aceitar. */
function lateNote(ch, now) {
  return new Date(now).getTime() > new Date(ch.starts_at).getTime()
    ? "Você entra depois do início: sua contagem começa agora e terá menos tempo que os demais."
    : "";
}
var PRIVACY_NOTE = "Os nomes e o progresso dos participantes ficam visíveis para quem está no desafio.";
/* Resultado final de um desafio encerrado. */
function resultText(members) {
  var rk = rank(members);
  if (!rk.length || rk[0].progress <= 0) return "Ninguém registrou progresso neste desafio.";
  var leaders = rk.filter(function (r) { return r.leader; });
  if (leaders.length > 1) return "Empate entre " + leaders.map(function (r) { return esc(r.name || r.handle); }).join(" e ") + " com " + rk[0].progress + ".";
  return "🏆 " + esc(leaders[0].name || leaders[0].handle) + " venceu com " + leaders[0].progress + ".";
}

/* ---------- apresentação ---------- */
var TABS = [
  { k: "received", label: "Recebidos" },
  { k: "sent", label: "Enviados" },
  { k: "active", label: "Ativos" },
  { k: "finished", label: "Concluídos" }
];

function card(ch, now, tab) {
  var m = METRIC[ch.metric] || METRIC.xp;
  var rk = rank(ch.members);
  var mine = (ch.members || []).filter(function (x) { return x.me; })[0];
  var myProg = mine && mine.status === "accepted" ? (mine.progress || 0) : null;
  var h = '<article class="dg-card" data-dg="' + esc(ch.id) + '">';
  h += '<header><b>' + esc(ch.title) + '</b><span class="dg-tag">' + esc(m.name) + ' · meta ' + esc(ch.target) + ' ' + esc(m.unit) + '</span></header>';
  h += '<p class="dg-sub dg-win">' + esc(windowLine(ch)) + '</p>';
  if (tab === "received") {
    h += '<p class="dg-sub">Convidado por <b>' + esc(ch.creator_name || ch.creator_handle || "um amigo") + '</b>. ' + esc(timeLeft(ch.ends_at, now)) + '.</p>';
    var late = lateNote(ch, now);
    if (late) h += '<p class="dg-note">' + esc(late) + '</p>';
    h += '<p class="dg-sub">' + esc(PRIVACY_NOTE) + '</p>';
    h += '<div class="dg-row"><button type="button" class="btn" data-dg-act="accept" data-dg-id="' + esc(ch.id) + '">Aceitar</button>' +
         '<button type="button" class="btn sec" data-dg-act="decline" data-dg-id="' + esc(ch.id) + '">Recusar</button></div>';
  } else {
    if (tab === "finished") h += '<p class="dg-sub"><b>Encerrado.</b> ' + resultText(ch.members) + '</p>';
    else h += '<p class="dg-sub">' + esc(timeLeft(ch.ends_at, now)) + '</p>';
    if (myProg != null) {
      h += '<div class="dg-track"><i style="width:' + pct(myProg, ch.target) + '%"></i></div>' +
           '<p class="dg-sub">Você: ' + myProg + ' de ' + esc(ch.target) + ' ' + esc(m.unit) +
           (myProg >= ch.target ? " · meta atingida" : " · faltam " + remaining(myProg, ch.target)) + '</p>';
    }
    if (rk.length) {
      h += '<ol class="dg-rank">';
      rk.forEach(function (r) {
        h += '<li' + (r.me ? ' class="me"' : '') + '><span>' + (r.leader ? "👑 " : "") + esc(r.name || r.handle) + (r.me ? " (você)" : "") +
             (r.tie ? " · empate" : "") + '</span><b>' + r.progress + '</b></li>';
      });
      h += '</ol>';
    }
    var pend = (ch.members || []).filter(function (x) { return x.status === "invited"; });
    if (pend.length) h += '<p class="dg-sub">Aguardando resposta: ' + pend.map(function (x) { return esc(x.name || x.handle); }).join(", ") + '</p>';
    if (tab === "active" && !ch.is_creator) h += '<div class="dg-row"><button type="button" class="link" data-dg-act="leave" data-dg-id="' + esc(ch.id) + '">Sair do desafio</button></div>';
  }
  return h + '</article>';
}

/* Gera a tela: abas e cartões. data = resposta de list_my_challenges. */
function html(data, tab, opts) {
  opts = opts || {};
  tab = TABS.some(function (t) { return t.k === tab; }) ? tab : "active";
  var now = data.server_now || new Date().toISOString();
  var list = data[tab] || [];
  var h = '<div class="dg-wrap"><div class="dg-top"><button type="button" class="cw-back-ico" id="dg-bk" aria-label="Voltar" aria-label="Voltar"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><h2>Desafios</h2></div>';
  if (opts.pending) h += '<p class="dg-note">Sem conexão: mostrando a última lista carregada.</p>';
  h += '<div class="dg-tabs" role="tablist">';
  TABS.forEach(function (t) {
    var n = (data[t.k] || []).length;
    h += '<button type="button" role="tab" class="dg-tab" data-dg-tab="' + t.k + '" aria-selected="' + (t.k === tab) + '">' + t.label + (n ? " (" + n + ")" : "") + '</button>';
  });
  h += '</div>';
  h += '<button type="button" class="btn dg-new" id="dg-new">Novo desafio</button>';
  if (!list.length) h += '<div class="dg-empty"><p>' + (tab === "received" ? "Nenhum convite no momento." : "Nada aqui ainda.") + '</p></div>';
  else list.forEach(function (ch) { h += card(ch, now, tab); });
  return h + '</div>';
}


/* ---------- conversa com o servidor (somente intenções; nada de progresso) ---------- */
var ERR = {
  not_friends: "Você só pode desafiar amigos aceitos.",
  user_not_found: "Não encontramos um dos amigos escolhidos.",
  too_many_challenges: "Você já tem 10 desafios ativos. Espere um terminar.",
  invite_expired: "Este convite expirou.",
  challenge_ended: "Este desafio já terminou.",
  creator_cannot_leave: "Quem criou o desafio não pode sair dele.",
  not_invited: "Este convite não está mais disponível.",
  not_member: "Você não participa deste desafio.",
  not_authenticated: "Entre na sua conta para usar os desafios."
};
function errMsg(e) {
  var m = (e && e.message) || "";
  for (var k in ERR) if (m.indexOf(k) >= 0) return ERR[k];
  return "Não foi possível concluir agora. Tente de novo com conexão.";
}

/* Abre a área de desafios dentro de "box". client = cliente do CrowfitAuth. Renderiza e atualiza sozinha. */
function open(box, client, after) {
  var state = { data: null, tab: "active", pending: false, msg: "" };
  function call(name, p) {
    return client.rpc(name, { p: p || {} }).then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
  }
  function draw() {
    if (!state.data) { box.innerHTML = '<div class="dg-wrap"><p class="dg-sub">Carregando…</p></div>'; return; }
    box.innerHTML = html(state.data, state.tab, { pending: state.pending }) +
      (state.msg ? '<p class="dg-note">' + esc(state.msg) + '</p>' : "");
    bind();
  }
  function reload() {
    return call("list_my_challenges").then(function (d) { state.data = d; state.pending = false; draw(); })
      .catch(function () { state.pending = !!state.data; if (!state.data) state.msg = "Não foi possível carregar os desafios."; draw(); });
  }
  function act(fn) {
    state.msg = "";
    return fn().then(function () { return reload(); }).catch(function (e) { state.msg = errMsg(e); draw(); });
  }
  function bind() {
    var back = box.querySelector("#dg-bk");
    if (back && after) back.onclick = after;
    Array.prototype.forEach.call(box.querySelectorAll("[data-dg-tab]"), function (b) {
      b.onclick = function () { state.tab = b.getAttribute("data-dg-tab"); state.msg = ""; draw(); };
    });
    Array.prototype.forEach.call(box.querySelectorAll("[data-dg-act]"), function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-dg-id"), a = b.getAttribute("data-dg-act");
        if (a === "leave" && !root.confirm("Sair deste desafio? Seu progresso deixa de contar.")) return;
        act(function () {
          if (a === "accept") return call("respond_challenge", { id: id, accept: true });
          if (a === "decline") return call("respond_challenge", { id: id, accept: false });
          return call("leave_challenge", { id: id });
        });
      };
    });
    var nw = box.querySelector("#dg-new");
    if (nw) nw.onclick = function () { showCreate(); };
  }
  function showCreate() {
    state.msg = "";
    box.innerHTML = '<div class="dg-wrap"><p class="dg-sub">Carregando amigos…</p></div>';
    call("get_my_social").then(function (soc) {
      var friends = (soc && soc.friends) || [];
      var f = { title: "", metric: "units", target: 5, duration: 7, handles: [] };
      var mhtml = '<div class="dg-wrap"><div class="dg-top"><button type="button" class="cw-back-ico" id="dg-cancel" aria-label="Voltar" aria-label="Voltar"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><h2>Novo desafio</h2></div>' +
        '<label class="dg-lbl">Nome<input id="dg-title" maxlength="40" placeholder="Ex.: Semana forte"></label>' +
        '<p class="dg-lbl">Objetivo</p><div class="dg-opts">' +
        Object.keys(METRIC).map(function (k) { return '<button type="button" class="dg-opt" data-dg-m="' + k + '" aria-pressed="' + (k === f.metric) + '">' + esc(METRIC[k].name) + '</button>'; }).join("") +
        '</div><label class="dg-lbl">Meta (<span id="dg-unit"></span>)<input id="dg-target" type="number" inputmode="numeric" value="' + f.target + '"></label>' +
        '<p class="dg-lbl">Duração</p><div class="dg-opts">' +
        DURATIONS.map(function (d) { return '<button type="button" class="dg-opt" data-dg-d="' + d + '" aria-pressed="' + (d === f.duration) + '">' + d + ' dias</button>'; }).join("") +
        '</div><p class="dg-lbl">Amigos (até ' + MAX_FRIENDS + ')</p>' +
        (friends.length ? friends.map(function (x) { return '<label class="dg-chk"><input type="checkbox" value="' + esc(x.handle) + '"> ' + esc(x.name || x.handle) + '</label>'; }).join("")
          : '<p class="dg-sub">Você ainda não tem amigos para desafiar.</p>') +
        '<p class="dg-sub">' + esc(PRIVACY_NOTE) + '</p><p class="dg-sub">A contagem começa ao criar o desafio e vale para todos. Quem aceita depois do início terá menos tempo.</p>' +
        '<div class="dg-row"><button type="button" class="btn" id="dg-send">Enviar convites</button></div><p class="dg-note" id="dg-err"></p></div>';
      box.innerHTML = mhtml;
      function unitTxt() { var m = METRIC[f.metric]; box.querySelector("#dg-unit").textContent = m.unit + ", de " + m.min + " a " + m.max; }
      unitTxt();
      box.querySelector("#dg-cancel").onclick = function () { draw(); };
      Array.prototype.forEach.call(box.querySelectorAll("[data-dg-m]"), function (b) {
        b.onclick = function () { f.metric = b.getAttribute("data-dg-m"); Array.prototype.forEach.call(box.querySelectorAll("[data-dg-m]"), function (x) { x.setAttribute("aria-pressed", String(x === b)); }); unitTxt(); };
      });
      Array.prototype.forEach.call(box.querySelectorAll("[data-dg-d]"), function (b) {
        b.onclick = function () { f.duration = +b.getAttribute("data-dg-d"); Array.prototype.forEach.call(box.querySelectorAll("[data-dg-d]"), function (x) { x.setAttribute("aria-pressed", String(x === b)); }); };
      });
      box.querySelector("#dg-send").onclick = function () {
        f.title = box.querySelector("#dg-title").value;
        f.target = box.querySelector("#dg-target").value;
        f.handles = Array.prototype.filter.call(box.querySelectorAll(".dg-chk input:checked"), function (c) { return true; }).map(function (c) { return c.value; });
        var v = validate(f), err = box.querySelector("#dg-err");
        if (!v.ok) { err.textContent = v.errors.join(" "); return; }
        err.textContent = "Enviando…";
        call("create_challenge", { title: v.title, metric: f.metric, target: v.target, duration_days: f.duration, handles: f.handles })
          .then(function () { state.tab = "sent"; return reload(); })
          .catch(function (e) { err.textContent = errMsg(e); });
      };
    }).catch(function () { state.msg = "Não foi possível carregar seus amigos."; draw(); });
  }
  reload();
  return { reload: reload };
}

return { open: open, validate: validate, rank: rank, pct: pct, timeLeft: timeLeft, remaining: remaining, html: html, METRIC: METRIC, DURATIONS: DURATIONS, MAX_FRIENDS: MAX_FRIENDS, TABS: TABS };
});
