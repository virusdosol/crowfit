/* Crowfit: lógica pura (sem DOM). Usada pelo app (index.html). */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.CF = f(); })(typeof self !== "undefined" ? self : this, function () {
"use strict";
var EXP = ["Nunca treinei", "Treino às vezes", "Treino sempre"], DIAS_OK = [3, 4, 5, 6];
var PAT = { 3: ["F","R","L","R","P","R","R"], 4: ["P","L","R","C","F","R","R"], 5: ["P","L","C","R","F","P","R"], 6: ["P","L","C","F","P","L","R"] };
var STATUS = ["not_started","in_progress","completed","interrupted","abandoned"];
var EXST = ["not_started","running","paused","time_completed","in_progress","completed","skipped"];
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---- escaping por contexto ---- */
var MAP = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;", "`":"&#96;" };
function escText(s) { return String(s == null ? "" : s).replace(/[&<>"'`]/g, function (c) { return MAP[c]; }); }
function escAttr(s) { return String(s == null ? "" : s).replace(/[^\w .,:;@+\-\u00C0-\u00FF]/gu, function (c) { return "&#x" + c.codePointAt(0).toString(16) + ";"; }); }
function safeClass(s) { return String(s == null ? "" : s).replace(/[^a-zA-Z0-9_-]/g, ""); }
function safeUrl(u) { u = String(u == null ? "" : u).trim(); return /^(https:\/\/|\.\/|#)[^\s"'<>`]*$/.test(u) ? u : ""; }
function cssVal(v) { v = String(v == null ? "" : v); return /^[#\w.%\s-]{0,40}$/.test(v) ? v : ""; }
function num(v, min, max, def) { v = Number(v); return isFinite(v) ? Math.min(max, Math.max(min, v)) : def; }
function isInt(v, min, max) { return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max; }

/* ---- datas ---- */
function pad(n) { return ("0" + n).slice(-2); }
function dateKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parseDate(s) { return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
function addDays(s, n) { var d = parseDate(s); d.setDate(d.getDate() + n); return dateKey(d); }

/* ---- estado e validação ---- */
function emptyState() { return { version: 2, profile: null, points: 0, streak: 0, best: 0, last: "", done: {}, rewards: {}, nozes: {}, history: [], planHistory: [], adjust: 0, easyStreak: 0, active: null, trail: { start: "", ex: {}, lv: {} } }; }
function validateProfile(p) {
  var e = [];
  if (!p || typeof p !== "object") return { ok: false, errors: ["Perfil inválido"] };
  var nome = typeof p.nome === "string" ? p.nome.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
  if (nome.length < 1 || nome.length > 40) e.push("Nome deve ter de 1 a 40 caracteres");
  if (!isInt(p.idade, 12, 90)) e.push("Idade deve ser um número inteiro entre 12 e 90");
  if (typeof p.peso !== "number" || !isFinite(p.peso) || p.peso < 30 || p.peso > 250) e.push("Peso deve ficar entre 30 e 250 kg");
  if (typeof p.altura !== "number" || !isFinite(p.altura) || p.altura < 120 || p.altura > 230) e.push("Altura deve ficar entre 120 e 230 cm");
  if (EXP.indexOf(p.exp) < 0) e.push("Experiência inválida");
  if (DIAS_OK.indexOf(p.dias) < 0) e.push("Dias por semana deve ser 3, 4, 5 ou 6");
  return e.length ? { ok: false, errors: e } : { ok: true, errors: [], profile: { nome: nome, idade: p.idade, peso: p.peso, altura: p.altura, exp: p.exp, dias: p.dias } };
}
/* Estados v1 (app antigo) aceitavam idade decimal e nome longo. Normaliza só isso, sem inventar dados:
   o restante do perfil continua passando pela validação normal. */
function normalizeProfileV1(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return p;
  var q = {}; Object.keys(p).forEach(function (k) { q[k] = p[k]; });
  if (typeof q.nome === "string") q.nome = q.nome.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40).trim();
  if (typeof q.idade === "number" && isFinite(q.idade)) q.idade = Math.round(q.idade);
  return q;
}
function validTimer(t) {
  if (t === null) return true;
  if (!t || typeof t !== "object" || (t.kind !== "work" && t.kind !== "rest")) return false;
  if (!isInt(t.total, 1, 600)) return false;
  if (typeof t.remaining !== "number" || !isFinite(t.remaining) || t.remaining < 0 || t.remaining > 600000) return false;
  if (t.state === "running") return typeof t.endAt === "number" && isFinite(t.endAt);
  if (t.state === "paused") return t.endAt === null;
  if (t.state === "time_completed") return t.remaining === 0 && t.endAt === null;
  return false;
}
/* Compatibilidade com dados antigos: time_completed e paused podiam ser gravados com endAt numérico.
   Normaliza só isso (em memória); o localStorage não é alterado aqui. */
function normalizeTimer(t) {
  if (!t || typeof t !== "object") return t;
  if (t.state === "time_completed") { t.remaining = 0; t.endAt = null; }
  else if (t.state === "paused" && t.endAt !== null && t.endAt !== undefined) t.endAt = null;
  return t;
}
/* Cronômetro inválido vira null (o exercício pode ser reiniciado), em vez de descartar a sessão inteira. Devolve quantos foram corrigidos. */
function sanitizeTimers(ses) {
  var n = 0;
  if (!ses || typeof ses !== "object" || !Array.isArray(ses.exercises)) return 0;
  ses.exercises.forEach(function (x) {
    if (!x || typeof x !== "object" || x.timer === undefined || x.timer === null) return;
    normalizeTimer(x.timer);
    if (!validTimer(x.timer)) { x.timer = null; n++; }
  });
  return n;
}
function validSession(s) {
  if (!s || typeof s !== "object" || typeof s.id !== "string" || s.id.length > 64) return false;
  if (!DATE_RE.test(s.date) || STATUS.indexOf(s.status) < 0 || "PLCF".indexOf(s.type) < 0 || s.type.length !== 1) return false;
  if (!isInt(s.points, 0, 100000) || !Array.isArray(s.exercises) || s.exercises.length > 40) return false;
  if (!isInt(s.exIdx, 0, s.exercises.length)) return false;
  return s.exercises.every(function (x) {
    return x && typeof x.exerciseId === "string" && x.exerciseId.length <= 20 && typeof x.name === "string" && x.name.length <= 80 &&
      (x.kind === "r" || x.kind === "s") && isInt(x.target, 1, 600) && EXST.indexOf(x.status) >= 0 && isInt(x.rest, 0, 600) &&
      typeof x.restPending === "boolean" && validTimer(x.timer === undefined ? null : x.timer) &&
      Array.isArray(x.sets) && x.sets.length >= 1 && x.sets.length <= 10 && isInt(x.setIdx, 0, x.sets.length) &&
      x.sets.every(function (t) { return t && isInt(t.index, 1, 10) && isInt(t.target, 1, 600) && isInt(t.completedReps, 0, 600) && isInt(t.seconds, 0, 600) && typeof t.completed === "boolean"; });
  });
}
function validateState(raw) {
  var er = [], wr = [], st = emptyState(), fixed = 0;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["Formato inválido"], warnings: [], state: null };
  var v = raw.version === undefined ? 1 : raw.version;
  if (v !== 1 && v !== 2) er.push("Versão do formato não suportada");
  if (raw.profile !== null && raw.profile !== undefined) { var r = validateProfile(v === 1 ? normalizeProfileV1(raw.profile) : raw.profile); if (r.ok) st.profile = r.profile; else er = er.concat(r.errors); }
  ["points", "streak", "best"].forEach(function (k) { var x = raw[k] === undefined ? 0 : raw[k]; if (isInt(x, 0, 1e7)) st[k] = x; else er.push("Campo inválido: " + k); });
  if (raw.last === undefined || raw.last === "" || DATE_RE.test(raw.last)) st.last = raw.last || ""; else er.push("Campo inválido: last");
  function obj(k, maxKeys, keyOk) {
    var o = raw[k]; if (o === undefined) return;
    if (!o || typeof o !== "object" || Array.isArray(o)) return er.push("Campo inválido: " + k);
    var keys = Object.keys(o); if (keys.length > maxKeys) return er.push("Campo grande demais: " + k);
    keys.forEach(function (key) { if (keyOk(key) && o[key] === true) st[k][key] = true; else er.push("Entrada inválida em " + k); });
  }
  obj("done", 20000, function (k) { return DATE_RE.test(k); });
  obj("rewards", 20000, function (k) { return k.length <= 80; });
  if (raw.nozes !== undefined) {
    if (raw.nozes && typeof raw.nozes === "object" && !Array.isArray(raw.nozes)) {
      var nk = Object.keys(raw.nozes); if (nk.length > 5000) nk = [];
      nk.forEach(function (k) { if (DATE_RE.test(k) && isInt(raw.nozes[k], 1, 1000000)) st.nozes[k] = raw.nozes[k]; else er.push("Noz inválida foi ignorada"); });
    } else er.push("Campo inválido: nozes");
  }
  if (raw.history !== undefined) {
    if (!Array.isArray(raw.history) || raw.history.length > 2000) er.push("Histórico inválido");
    else raw.history.forEach(function (s) { fixed += sanitizeTimers(s); if (validSession(s)) st.history.push(s); else er.push("Sessão inválida no histórico"); });
  }
  if (raw.planHistory !== undefined) {
    if (!Array.isArray(raw.planHistory) || raw.planHistory.length > 200) er.push("Histórico de planos inválido");
    else raw.planHistory.forEach(function (p) { if (p && DATE_RE.test(p.from) && DIAS_OK.indexOf(p.dias) >= 0) st.planHistory.push({ from: p.from, dias: p.dias }); else er.push("Plano inválido no histórico"); });
  }
  if (raw.adjust !== undefined) { if (isInt(raw.adjust, -1, 1)) st.adjust = raw.adjust; else er.push("Campo inválido: adjust"); }
  if (raw.easyStreak !== undefined) { if (isInt(raw.easyStreak, 0, 10)) st.easyStreak = raw.easyStreak; else er.push("Campo inválido: easyStreak"); }
  /* Trilha de progressão (campo opcional, adicionado depois). Tolerante: partes inválidas são descartadas com aviso,
     nunca bloqueiam o carregamento de XP, histórico ou ofensiva. */
  if (raw.trail !== undefined) {
    var tr = raw.trail, nt = { start: "", ex: {}, lv: {} };
    if (tr && typeof tr === "object" && !Array.isArray(tr)) {
      if (typeof tr.start === "string" && DATE_RE.test(tr.start)) nt.start = tr.start; else if (tr.start) wr.push("Data de início da trilha inválida foi ignorada");
      if (tr.ex && typeof tr.ex === "object" && !Array.isArray(tr.ex)) {
        var uk = Object.keys(tr.ex); if (uk.length > 20000) uk = [];
        uk.forEach(function (k) {
          var m = tr.ex[k]; if (!/^s\d{1,3}u\d{1,3}$/.test(k) || !m || typeof m !== "object" || Array.isArray(m)) return;
          var ids = Object.keys(m).filter(function (i) { return i !== "__proto__" && /^[a-z0-9_]{1,24}$/.test(i) && m[i] === true; }).slice(0, 40);
          if (ids.length) { nt.ex[k] = {}; ids.forEach(function (i) { nt.ex[k][i] = true; }); }
        });
      }
      if (tr.lv && typeof tr.lv === "object" && !Array.isArray(tr.lv)) Object.keys(tr.lv).forEach(function (k) { if (/^\d{1,3}$/.test(k) && isInt(tr.lv[k], 0, 2)) nt.lv[k] = tr.lv[k]; });
    } else wr.push("Dados da trilha inválidos foram ignorados");
    st.trail = nt;
  }
  if (raw.active) { fixed += sanitizeTimers(raw.active); if (validSession(raw.active)) st.active = raw.active; else wr.push("Treino em andamento inválido foi descartado"); }
  if (fixed) wr.push("Cronômetro com estado inválido foi reiniciado (" + fixed + ")");
  if (st.profile && !st.planHistory.length) st.planHistory.push({ from: "1970-01-01", dias: st.profile.dias }); /* migração v1 -> v2 */
  return { ok: er.length === 0, errors: er, warnings: wr, state: er.length ? null : st };
}
function makeBackup(S) { return JSON.stringify({ app: "crowfit", schema: 2, exportedAt: new Date().toISOString(), data: S }); }
function parseBackup(text) {
  if (typeof text !== "string" || text.length > 1500000) return { ok: false, errors: ["Arquivo grande demais ou ilegível"] };
  var o; try { o = JSON.parse(text); } catch (e) { return { ok: false, errors: ["O arquivo não é um JSON válido"] }; }
  if (!o || o.app !== "crowfit" || !isInt(o.schema, 1, 2)) return { ok: false, errors: ["Não é um backup do Crowfit compatível"] };
  return validateState(o.data);
}

/* ---- plano, nível, progressão ---- */
function setPlan(S, dias, todayStr) {
  var ph = S.planHistory; if (ph.length && ph[ph.length - 1].dias === dias) return;
  S.planHistory = ph.filter(function (p) { return p.from !== todayStr; }); S.planHistory.push({ from: todayStr, dias: dias });
}
function planFor(ph, d) { var r = null; ph.forEach(function (p) { if (p.from <= d && (!r || p.from >= r.from)) r = p; }); return r ? r.dias : null; }
function isRestDay(dias, d) { return PAT[dias][(parseDate(d).getDay() + 6) % 7] === "R"; }
function levelFor(p, adjust) { return Math.max(0, Math.min(2, EXP.indexOf(p.exp) + (adjust || 0))); }
function applyFeedback(S, fb) {
  if (fb === "hard") { S.adjust = Math.max(-1, S.adjust - 1); S.easyStreak = 0; }
  else if (fb === "easy") { S.easyStreak++; if (S.easyStreak >= 3) { S.adjust = Math.min(1, S.adjust + 1); S.easyStreak = 0; } }
  else S.easyStreak = 0;
}

/* ---- ofensiva histórica ---- */
function computeStreak(done, ph, today) {
  var n = 0, d = today; if (done[d]) n++;
  for (var i = 0; i < 3660; i++) {
    d = addDays(d, -1);
    if (done[d]) { n++; continue; }
    var dias = planFor(ph, d); if (dias === null) break;
    if (isRestDay(dias, d)) continue; break;
  }
  return n;
}
/* Situação de um dia da ofensiva, com as mesmas regras de computeStreak: "active" (treinou),
   "rest" (descanso do plano), "pending" (hoje, ainda sem treino), "missed" (dia de treino sem registro), "none" (antes de qualquer plano). */
function dayStatus(done, ph, d, today) {
  if (done[d]) return "active";
  var dias = planFor(ph, d); if (dias === null) return "none";
  if (isRestDay(dias, d)) return "rest";
  return d === today ? "pending" : (d > today ? "none" : "missed");
}
function refreshStreak(S, today) { var c = computeStreak(S.done, S.planHistory, today); S.streak = c; S.best = Math.max(S.best, c); return c; }

/* ---- nozes semanais ----
   Uma noz por semana de calendário (domingo a sábado) já encerrada, a partir da semana do início da trilha.
   Identificada pelo sábado da semana. Fechada = sem registro em S.nozes; aberta = XP obtido guardado em S.nozes. */
function dowOf(k) { return new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)).getDay(); }
function nozWeeks(S, today) {
  var out = [], st = S.trail && S.trail.start;
  if (!st || !DATE_RE.test(st)) return out;
  var sat = addDays(st, (6 - dowOf(st) + 7) % 7), n = 0;
  while (sat < today && n < 520) { out.push(sat); sat = addDays(sat, 7); n++; }
  return out;
}
function nozOpened(S, sat) { return typeof S.nozes[sat] === "number"; }
function levelOf(points) { return Math.floor(points / 200) + 1; }
/* XP aleatório entre 20 e 50 vezes o nível atual. Só abre noz fechada de semana já encerrada. */
function openNoz(S, sat, today) {
  if (nozWeeks(S, today).indexOf(sat) < 0 || nozOpened(S, sat)) return 0;
  var l = levelOf(S.points), xp = 20 * l + Math.floor(Math.random() * (30 * l + 1));
  S.nozes[sat] = xp; S.points += xp; return xp;
}

/* ---- cronômetro (baseado em horários, sobrevive a abas em segundo plano) ---- */
function timerStart(sec, kind, now) { return { kind: kind, state: "running", total: sec, remaining: sec * 1000, endAt: now + sec * 1000 }; }
function timerPause(t, now) { if (t && t.state === "running") { t.remaining = Math.max(0, t.endAt - now); t.state = "paused"; t.endAt = null; } return t; }
function timerResume(t, now) { if (t && t.state === "paused") { t.endAt = now + t.remaining; t.state = "running"; } return t; }
function timerTick(t, now) { if (t && t.state === "running") { t.remaining = Math.max(0, t.endAt - now); if (t.remaining === 0) { t.state = "time_completed"; t.endAt = null; } } return t; }
function timerSecs(t) { return Math.ceil(t.remaining / 1000); }

/* ---- sessões ---- */
function newSession(type, list, date, now, dias, extra) {
  return { id: "s" + now + "-" + Math.random().toString(36).slice(2, 8), date: date, startedAt: new Date(now).toISOString(), completedAt: null, endedAt: null,
    type: type, status: "in_progress", extra: !!extra, plan: dias, points: 0, duration: 0, feedback: null, exIdx: 0,
    exercises: list.map(function (e) {
      var sets = []; for (var i = 1; i <= e.sets; i++) sets.push({ index: i, target: e.val, completedReps: 0, seconds: 0, completed: false });
      return { exerciseId: e.id, name: e.n, kind: e.t, target: e.val, optional: !!e.optional, rest: e.rest, status: "not_started", setIdx: 0, restPending: false, points: 0, timer: null, sets: sets };
    }) };
}
function syncStatus(ex) {
  if (ex.status === "completed" || ex.status === "skipped") return;
  if (ex.timer && ex.timer.kind === "work") ex.status = ex.timer.state;
  else ex.status = (ex.setIdx > 0) ? "in_progress" : "not_started";
}
function completeSet(ses, now) {
  var ex = ses.exercises[ses.exIdx];
  if (!ex || ses.status !== "in_progress") return { ok: false, reason: "session" };
  if (ex.status === "completed" || ex.status === "skipped") return { ok: false, reason: "done" };
  if (ex.restPending) return { ok: false, reason: "rest" };
  var set = ex.sets[ex.setIdx]; if (!set || set.completed) return { ok: false, reason: "set" };
  if (ex.kind === "s") {
    if (!ex.timer || ex.timer.kind !== "work" || ex.timer.state !== "time_completed") return { ok: false, reason: "timer" };
    set.seconds = ex.timer.total;
  } else set.completedReps = set.target;
  set.completed = true; ex.setIdx++; ex.timer = null;
  if (ex.setIdx >= ex.sets.length) { ex.status = "completed"; return { ok: true, exerciseDone: true }; }
  ex.restPending = true; ex.status = "in_progress"; return { ok: true, exerciseDone: false };
}
function skipExercise(ses) {
  var ex = ses.exercises[ses.exIdx]; if (!ex || ex.status === "completed" || ex.status === "skipped") return false;
  ex.status = "skipped"; ex.timer = null; ex.restPending = false; return true;
}
function advance(ses) { ses.exIdx++; return ses.exIdx >= ses.exercises.length; }

/* ---- recompensas (idempotentes, registradas em S.rewards) ---- */
function grant(S, ses, id, pts) {
  if (!isInt(pts, 1, 1000) || S.rewards[id] === true) return 0;
  S.rewards[id] = true; S.points += pts; ses.points += pts; return pts;
}
function grantExercise(S, ses, ex) {
  if (ex.status !== "completed") return 0;
  var g = grant(S, ses, "ex:" + ses.date + ":" + ex.exerciseId, 10); if (g) ex.points = g; return g;
}
function grantSessionBonus(S, ses) { return ses.status === "completed" ? grant(S, ses, "sess:" + ses.date, 20) : 0; }
function finishSession(S, ses, now, todayStr) {
  if (ses.status !== "in_progress") return ses.status;
  var req = ses.exercises.filter(function (e) { return !e.optional; });
  ses.status = req.every(function (e) { return e.status === "completed"; }) ? "completed" : "interrupted";
  ses.endedAt = new Date(now).toISOString(); ses.duration = Math.max(0, Math.round((now - Date.parse(ses.startedAt)) / 1000));
  if (ses.status === "completed") { ses.completedAt = ses.endedAt; grantSessionBonus(S, ses); S.done[ses.date] = true; S.last = ses.date; }
  S.history.push(ses); if (S.history.length > 1000) S.history = S.history.slice(-1000);
  refreshStreak(S, todayStr); return ses.status;
}
function abandonSession(S, ses, now) {
  if (ses.status === "completed" || ses.status === "abandoned") return;
  ses.status = "abandoned"; ses.endedAt = new Date(now).toISOString(); S.history.push(ses); if (S.history.length > 1000) S.history = S.history.slice(-1000);
}

return { PAT: PAT, EXP: EXP, escText: escText, escAttr: escAttr, safeClass: safeClass, safeUrl: safeUrl, cssVal: cssVal, num: num, isInt: isInt,
  dateKey: dateKey, parseDate: parseDate, addDays: addDays, emptyState: emptyState, validateProfile: validateProfile, validateState: validateState,
  makeBackup: makeBackup, parseBackup: parseBackup, setPlan: setPlan, planFor: planFor, isRestDay: isRestDay, levelFor: levelFor, applyFeedback: applyFeedback,
  computeStreak: computeStreak, refreshStreak: refreshStreak, dayStatus: dayStatus, nozWeeks: nozWeeks, nozOpened: nozOpened, openNoz: openNoz, levelOf: levelOf, timerStart: timerStart, timerPause: timerPause, timerResume: timerResume, timerTick: timerTick,
  timerSecs: timerSecs, newSession: newSession, syncStatus: syncStatus, completeSet: completeSet, skipExercise: skipExercise, advance: advance,
  grantExercise: grantExercise, grantSessionBonus: grantSessionBonus, finishSession: finishSession, abandonSession: abandonSession };
});
