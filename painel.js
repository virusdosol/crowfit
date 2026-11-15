/* Crowfit: Painel de Evolução (cálculo).
   Fonte única: a trilha (S.trail) e os dias feitos (S.done). Nada de sessões antigas, nada de XP novo.
   Não grava nada: só lê o estado local. Funciona offline.
   Uso: PAINEL.compute(S, hoje, { CF, CFP, T }, { trophies, achievements }) */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.PAINEL = f(); })(typeof self !== "undefined" ? self : this, function () {
"use strict";

var GROUP_ORDER = ["P", "B", "O", "C", "A", "L", "R"];
var GROUP_NAME = { P: "Peito", B: "Braços", O: "Ombros", C: "Costas", A: "Abdômen", L: "Pernas", R: "Recuperação" };
var MAX_DAYS = 4000;          /* teto de segurança para a varredura da trilha */
var HEAT_DAYS = 84;           /* 12 semanas no histórico visual */
var PERIODS = { semanal: 7, mensal: 30, geral: null };

/* Um registro por dia da trilha, desde o início até hoje.
   Lê exatamente o que a trilha usa: exercícios previstos (CFP.build) e marcações (S.trail.ex). */
function ledger(S, today, deps) {
  var CF = deps.CF, CFP = deps.CFP, T = deps.T, out = [];
  if (!S || !S.trail || !S.trail.start) return out;
  var last = T.idxOf(S, today);
  if (last < 0) return out;
  var lim = Math.min(last, MAX_DAYS);
  for (var i = 0; i <= lim; i++) {
    var u = T.unitAt(S, i);
    var lv = (S.trail.lv && S.trail.lv[u.sec] !== undefined) ? S.trail.lv[u.sec]
           : (S.profile ? CF.levelFor(S.profile, S.adjust) : 0);
    var ct = CFP.build(u.sec, u.n, u.dow, lv);
    var m = (S.trail.ex && S.trail.ex[u.key]) || {};
    var doneN = 0;
    for (var j = 0; j < ct.exercises.length; j++) if (m[ct.exercises[j].id] === true) doneN++;
    out.push({
      date: u.date,
      group: ct.group,
      total: ct.exercises.length,
      done: doneN,
      unitDone: ct.exercises.length > 0 && doneN === ct.exercises.length,
      active: !!(S.done && S.done[u.date] === true)
    });
  }
  return out;
}

/* Soma um intervalo de datas (inclusive). Dias fora da trilha simplesmente não existem no registro. */
function summarize(days, from, to) {
  var s = { days: 0, units: 0, exercises: 0, activeDays: 0, frequency: 0, groups: {} };
  for (var i = 0; i < days.length; i++) {
    var d = days[i];
    if (d.date < from || d.date > to) continue;
    s.days++;
    if (d.unitDone) s.units++;
    s.exercises += d.done;
    if (d.active) s.activeDays++;
    if (d.done > 0) s.groups[d.group] = (s.groups[d.group] || 0) + d.done;
  }
  s.frequency = s.days ? Math.round(s.activeDays / s.days * 100) : 0;
  return s;
}

function addDays(CF, date, n) { return CF.addDays(date, n); }

function windowsFor(CF, today, start) {
  var w = {};
  w.semanal = { cur: [addDays(CF, today, -6), today], prev: [addDays(CF, today, -13), addDays(CF, today, -7)] };
  w.mensal  = { cur: [addDays(CF, today, -29), today], prev: [addDays(CF, today, -59), addDays(CF, today, -30)] };
  w.geral   = { cur: [start || today, today], prev: null };
  return w;
}

function compute(S, today, deps, extra) {
  extra = extra || {};
  var CF = deps.CF;
  var days = ledger(S, today, deps);
  var start = (S && S.trail && S.trail.start) || null;
  var win = windowsFor(CF, today, start);
  var periods = {};
  Object.keys(win).forEach(function (k) {
    var cur = summarize(days, win[k].cur[0], win[k].cur[1]);
    var prev = win[k].prev ? summarize(days, win[k].prev[0], win[k].prev[1]) : null;
    periods[k] = { cur: cur, prev: prev, from: win[k].cur[0], to: win[k].cur[1] };
  });

  /* Histórico visual: últimas 12 semanas (ou desde o início, se for mais recente). */
  var heatFrom = addDays(CF, today, -(HEAT_DAYS - 1));
  var heat = days.filter(function (d) { return d.date >= heatFrom; })
                 .map(function (d) { return { date: d.date, active: d.active, unitDone: d.unitDone }; });

  var lvl = CF.xpLevelInfo(S.points || 0);
  return {
    overview: {
      level: lvl.level, title: lvl.title, pct: lvl.pct, max: !!lvl.max,
      xp: S.points || 0, into: lvl.into, need: lvl.need,
      streak: S.streak || 0, best: S.best || 0
    },
    periods: periods,
    heat: heat,
    groupOrder: GROUP_ORDER,
    groupName: GROUP_NAME,
    marcos: {
      best: S.best || 0,
      trophies: extra.trophies || 0,
      achievements: extra.achievements || 0,
      since: start
    },
    hasTrail: !!start
  };
}


/* ---------- apresentação (HTML puro, sem acesso ao DOM) ---------- */
var PERIOD_LABEL = { semanal: "Últimos 7 dias", mensal: "Últimos 30 dias", geral: "Desde o início" };
var PERIOD_CMP = { semanal: "7 dias anteriores", mensal: "30 dias anteriores" };

function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

function ring(pct, big, small) {
  var r = 34, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
  return '<div class="pn-ring"><svg viewBox="0 0 88 88" aria-hidden="true">' +
    '<circle cx="44" cy="44" r="' + r + '" class="pn-rbg"/>' +
    '<circle cx="44" cy="44" r="' + r + '" class="pn-rfg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p / 100)).toFixed(1) + '" transform="rotate(-90 44 44)"/>' +
    '</svg><div class="pn-rv"><b>' + esc(big) + '</b><span>' + esc(small) + '</span></div></div>';
}

function stat(value, label) { return '<div class="pn-stat"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div>'; }

function cmp(cur, prev, what) {
  if (!prev) return "";
  var d = cur - prev;
  if (d === 0) return '<p class="pn-cmp">Igual a ' + esc(what) + '</p>';
  return '<p class="pn-cmp">' + (d > 0 ? "+" : "") + d + ' em relação a ' + esc(what) + '</p>';
}

function html(st, period, opts) {
  opts = opts || {};
  period = st.periods[period] ? period : "semanal";
  var P = st.periods[period], cur = P.cur, prev = P.prev;
  var o = st.overview, h = "";

  h += '<div class="pn-filters" role="group" aria-label="Período">';
  ["semanal", "mensal", "geral"].forEach(function (k) {
    var lbl = { semanal: "Semanal", mensal: "Mensal", geral: "Geral" }[k];
    h += '<button type="button" class="pn-f" data-pn-period="' + k + '" aria-pressed="' + (k === period) + '">' + lbl + '</button>';
  });
  h += '</div>';

  if (opts.pending) h += '<p class="pn-sync">Há dados aguardando sincronização. Os números são os deste aparelho.</p>';

  if (!st.hasTrail) {
    return h + '<div class="pn-empty"><b>Sua evolução começa na trilha.</b><p>Conclua a primeira unidade para ver seus números aqui.</p></div>';
  }

  var faltam = Math.max(0, (o.need || 0) - (o.into || 0));
  h += '<section class="pn-card pn-hero">' +
    ring(o.pct, "Nv " + o.level, esc(o.title || "")) +
    '<div class="pn-hero-txt"><p><b>' + o.xp + '</b> XP acumulado</p>' +
    (o.max ? '<p>Nível máximo alcançado</p>' : '<p>Faltam ' + faltam + ' XP para o próximo nível</p>') +
    '<p>Ofensiva <b>' + o.streak + '</b> · melhor <b>' + o.best + '</b></p></div></section>';

  h += '<section class="pn-card"><h3>' + esc(PERIOD_LABEL[period]) + '</h3><div class="pn-grid">' +
    stat(cur.units, "unidades concluídas") +
    stat(cur.activeDays, "dias ativos") +
    stat(cur.frequency + "%", "frequência") +
    stat(cur.exercises, "exercícios feitos") +
    '</div>' +
    (prev ? cmp(cur.units, prev.units, "unidades dos " + PERIOD_CMP[period]) + cmp(cur.activeDays, prev.activeDays, "dias ativos dos " + PERIOD_CMP[period]) : "") +
    '</section>';

  var total = 0, gk = st.groupOrder.filter(function (g) { return cur.groups[g] > 0; });
  gk.forEach(function (g) { total += cur.groups[g]; });
  h += '<section class="pn-card"><h3>Grupos musculares</h3>';
  if (!total) h += '<p class="pn-empty-t">Nenhum exercício concluído neste período.</p>';
  else gk.forEach(function (g) {
    var v = cur.groups[g], pct = Math.round(v / total * 100);
    h += '<div class="pn-bar"><span>' + esc(st.groupName[g]) + '</span><div class="pn-track"><i style="width:' + pct + '%"></i></div><b>' + v + '</b></div>';
  });
  h += '</section>';

  h += '<section class="pn-card"><h3>Histórico</h3><div class="pn-heat" role="img" aria-label="Dias treinados nas últimas semanas">';
  st.heat.forEach(function (d) {
    var c = d.unitDone ? "pn-c-full" : d.active ? "pn-c-act" : "pn-c-none";
    h += '<span class="' + c + '" title="' + esc(d.date) + '"></span>';
  });
  h += '</div><p class="pn-legend"><span class="pn-c-full"></span>unidade completa <span class="pn-c-act"></span>treinou <span class="pn-c-none"></span>sem treino</p></section>';

  var m = st.marcos;
  h += '<section class="pn-card"><h3>Marcos</h3><div class="pn-grid">' +
    stat(m.best, "melhor ofensiva") + stat(m.trophies, "troféus") + stat(m.achievements, "conquistas") +
    '</div>' + (m.since ? '<p class="pn-cmp">Trilha iniciada em ' + esc(m.since.split("-").reverse().join("/")) + '</p>' : "") + '</section>';

  return h;
}

return { html: html, compute: compute, ledger: ledger, summarize: summarize, GROUP_ORDER: GROUP_ORDER, GROUP_NAME: GROUP_NAME, PERIODS: PERIODS };
});
