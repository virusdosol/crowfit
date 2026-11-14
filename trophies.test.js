/* Troféus por exercício: repetição (metas em reps) e tempo (metas em segundos = 1h, 5h, 10h, 25h).
   Valores esperados escritos à mão. Rodar: node --test trophies.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CF = require("./core.js");

const rep = (ex, sets, val) => ({ ex, kind: "r", sets, val });
const tim = (ex, sets, val) => ({ ex, kind: "s", sets, val });

describe("configuração", () => {
  test("níveis padrão são válidos", () => assert.equal(CF.checkTrophyConfig(CF.TROPHY), true));
  test("metas padrão: repetição 1000/5000/10000/25000; tempo 1h/5h/10h/25h", () => {
    const t = CF.TROPHY.tiers;
    assert.deepEqual(t.map((x) => x.reps), [1000, 5000, 10000, 25000]);
    assert.deepEqual(t.map((x) => x.secs), [3600, 18000, 36000, 90000]);
    assert.deepEqual(t.map((x) => x.name), ["Bronze", "Prata", "Ouro", "Diamante"]);
  });
  test("número de níveis errado, fora de ordem ou com meta inválida é recusado", () => {
    assert.throws(() => CF.checkTrophyConfig({ tiers: [] }));
    const bad = CF.TROPHY.tiers.map((x) => ({ ...x }));
    bad[2].reps = 100;
    assert.throws(() => CF.checkTrophyConfig({ tiers: bad }));
  });
});

describe("contagem", () => {
  test("repetições somam sets × val", () => {
    const t = CF.trophyAll([rep("flexao", 2, 10), rep("flexao", 3, 12)]);
    assert.equal(t.flexao.reps, 56);
    assert.equal(t.flexao.kind, "r");
  });
  test("tempo soma sets × segundos", () => {
    const t = CF.trophyAll([tim("prancha", 2, 60)]);
    assert.equal(t.prancha.secs, 120);
    assert.equal(t.prancha.kind, "s");
  });
  test("níveis: 1000 repetições libera só o bronze", () => {
    const lv = CF.trophyLevels({ kind: "r", reps: 1000, secs: 0 }, "r");
    assert.deepEqual(lv.map((l) => l.unlocked), [true, false, false, false]);
    assert.equal(lv[1].goal, 5000);
    assert.equal(lv[1].value, 1000);
  });
  test("níveis de tempo: 1 hora libera bronze", () => {
    const lv = CF.trophyLevels({ kind: "s", reps: 0, secs: 3600 }, "s");
    assert.deepEqual(lv.map((l) => l.unlocked), [true, false, false, false]);
  });
  test("contador total soma os níveis desbloqueados de todos os exercícios", () => {
    const recs = [rep("flexao", 100, 10), tim("prancha", 1, 3600 * 5)];
    // flexão: 1000 reps = bronze; prancha: 5h = bronze + prata
    assert.equal(CF.trophyCount(recs), 3);
  });
  test("sem registros, nada desbloqueado", () => assert.equal(CF.trophyCount([]), 0));
});

describe("catálogo", () => {
  test("um item por exercício da biblioteca, mesmo sem registros", () => {
    const cat = CF.trophyCatalog([], { flexao: "r", prancha: "s" });
    assert.equal(cat.length, 2);
    assert.equal(cat.find((x) => x.id === "prancha").kind, "s");
    assert.ok(cat.every((x) => x.levels.every((l) => !l.unlocked)));
  });
  test("nome de exercício como constructor não colide", () => {
    const cat = CF.trophyCatalog([rep("constructor", 1, 5)], { constructor: "r" });
    assert.equal(cat[0].reps, 5);
  });
});

describe("troféu equipado", () => {
  const recs = [rep("flexao", 100, 10)]; // 1000 reps: só bronze
  test("equipa um troféu desbloqueado", () => {
    const S = {};
    assert.equal(CF.equipTrophy(S, "flexao:bronze", recs, "t1"), true);
    assert.equal(S.trophyEq, "flexao:bronze");
  });
  test("não equipa troféu bloqueado", () => {
    const S = {};
    assert.equal(CF.equipTrophy(S, "flexao:prata", recs, "t1"), false);
    assert.equal(S.trophyEq, undefined);
  });
  test("não equipa exercício inexistente ou chave inválida", () => {
    const S = {};
    assert.equal(CF.equipTrophy(S, "marcha:bronze", recs, "t1"), false);
    assert.equal(CF.equipTrophy(S, "flexao:ouro-x", recs, "t1"), false);
    assert.equal(CF.equipTrophy(S, "__proto__:bronze", recs, "t1"), false);
  });
  test("trocar o equipado substitui; desequipar limpa", () => {
    const S = {};
    CF.equipTrophy(S, "flexao:bronze", recs, "t1");
    CF.equipTrophy(S, "flexao:bronze", recs, "t2");
    assert.equal(S.trophyEq, "flexao:bronze");
    CF.unequipTrophy(S, "t3");
    assert.equal(S.trophyEq, null);
  });
});
