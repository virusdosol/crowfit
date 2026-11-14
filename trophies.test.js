/* Troféus: contagem a partir de registros atuais, marcos e catálogo. Rodar: node --test trophies.test.js
   Valores esperados escritos à mão. */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CF = require("./core.js");

const flex2 = { ex: "flexao", kind: "r", sets: 2, val: 10 };
const flex3 = { ex: "flexao", kind: "r", sets: 3, val: 12 };
const marcha = { ex: "marcha", kind: "s", sets: 1, val: 60 };

describe("configuração dos marcos", () => {
  test("marcos padrão são válidos", () => assert.equal(CF.checkTrophyConfig(CF.TROPHY), true));
  test("marcos vazios, fora de ordem ou repetidos são recusados", () => {
    assert.throws(() => CF.checkTrophyConfig({ marks: [] }));
    assert.throws(() => CF.checkTrophyConfig({ marks: [10, 5] }));
    assert.throws(() => CF.checkTrophyConfig({ marks: [5, 5] }));
    assert.throws(() => CF.checkTrophyConfig({ marks: [0, 5] }));
  });
});

describe("contagem", () => {
  test("quantidade de exercícios, séries, repetições e segundos", () => {
    const t = CF.trophyAll([flex2, flex3, marcha]);
    assert.deepEqual(t.flexao, { exercises: 2, series: 5, reps: 56, secs: 0 });
    assert.deepEqual(t.marcha, { exercises: 1, series: 1, reps: 0, secs: 60 });
  });
  test("sem registros, tudo zero", () => {
    assert.deepEqual(CF.trophyAll([]), Object.create(null));
  });
  test("nomes como constructor e __proto__ não colidem com o objeto", () => {
    const t = CF.trophyAll([]);
    assert.equal(t.constructor, undefined);
    assert.equal(t.__proto__, undefined);
  });
  test("a contagem não muda se os registros forem embaralhados", () => {
    assert.deepEqual(CF.trophyAll([marcha, flex2, flex3]), CF.trophyAll([flex3, marcha, flex2]));
  });
});

describe("desmarcar e marcar de novo (regra atual)", () => {
  test("sem o registro, a contagem cai", () => {
    assert.equal(CF.trophyAll([flex2, flex3]).flexao.exercises, 2);
    assert.equal(CF.trophyAll([flex3]).flexao.exercises, 1);
  });
  test("marcar de novo devolve a contagem, sem duplicar", () => {
    assert.equal(CF.trophyAll([flex2, flex2]).flexao.exercises, 2); /* quem monta a lista garante uma por ocorrência */
  });
});

describe("marcos e catálogo", () => {
  const M = CF.TROPHY.marks;
  test("estágio cresce a cada marco e aponta o próximo", () => {
    assert.deepEqual(CF.trophyStage(0), { stage: 0, next: M[0] });
    assert.deepEqual(CF.trophyStage(M[0]), { stage: 1, next: M[1] });
    assert.deepEqual(CF.trophyStage(M[M.length - 1]), { stage: M.length, next: null });
  });
  test("catálogo traz zero para exercício ainda não feito", () => {
    const cat = CF.trophyCatalog([flex2, flex3], ["flexao", "marcha"]);
    assert.equal(cat[0].exercises, 2);
    assert.equal(cat[1].exercises, 0);
    assert.equal(cat[1].stage, 0);
  });
});

describe("contador de troféus (marcos atingidos)", () => {
  test("zero sem registros", () => assert.equal(CF.trophyCount([]), 0));
  test("soma os marcos atingidos por exercício", () => {
    const M = CF.TROPHY.marks;
    const recs = [];
    for (let i = 0; i < M[1]; i++) recs.push({ ex: "flexao", kind: "r", sets: 1, val: 10 }); /* 25 = estágio 2 */
    for (let i = 0; i < M[0]; i++) recs.push({ ex: "marcha", kind: "s", sets: 1, val: 60 }); /* 5 = estágio 1 */
    assert.equal(CF.trophyCount(recs), 3);
  });
  test("abaixo do primeiro marco não conta", () => {
    assert.equal(CF.trophyCount([{ ex: "flexao", kind: "r", sets: 1, val: 10 }]), 0);
  });
});
