/* Seleção do menu do Crow: conquistas mais recentes e troféus com mais marcos. Rodar: node --test crow-menu.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CF = require("./core.js");

describe("conquistas no menu", () => {
  test("mostra as 3 mais recentes, em ordem decrescente de data", () => {
    const S = CF.emptyState();
    S.achievements = {
      primeiro_treino: { at: "2026-11-01T08:00:00.000Z", day: "2026-11-01", reason: "x" },
      nivel_3: { at: "2026-11-20T10:00:00.000Z", day: "2026-11-20", reason: "x" },
      dias_30: { at: "2026-11-10T10:00:00.000Z", day: "2026-11-10", reason: "x" },
      nivel_5: { at: "2026-11-15T10:00:00.000Z", day: "2026-11-15", reason: "x" }
    };
    assert.deepEqual(CF.achTop(S, 3).map((a) => a.id), ["nivel_3", "nivel_5", "dias_30"]);
  });
  test("sem conquistas, lista vazia", () => {
    assert.deepEqual(CF.achTop(CF.emptyState(), 3), []);
  });
  test("ignora chaves de conquista que não estão no catálogo", () => {
    const S = CF.emptyState();
    S.achievements = { conquista_futura: { at: "2026-11-20T10:00:00.000Z", day: "2026-11-20", reason: "x" } };
    assert.deepEqual(CF.achTop(S, 3), []);
  });
});

describe("troféus no menu", () => {
  const names = { flexao: "Flexão", marcha: "Marcha" };
  test("ordena por nível do troféu, depois por quantidade", () => {
    const M = CF.TROPHY.marks;
    const rec = (ex, n) => Array.from({ length: n }, () => ({ ex, kind: "r", sets: 1, val: 10 }));
    const recs = [...rec("marcha", M[0]), ...rec("flexao", M[0] + 2)];
    const top = CF.trophyTop(recs, names, 3);
    assert.deepEqual(top.map((t) => t.id), ["flexao", "marcha"]);
    assert.equal(top[0].name, "Flexão");
    assert.equal(top[0].stage, 1);
  });
  test("exercício sem nenhuma execução não aparece", () => {
    assert.deepEqual(CF.trophyTop([], names, 3), []);
  });
  test("limita ao número pedido", () => {
    const recs = ["a_1", "b_2", "c_3", "d_4"].map((ex) => ({ ex, kind: "r", sets: 1, val: 10 }));
    assert.equal(CF.trophyTop(recs, {}, 3).length, 3);
  });
});
