const test = require("node:test"), assert = require("node:assert/strict"), CF = require("../core.js");
const prof = { nome: "Ana", idade: 30, peso: 70, altura: 170, exp: "Treino às vezes", dias: 4 };
const list = [{ id: "po", n: "Polichinelo", t: "s", val: 30, sets: 1, rest: 0, optional: true }, { id: "ag", n: "Agachamento", t: "r", val: 12, sets: 3, rest: 30 }, { id: "pr", n: "Prancha", t: "s", val: 20, sets: 2, rest: 30 }];
const mk = (date = "2026-11-02", extra = false) => CF.newSession("F", list, date, Date.parse(date + "T10:00:00Z"), 4, extra);
function doRepSets(S, s, n) { for (let i = 0; i < n; i++) { const r = CF.completeSet(s, 0); assert.ok(r.ok); if (r.exerciseDone) CF.grantExercise(S, s, s.exercises[s.exIdx]); else s.exercises[s.exIdx].restPending = false; } }
function doTimed(S, s, sets) { for (let i = 0; i < sets; i++) { const ex = s.exercises[s.exIdx]; ex.timer = CF.timerStart(ex.target, "work", 0); CF.timerTick(ex.timer, ex.target * 1000); const r = CF.completeSet(s, 0); assert.ok(r.ok); if (r.exerciseDone) CF.grantExercise(S, s, ex); else { ex.restPending = false; } } }
function full(S, s) { doTimed(S, s, 1); CF.advance(s); doRepSets(S, s, 3); CF.advance(s); doTimed(S, s, 2); CF.advance(s); return CF.finishSession(S, s, Date.parse("2026-11-02T11:00:00Z"), s.date); }

test("escape: texto e atributo neutralizam aspas e tags", () => {
  const evil = `"><img src=x onerror=alert(1)>'\``;
  assert.ok(!/[<>"']/.test(CF.escText(evil)));
  assert.ok(!/[<>"'`=]/.test(CF.escAttr(evil)));
  assert.equal(CF.escAttr('a"b'), "a&#x22;b");
  assert.equal(CF.safeUrl("javascript:alert(1)"), ""); assert.equal(CF.safeUrl("https://x.com/a"), "https://x.com/a");
  assert.equal(CF.safeClass('a" onclick="x'), "aonclickx"); assert.equal(CF.cssVal("red;background:url(x)"), "");
});
test("perfil: valida limites, tipos e nome longo", () => {
  assert.ok(CF.validateProfile(prof).ok);
  assert.ok(!CF.validateProfile({ ...prof, nome: "x".repeat(41) }).ok);
  assert.ok(!CF.validateProfile({ ...prof, nome: "" }).ok);
  assert.ok(!CF.validateProfile({ ...prof, idade: NaN }).ok);
  assert.ok(!CF.validateProfile({ ...prof, peso: Infinity }).ok);
  assert.ok(!CF.validateProfile({ ...prof, dias: 7 }).ok);
  assert.ok(CF.validateProfile({ ...prof, nome: `O'Brien "<b>"` }).ok);
});
test("estado: vazio, válido, campos incorretos e migração v1", () => {
  assert.ok(CF.validateState(CF.emptyState()).ok);
  const v1 = { profile: prof, points: 50, streak: 2, best: 3, last: "2026-11-01", done: { "2026-11-01": true } };
  const r = CF.validateState(v1); assert.ok(r.ok); assert.equal(r.state.version, 2); assert.equal(r.state.planHistory[0].dias, 4); assert.equal(r.state.points, 50);
  for (const bad of [{ points: -1 }, { points: NaN }, { points: "9" }, { streak: Infinity }, { done: { hoje: true } }, { done: { "2026-11-01": 1 } }, { version: 9 }, { history: [{}] }, [], null, "x"])
    assert.ok(!CF.validateState(bad).ok, JSON.stringify(bad));
});
test("backup: válido, incompatível e grande demais", () => {
  const S = CF.emptyState(); S.profile = prof; S.points = 10; S.planHistory = [{ from: "2026-01-01", dias: 4 }];
  const ok = CF.parseBackup(CF.makeBackup(S)); assert.ok(ok.ok); assert.equal(ok.state.points, 10);
  assert.ok(!CF.parseBackup("{").ok); assert.ok(!CF.parseBackup('{"app":"outro","schema":2,"data":{}}').ok);
  assert.ok(!CF.parseBackup("x".repeat(1600000)).ok); assert.ok(!CF.parseBackup(JSON.stringify({ app: "crowfit", schema: 2, data: { points: -5 } })).ok);
});
test("pontos: sessão completa rende exercícios + bônus", () => {
  const S = CF.emptyState(), s = mk(); assert.equal(full(S, s), "completed");
  assert.equal(S.points, 10 + 10 + 10 + 20); assert.equal(s.points, 50); assert.equal(S.done["2026-11-02"], true);
});
test("pontos: um exercício só, ou pular obrigatório, não dá bônus", () => {
  const S = CF.emptyState(), s = mk(); doTimed(S, s, 1); CF.advance(s); doRepSets(S, s, 3); CF.advance(s); assert.ok(CF.skipExercise(s)); CF.advance(s);
  assert.equal(CF.finishSession(S, s, 1, s.date), "interrupted");
  assert.equal(S.points, 20); assert.ok(!S.done["2026-11-02"]); assert.equal(S.rewards["sess:2026-11-02"], undefined);
});
test("pontos: repetir sessão no mesmo dia não repete recompensas (extra)", () => {
  const S = CF.emptyState(); full(S, mk()); const p = S.points; const s2 = mk("2026-11-02", true); full(S, s2);
  assert.equal(S.points, p); assert.equal(s2.points, 0); assert.equal(S.history.length, 2);
});
test("pontos: conclusão repetida e operações duplicadas são idempotentes", () => {
  const S = CF.emptyState(), s = mk(); full(S, s); const p = S.points;
  assert.equal(CF.finishSession(S, s, 5, s.date), "completed"); assert.equal(S.points, p); assert.equal(S.history.length, 1);
  const ex = s.exercises[1]; assert.equal(CF.grantExercise(S, s, ex), 0); assert.equal(CF.grantSessionBonus(S, s), 0); assert.equal(S.points, p);
  assert.ok(!CF.completeSet(s, 0).ok);
});
test("séries: duplo clique não pula série; descanso exige estado; exercício só conclui na última", () => {
  const S = CF.emptyState(), s = mk(); doTimed(S, s, 1); CF.advance(s);
  let r = CF.completeSet(s, 0); assert.ok(r.ok && !r.exerciseDone); assert.equal(s.exercises[1].setIdx, 1);
  r = CF.completeSet(s, 0); assert.ok(!r.ok); assert.equal(r.reason, "rest"); assert.equal(s.exercises[1].setIdx, 1);
  s.exercises[1].restPending = false; assert.equal(CF.grantExercise(S, s, s.exercises[1]), 0);
  assert.ok(CF.completeSet(s, 0).ok); s.exercises[1].restPending = false; r = CF.completeSet(s, 0); assert.ok(r.exerciseDone); assert.equal(CF.grantExercise(S, s, s.exercises[1]), 10);
});
test("cronômetro: pausa/retoma preservam tempo; conclusão exige fim do tempo", () => {
  const s = mk(), ex = s.exercises[0]; assert.equal(CF.completeSet(s, 0).reason, "timer");
  ex.timer = CF.timerStart(30, "work", 1000); assert.equal(CF.completeSet(s, 0).reason, "timer");
  CF.timerTick(ex.timer, 11000); CF.timerPause(ex.timer, 11000); assert.equal(ex.timer.remaining, 20000); CF.timerTick(ex.timer, 99999); assert.equal(ex.timer.state, "paused");
  CF.timerResume(ex.timer, 50000); CF.timerTick(ex.timer, 60000); assert.equal(CF.timerSecs(ex.timer), 10); assert.equal(CF.completeSet(s, 0).reason, "timer");
  CF.timerTick(ex.timer, 70000); assert.equal(ex.timer.state, "time_completed"); assert.ok(CF.completeSet(s, 0).ok);
});
test("ofensiva: consecutiva, descanso programado e falta", () => {
  const ph = [{ from: "1970-01-01", dias: 4 }]; /* 4 dias: Seg P, Ter L, Qua R, Qui C, Sex F, Sáb R, Dom R */
  const done = { "2026-11-02": true, "2026-11-03": true, "2026-11-05": true }; /* seg, ter, qui */
  assert.equal(CF.computeStreak(done, ph, "2026-11-05"), 3); assert.equal(CF.computeStreak(done, ph, "2026-11-04"), 2);
  assert.equal(CF.computeStreak(done, ph, "2026-11-06"), 3, "sexta pendente não quebra");
  assert.equal(CF.computeStreak(done, ph, "2026-11-07"), 0, "faltou sexta");
  assert.equal(CF.computeStreak({ "2026-11-02": true }, ph, "2026-11-03"), 1, "terça pendente");
  assert.equal(CF.computeStreak({ "2026-11-02": true }, ph, "2026-11-04"), 0, "faltou terça");
});
test("ofensiva: mudança de plano não reescreve o passado; mês e ano", () => {
  const S = CF.emptyState(); S.profile = prof; S.planHistory = [{ from: "1970-01-01", dias: 3 }]; /* 3 dias: Seg F, Qua L, Sex P */
  S.done = { "2026-11-02": true, "2026-11-04": true }; /* seg, qua */
  assert.equal(CF.computeStreak(S.done, S.planHistory, "2026-11-05"), 2, "qui é descanso no plano 3");
  CF.setPlan(S, 6, "2026-11-05"); /* a partir de qui, plano 6 dias */
  assert.equal(CF.computeStreak(S.done, S.planHistory, "2026-11-05"), 2, "passado (qua/ter descanso) preservado");
  const ph = [{ from: "1970-01-01", dias: 6 }]; const d = { "2025-12-30": true, "2025-12-31": true, "2026-01-01": true };
  assert.equal(CF.computeStreak(d, ph, "2026-01-01"), 3, "virada de ano"); assert.equal(CF.addDays("2026-03-01", -1), "2026-02-28");
});
test("ofensiva: melhor ofensiva maior que a atual é preservada", () => {
  const S = CF.emptyState(); S.planHistory = [{ from: "1970-01-01", dias: 6 }]; S.best = 9; S.done = { "2026-11-03": true };
  CF.refreshStreak(S, "2026-11-03"); assert.equal(S.streak, 1); assert.equal(S.best, 9);
});
test("progressão: ajuste conservador por feedback", () => {
  const S = CF.emptyState(); CF.applyFeedback(S, "easy"); CF.applyFeedback(S, "easy"); assert.equal(S.adjust, 0); CF.applyFeedback(S, "easy"); assert.equal(S.adjust, 1);
  assert.equal(CF.levelFor({ exp: "Treino sempre" }, 1), 2); CF.applyFeedback(S, "hard"); assert.equal(S.adjust, 0);
  assert.equal(CF.levelFor({ exp: "Nunca treinei" }, -1), 0);
});
test("sessão ativa: aceita retomada e rejeita estrutura corrompida", () => {
  const S = CF.emptyState(); S.profile = prof; S.planHistory = [{ from: "1970-01-01", dias: 4 }]; const s = mk(); doTimed(S, s, 1); S.active = s;
  const r = CF.validateState(JSON.parse(JSON.stringify(S))); assert.ok(r.ok); assert.equal(r.state.active.exIdx, 0);
  const bad = JSON.parse(JSON.stringify(S)); bad.active.exercises[0].sets = "x"; const r2 = CF.validateState(bad); assert.ok(r2.ok); assert.equal(r2.state.active, null); assert.ok(r2.warnings.length);
});
