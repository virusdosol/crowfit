/* Crowfit: trilha de progressão (semanas de 7 dias, unidades, aro vermelho e página do treino).
   Visual: a semana segue o calendário (domingo a sábado) e muda a cor dos círculos a cada semana (grafite, vermelho, branco, preto, em ciclo).
   A primeira semana pode ser parcial (começa no dia inicial). Dia que já passou fica indisponível e apagado. Só o mês atual (4 semanas de calendário) fica liberado; os meses seguintes aparecem bloqueados, com cadeado.
   Internamente a "seção" de 3 meses continua existindo (program.js e as chaves s1u4 não mudam); só deixou de aparecer na tela.
   Depende de CF (core.js) e CFP (program.js). O progresso fica em S.trail, dentro da chave "corvofit-v1":
     S.trail = { start: "AAAA-MM-DD", ex: { "s1u4": { "ag": true } }, lv: { "1": 0 } }
   Tudo o mais (seção, unidade, data, grupo, exercícios, totais, estado) é DERIVADO de start + calendário + program.js. */
(function (root) {
"use strict";
var C = root.CF, P = root.CFP, T = {}, V = null, dirty = false, obs = null, bound = false, raf = 0;
function $(id) { return document.getElementById(id); }
function fmt(d) { return d.slice(8) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4); }
function ymd(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
function between(a, b) { return Math.round((ymd(b) - ymd(a)) / 864e5); }
function addM(s, m) { var y = +s.slice(0, 4), mo = +s.slice(5, 7) - 1 + m, d = +s.slice(8, 10); y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return C.dateKey(new Date(y, mo, Math.min(d, new Date(y, mo + 1, 0).getDate()))); }

function ensure(S, t) {
  var tr = S.trail; if (!tr || typeof tr !== "object") tr = S.trail = { start: "", ex: {}, lv: {} };
  if (!tr.ex) tr.ex = {}; if (!tr.lv) tr.lv = {};
  if (!tr.start) { tr.start = t; dirty = true; }
  return tr;
}
/* Início da seção k: sempre ancorado na data inicial (+3 meses de calendário por seção), então não acumula erro de dias. */
function secStart(S, k) { return addM(S.trail.start, 3 * (k - 1)); }
function secOf(S, i) {
  var d = C.addDays(S.trail.start, i), k = Math.max(1, Math.floor(i / 93));
  while (k > 1 && d < secStart(S, k)) k--;
  while (d >= secStart(S, k + 1)) k++;
  return k;
}
function unitAt(S, i) {
  var date = C.addDays(S.trail.start, i), k = secOf(S, i), n = between(secStart(S, k), date) + 1;
  return { i: i, date: date, sec: k, n: n, dow: C.parseDate(date).getDay(), key: "s" + k + "u" + n };
}
function idxOf(S, date) { return between(S.trail.start, date); }
/* Nível base da seção: congelado quando a seção começa, para que treinos já feitos não mudem de exercício depois. */
function level(ctx, k) {
  var S = ctx.S, lv = S.trail.lv[k];
  if (lv !== undefined) return lv;
  lv = S.profile ? C.levelFor(S.profile, S.adjust) : 0;
  if (secStart(S, k) <= ctx.today) { S.trail.lv[k] = lv; dirty = true; }
  return lv;
}
function content(ctx, u) { return P.build(u.sec, u.n, u.dow, level(ctx, u.sec)); }
function isDone(ctx, i) {
  var u = unitAt(ctx.S, i), ct = content(ctx, u), m = ctx.S.trail.ex[u.key] || {};
  return ct.exercises.length > 0 && ct.exercises.every(function (e) { return m[e.id] === true; });
}
/* Regra de liberação: a unidade abre somente no dia dela (a partir da meia-noite). Não dá para adiantar. */
function unlocked(ctx, i) { return C.addDays(ctx.S.trail.start, i) <= ctx.today; }
function prog(ctx, u, ct) {
  var m = ctx.S.trail.ex[u.key] || {}, tot = ct.exercises.length, done = ct.exercises.filter(function (e) { return m[e.id] === true; }).length, p = tot ? done / tot : 0;
  return { done: done, total: tot, p: p, map: m, st: p >= 1 ? "done" : u.date < ctx.today ? "miss" : done > 0 ? "prog" : (unlocked(ctx, u.i) ? "avail" : "fut") };
}
function ring(p) {
  return '<svg class="rg" viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="46"/>' +
    (p > 0 ? '<circle class="arc" cx="50" cy="50" r="46" pathLength="100" stroke-dasharray="' + (Math.min(1, p) * 100).toFixed(3) + ' 100" transform="rotate(-90 50 50)"/>' : "") + '</svg>';
}
function icon(g) { return '<svg class="ico" viewBox="0 0 48 48" aria-hidden="true">' + P.ICON[g] + '</svg>'; }
function pct(p) { return Math.round(p * 100); }

/* Semana = 7 dias corridos a partir do início da trilha; mês liberado = 4 semanas. Só afeta a exibição. */
var MES = 28, FRASES = ["Tenha paciência.", "Você vai chegar lá."], fi = 0, tt = 0;
/* Semana de calendário (dom a sáb). off = dias da primeira semana que ficaram antes da data inicial (0 se começou no domingo). */
function off(S) { return C.parseDate(S.trail.start).getDay(); }
function wk(S, i) { var o = off(S), j = i + o; return { w: Math.floor(j / 7) + 1, d: (j % 7) + 1 - (j < 7 ? o : 0), c: Math.floor(j / 7) % 4 }; }
/* Último índice liberado: fim da 4ª semana de calendário do bloco atual (o mês nunca corta uma semana no meio). */
function lastOpen(S, ti) { var o = off(S); return (Math.floor(Math.floor((ti + o) / 7) / 4) + 1) * MES - o - 1; }
function toast(msg) {
  var el = $("t-toast");
  if (!el) { el = document.createElement("div"); el.id = "t-toast"; el.className = "t-toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg || FRASES[fi++ % FRASES.length]; el.classList.add("on"); clearTimeout(tt);
  tt = setTimeout(function () { el.classList.remove("on"); }, 2200);
}
var LOCK = '<svg class="ico" viewBox="0 0 48 48" aria-hidden="true"><rect x="11" y="21" width="26" height="19" rx="4"/><path d="M16 21v-6a8 8 0 0 1 16 0v6"/><circle cx="24" cy="30.5" r="2"/></svg>';

function nodeHtml(ctx, i, locked) {
  var u = unitAt(ctx.S, i), W = wk(ctx.S, i), x = Math.round(Math.sin(i * 0.85) * 62);
  if (locked) {
    return '<button class="tn st-lock" data-i="' + i + '" data-w="' + W.w + '" data-n="' + W.d + '" data-t="Treino bloqueado" style="--x:' + x + 'px" aria-label="Semana ' + W.w + ', unidade ' + W.d + ', ' + P.DIAS[u.dow] + ', bloqueada">' +
      '<span class="rb">' + ring(0) + '<span class="tn-btn">' + LOCK + '</span></span><span class="tn-lbl">U' + W.d + ' · ' + P.DIAS_ABR[u.dow] + '</span></button>';
  }
  var ct = content(ctx, u), pr = prog(ctx, u, ct), isT = u.date === ctx.today;
  var label = "Semana " + W.w + ", unidade " + W.d + ", " + P.DIAS[u.dow] + ", " + ct.title + ", " + pr.done + " de " + pr.total + " exercícios concluídos" + (pr.st === "fut" ? ", ainda não liberado" : pr.st === "miss" ? ", dia encerrado, indisponível" : "");
  return '<button class="tn wk' + W.c + ' st-' + pr.st + (isT ? " today" : "") + (ct.group === "R" ? " rest" : "") + '"' + (pr.st === "miss" ? ' aria-disabled="true"' : "") + ' data-i="' + i + '" data-w="' + W.w + '" data-n="' + W.d + '" data-t="' + ctx.esc(ct.title) + '" data-d="' + P.DIAS_ABR[u.dow] + '" style="--x:' + x + 'px" aria-label="' + ctx.esc(label) + '">' +
    (isT ? '<span class="tn-bub">' + (pr.st === "done" ? "FEITO" : pr.done ? "CONTINUAR" : "COMEÇAR") + '</span>' : "") +
    '<span class="rb">' + ring(pr.p) + '<span class="tn-btn">' + icon(ct.group) + '</span></span>' +
    (pr.st === "done" ? '<span class="tn-chk" aria-hidden="true">✓</span>' : "") +
    '<span class="tn-lbl">U' + W.d + ' · ' + P.DIAS_ABR[u.dow] + '</span></button>';
}
function gate() {
  return '<button class="t-gate" type="button" aria-label="Meses seguintes bloqueados"><span class="tg-l"></span><span class="tg-i">' + LOCK + '</span><span class="tg-l"></span></button>';
}
function range(ctx, lo, hi, last) {
  var h = "", zone = false;
  for (var i = lo; i <= hi; i++) { if (i === last + 1) { h += gate() + '<div class="t-zone">'; zone = true; } h += nodeHtml(ctx, i, i > last); }
  return h + (zone ? "</div>" : "");
}
function flush(ctx) { if (dirty) { dirty = false; ctx.save(); } }

function banner() {
  var ban = $("t-ban"); if (!ban) return;
  var nodes = document.querySelectorAll(".tn"), line = ban.getBoundingClientRect().bottom + 8, pick = nodes[0];
  for (var j = 0; j < nodes.length; j++) { pick = nodes[j]; if (nodes[j].getBoundingClientRect().bottom > line) break; }
  var tn = document.querySelector(".tn.today");
  if (tn) { var r = tn.getBoundingClientRect(); if (r.bottom > line && r.top < window.innerHeight) pick = tn; }
  if (!pick) return;
  $("tb-s").textContent = "SEMANA " + pick.getAttribute("data-w") + ", UNIDADE " + pick.getAttribute("data-n");
  $("tb-t").textContent = pick.getAttribute("data-t");
}
function onScroll() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; banner(); }); }

function mount(el, ctx) {
  var S = ctx.S, tr = ensure(S, ctx.today), ti = Math.max(0, idxOf(S, ctx.today)), last = lastOpen(S, ti), hi = last + MES;
  if (!V || V.start !== tr.start) V = { start: tr.start, lo: Math.max(0, ti - 6), scroll: null };
  V.ctx = ctx;
  el.innerHTML = '<div class="t-ban" id="t-ban"><div class="tb-l"><small id="tb-s"></small><b id="tb-t"></b></div><button id="t-hoje" aria-label="Ir para o treino de hoje">Hoje</button></div>' +
    (V.lo > 0 ? '<button class="btn sec t-more" id="t-prev">Ver dias anteriores</button>' : "") +
    '<div class="t-path" id="t-path">' + range(ctx, V.lo, hi, last) + '</div>';
  flush(ctx);
  var path = $("t-path");
  el.onclick = function (e) {
    var t = e.target.closest && e.target.closest(".tn, .t-gate"); if (!t) return;
    if (t.classList.contains("st-miss")) { toast("Dia encerrado."); return; }
    if (t.classList.contains("t-gate") || t.classList.contains("st-lock")) { toast(); return; }
    V.scroll = window.scrollY; openUnit(ctx, +t.getAttribute("data-i"));
  };
  if ($("t-prev")) $("t-prev").onclick = function () {
    var h0 = document.documentElement.scrollHeight, y = window.scrollY, nl = Math.max(0, V.lo - 28);
    path.insertAdjacentHTML("afterbegin", range(V.ctx, nl, V.lo - 1, last)); V.lo = nl; flush(V.ctx);
    window.scrollTo(0, y + document.documentElement.scrollHeight - h0); if (!V.lo) $("t-prev").remove(); banner();
  };
  $("t-hoje").onclick = function () { var n = el.querySelector('[data-i="' + ti + '"]'); if (n) n.scrollIntoView({ block: "center", behavior: "smooth" }); };
  if (obs) { obs.disconnect(); obs = null; }
  if (!bound) {
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && V && V.ctx && $("t-path") && C.dateKey(new Date()) !== V.ctx.today) { V.scroll = null; V.ctx.back(); }
    });
    bound = true;
  }
  var n = el.querySelector('[data-i="' + ti + '"]');
  if (V.scroll != null) window.scrollTo(0, V.scroll); else if (n) n.scrollIntoView({ block: "center" });
  banner();
}

/* Pontos e ofensiva: ao completar a unidade, concede (uma única vez, por unidade) 10 por exercício + 20 de bônus
   e marca como treinado o dia DA UNIDADE (u.date), não o dia em que o toque aconteceu (alimenta a ofensiva existente).
   Concluir hoje a unidade de ontem registra ontem. S.last guarda a data de treino mais recente e nunca regride. */
function award(ctx, u, ct, pr) {
  var S = ctx.S, got = 0; if (pr.p < 1) return 0;
  if (u.date <= ctx.today) { S.done[u.date] = true; if (!S.last || u.date > S.last) S.last = u.date; }
  var k = "tr:" + u.key; if (S.rewards[k] !== true) { S.rewards[k] = true; got = 10 * ct.exercises.length + 20; S.points += got; }
  C.refreshStreak(S, ctx.today); return got;
}
function clock(s) { return s >= 120 ? Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2) : s + "s"; }

/* Executor guiado: um exercício por vez, série a série, com cronômetro e descanso. Só o "concluído" de cada exercício é persistido. */
function runner(ctx, u, ct) {
  var S = ctx.S, esc = ctx.esc, R = { q: ct.exercises.filter(function (e) { return !(S.trail.ex[u.key] || {})[e.id]; }).map(function (e) { return e.id; }), si: 0, rest: false, t: null, tm: 0, pts: 0 };
  function cur() { return ct.exercises.filter(function (e) { return e.id === R.q[0]; })[0]; }
  function stop() { clearInterval(R.tm); R.tm = 0; }
  function restSecs() { return level(ctx, u.sec) === 0 ? 30 : 45; }
  function loop() {
    stop(); R.tm = setInterval(function () {
      var g = $("r-t"); if (!g || !R.t) { stop(); return; }
      C.timerTick(R.t, Date.now());
      if (R.t.state === "time_completed") { stop(); if (R.rest) { R.rest = false; R.si++; R.t = null; ctx.say("Descanso terminado"); } else ctx.say("Tempo concluído. Conclua a série."); draw(); }
      else g.textContent = clock(C.timerSecs(R.t));
    }, 250);
  }
  function reset() { R.si = 0; R.rest = false; R.t = null; }
  function fin() {
    stop();
    ctx.view('<div class="hero pop">' + ctx.mascote(150) + '<h1>Treino concluído!</h1><p>Você completou todos os exercícios de hoje. A próxima unidade libera amanhã.</p></div>' +
      (R.pts ? '<div class="card center"><div class="big" style="color:var(--brand)">+' + R.pts + '</div><div>pontos neste treino</div><div style="margin-top:14px;font-family:Fredoka;font-size:22px">🔥 Ofensiva: ' + S.streak + (S.streak === 1 ? " dia" : " dias") + '</div></div>' : '<div class="card center"><div style="font-family:Fredoka;font-size:22px">🔥 Ofensiva: ' + S.streak + (S.streak === 1 ? " dia" : " dias") + '</div></div>') +
      '<div style="margin-top:18px"><button class="btn" id="r-bk">Voltar à trilha</button></div>');
    $("r-bk").onclick = function () { V.scroll = null; ctx.back(); };
  }
  function finishEx(e) {
    var m = S.trail.ex[u.key] || (S.trail.ex[u.key] = {}); m[e.id] = true;
    var pr = prog(ctx, u, ct); R.pts += award(ctx, u, ct, pr); ctx.save(); R.q.shift(); reset(); ctx.say("Exercício concluído");
    if (!R.q.length) fin(); else draw();
  }
  function draw() {
    stop(); var e = cur(); if (!e) { fin(); return; }
    var pr = prog(ctx, u, ct), n = R.si + 1, chips = "";
    for (var k = 1; k <= e.sets; k++) chips += '<span class="sp' + (k <= R.si ? " ok" : (k === n && !R.rest ? " cur" : "")) + '">' + (k <= R.si ? "✓ " : "") + 'Série ' + k + '</span>';
    var h = '<div class="row" style="align-items:center;margin:0 0 20px"><button class="chip" id="r-x" aria-label="Sair do treino">✕</button><div class="bar" style="flex:1" role="img" aria-label="Progresso do treino"><i style="width:' + pct(pr.p) + '%"></i></div></div>' +
      '<div class="card center pop"><div>' + ctx.mascote(70) + '</div><h2 style="margin-top:10px">' + esc(e.name) + '</h2><p class="tip" style="margin:6px 0">Exercício ' + (pr.done + 1) + ' de ' + pr.total + ' · ' + esc(e.label) + '</p><div class="sets">' + chips + '</div>';
    if (R.rest) {
      if (!R.t) R.t = C.timerStart(restSecs(), "rest", Date.now());
      h += '<p><b>Descanso</b> antes da série ' + (n + 1) + ' de ' + e.sets + '</p><div class="big" id="r-t">' + clock(C.timerSecs(R.t)) + '</div><button class="btn sec" id="r-sr">Pular descanso</button>';
    } else {
      h += '<p><b>Série ' + n + ' de ' + e.sets + '</b></p>';
      if (e.kind === "s") {
        var st = R.t ? R.t.state : "idle";
        h += '<div class="big" id="r-t">' + clock(R.t ? C.timerSecs(R.t) : e.val) + '</div>';
        if (st === "idle") h += '<button class="btn" id="r-st">Iniciar série (' + clock(e.val) + ')</button>';
        else if (st === "running") h += '<button class="btn sec" id="r-ps">Pausar</button>';
        else if (st === "paused") h += '<button class="btn sec" id="r-rs">Retomar</button>';
        h += '<button class="btn" id="r-ok" style="margin-top:12px"' + (st === "time_completed" ? "" : " disabled") + '>Concluir série ' + n + '</button>';
      } else h += '<div class="big">' + e.val + ' repetições</div><button class="btn" id="r-ok">Concluí a série ' + n + '</button>';
      h += '<p class="tip">' + esc(e.tip) + '</p>' + (R.q.length > 1 ? '<button class="link" id="r-sk" style="margin-top:6px">Pular exercício (volta no fim)</button>' : "");
    }
    h += '<p class="tip" style="font-size:13px">Sentiu dor ou tontura? Pare e procure orientação profissional.</p></div>';
    ctx.view(h);
    function B(id, f) { var b = $(id); if (b) b.onclick = f; }
    B("r-x", function () { if (confirm("Sair e continuar depois? Os exercícios já concluídos ficam salvos.")) { stop(); openUnit(ctx, u.i); } });
    B("r-st", function () { R.t = C.timerStart(e.val, "work", Date.now()); draw(); });
    B("r-ps", function () { C.timerPause(R.t, Date.now()); draw(); });
    B("r-rs", function () { C.timerResume(R.t, Date.now()); draw(); });
    B("r-sr", function () { R.rest = false; R.si++; R.t = null; draw(); });
    B("r-sk", function () { R.q.push(R.q.shift()); reset(); draw(); });
    B("r-ok", function () {
      if (e.kind === "s" && !(R.t && R.t.state === "time_completed")) return;
      if (R.si + 1 >= e.sets) finishEx(e); else { R.rest = true; R.t = null; ctx.say("Série concluída"); draw(); }
    });
    if (R.t && R.t.state === "running") loop();
  }
  draw();
}

function openUnit(ctx, i) {
  var S = ctx.S, u = unitAt(S, i), W = wk(S, i), ct = content(ctx, u), locked = !unlocked(ctx, i), past = u.date < ctx.today, closed = locked || past, esc = ctx.esc;
  var pr = prog(ctx, u, ct), list = ct.exercises.map(function (e, k) {
    var on = pr.map[e.id] === true;
    return '<li class="ex' + (on ? " ok" : "") + '" data-id="' + e.id + '"><button class="ex-chk" data-id="' + e.id + '" aria-pressed="' + on + '" aria-label="Marcar ' + esc(e.name) + ' como concluído"' + (closed ? " disabled" : "") + '>' + (on ? "✓" : "") + '</button><div class="ex-b"><b>' + (k + 1) + '. ' + esc(e.name) + '</b><span>' + esc(e.label) + '</span><small>' + esc(e.tip) + '</small></div></li>';
  }).join("");
  ctx.view('<div class="u-top"><button class="chip" id="u-bk" aria-label="Voltar à trilha">← Trilha</button><span>SEMANA ' + W.w + ' — UNIDADE ' + W.d + '</span></div>' +
    '<div class="u-hero"><span class="rb u-rb wk' + W.c + ' st-' + pr.st + '" id="u-rb">' + ring(pr.p) + '<span class="tn-btn">' + icon(ct.group) + '</span></span><p class="u-day">' + P.DIAS[u.dow].toUpperCase() + ' · ' + fmt(u.date) + '</p><h1>' + esc(ct.title.toUpperCase()) + '</h1></div>' +
    '<div class="card u-prog"><b id="u-pt"></b><div class="bar" style="margin-top:8px"><i id="u-pb"></i></div></div>' +
    (past ? '<p class="u-note">Este dia já passou (' + fmt(u.date) + '), então o treino não pode mais ser feito ou alterado. Você pode apenas consultar.</p>' : locked ? '<p class="u-note">Este treino será liberado em ' + fmt(u.date) + ' (a partir da meia-noite). Você pode consultar a programação.</p>' : '<button class="btn u-go" id="u-go"></button>') +
    '<ol class="u-list">' + list + '</ol>' +
    '<div class="card u-help"><b>Orientações</b><p>' + (ct.group === "R" ? "Hoje é dia de recuperar: mantenha tudo leve e confortável." : "Faça as séries com controle e descanse de 30 a 60 segundos entre elas. O primeiro item é cardio de aquecimento.") + ' Sentiu dor ou tontura? Pare e procure orientação profissional.</p></div>' +
    '<button class="btn sec" id="u-bk2" style="margin-top:14px">Voltar à trilha</button>');
  flush(ctx);
  function refresh() {
    var p2 = prog(ctx, u, ct), rb = $("u-rb");
    rb.className = "rb u-rb wk" + W.c + " st-" + p2.st; rb.innerHTML = ring(p2.p) + '<span class="tn-btn">' + icon(ct.group) + '</span>';
    $("u-pt").textContent = p2.done + " de " + p2.total + " exercícios · " + pct(p2.p) + "%" + (p2.p >= 1 ? " · Treino completo ✓" : "");
    $("u-pb").style.width = pct(p2.p) + "%";
    var go = $("u-go"); if (go) { go.hidden = p2.p >= 1; go.textContent = p2.done ? "Continuar treino" : "Iniciar treino"; }
    document.querySelectorAll(".ex").forEach(function (li) { var on = p2.map[li.getAttribute("data-id")] === true, b = li.querySelector(".ex-chk"); li.classList.toggle("ok", on); b.setAttribute("aria-pressed", on); b.textContent = on ? "✓" : ""; });
    return p2;
  }
  refresh();
  if ($("u-go")) $("u-go").onclick = function () { runner(ctx, u, ct); };
  document.querySelectorAll(".ex-chk").forEach(function (b) {
    b.onclick = function () {
      if (closed) return;
      var id = b.getAttribute("data-id"), m = S.trail.ex[u.key];
      if (!ct.exercises.some(function (e) { return e.id === id; })) return;
      if (m && m[id]) { delete m[id]; if (!Object.keys(m).length) delete S.trail.ex[u.key]; } else { if (!m) m = S.trail.ex[u.key] = {}; m[id] = true; }
      var p1 = prog(ctx, u, ct); award(ctx, u, ct, p1);
      ctx.save(); var p2 = refresh(); ctx.say(p2.p >= 1 ? "Treino completo" : p2.done + " de " + p2.total + " exercícios concluídos");
    };
  });
  $("u-bk").onclick = $("u-bk2").onclick = ctx.back;
}

T.mount = mount; T.openUnit = openUnit; T.unitAt = unitAt; T.secStart = secStart; T.week = wk; T.idxOf = idxOf;
root.CFT = T;
})(typeof self !== "undefined" ? self : this);
