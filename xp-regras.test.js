/* Regras de XP (lote 4): 5 por série concluída, 10 por grupo de séries terminado, 50 por treino completo.
   O cliente espelha o servidor (supabase-xp-v8-sessoes.sql). Rodar: node --test xp-regras.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CF = require("./core.js");
const SYNC = require("./supabase-sync.js");

const sessao = (exs, status) => ({ id: "s1", date: "2026-11-14", status: status || "completed", exercises: exs, points: 0 });
const ex = (id, sets, status) => ({ exerciseId: id, status: status || "completed", sets: sets, points: 0 });
const set = (done) => ({ index: 0, completed: !!done });
const grantsOf = (S) => Object.keys(S.rewards).sort();

describe("XP por série e grupo", () => {
  test("cada série concluída vale 5", () => {
    const S = CF.emptyState(), s = sessao([]);
    assert.equal(CF.grantExercise(S, s, ex("bi", [set(1), set(1), set(1)])), 15 + 10);
  });
  test("série não concluída não vale nada", () => {
    const S = CF.emptyState(), s = sessao([]);
    assert.equal(CF.grantExercise(S, s, ex("bi", [set(1), set(0), set(0)])), 5 + 10);
    assert.deepEqual(grantsOf(S), ["grp:2026-11-14:bi", "set:2026-11-14:bi:1"]);
  });
  test("grupo terminado dá 10 de bônus", () => {
    const S = CF.emptyState(), s = sessao([]);
    CF.grantExercise(S, s, ex("bi", [set(1)]));
    assert.equal(S.rewards["grp:2026-11-14:bi"], true);
    assert.equal(S.points, 15);
  });
  test("exercício não concluído não paga", () => {
    const S = CF.emptyState(), s = sessao([]);
    assert.equal(CF.grantExercise(S, s, ex("bi", [set(1)], "in_progress")), 0);
    assert.equal(S.points, 0);
  });
  test("reconceder o mesmo exercício não soma de novo", () => {
    const S = CF.emptyState(), s = sessao([]);
    const e = ex("bi", [set(1), set(1)]);
    CF.grantExercise(S, s, e); CF.grantExercise(S, s, e);
    assert.equal(S.points, 20);
  });
});

describe("bônus de treino completo", () => {
  test("treino concluído com exercício pago vale 50", () => {
    const S = CF.emptyState();
    const s = sessao([ex("bi", [set(1)])]);
    CF.grantExercise(S, s, s.exercises[0]);
    assert.equal(CF.grantSessionBonus(S, s), 50);
  });
  test("treino concluído sem exercício pago não vale bônus", () => {
    const S = CF.emptyState();
    const s = sessao([ex("bi", [set(0)], "in_progress")]);
    assert.equal(CF.grantSessionBonus(S, s), 0);
  });
  test("treino interrompido não vale bônus", () => {
    const S = CF.emptyState();
    const s = sessao([ex("bi", [set(1)])], "interrupted");
    CF.grantExercise(S, s, s.exercises[0]);
    assert.equal(CF.grantSessionBonus(S, s), 0);
  });
});

describe("amountFor: valor da recompensa conforme a chave", () => {
  const E = { CF: CF, CFP: null, CFT: null };
  const S = CF.emptyState();
  test("série vale 5, grupo 10, treino completo 50", () => {
    assert.equal(SYNC.amountFor(E, S, "set:2026-11-14:bi:2"), 5);
    assert.equal(SYNC.amountFor(E, S, "grp:2026-11-14:bi"), 10);
    assert.equal(SYNC.amountFor(E, S, "sess:2026-11-14"), 50);
  });
  test("chave legada ex: continua valendo 10", () => {
    assert.equal(SYNC.amountFor(E, S, "ex:2026-11-14:bi"), 10);
  });
  test("valor que o servidor já tem prevalece (sess antiga de 100)", () => {
    assert.equal(SYNC.amountFor(E, S, "sess:2026-11-14", { "sess:2026-11-14": 100 }), 100);
  });
});
