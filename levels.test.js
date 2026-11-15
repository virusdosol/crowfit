/* Testes da progressão de XP e níveis. Rodar: node --test (na raiz do projeto).
   Valores esperados foram escritos à mão, sem reutilizar a fórmula da implementação. */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const H = require("./helpers.js");
const { CF } = H;
const ROOT = path.join(__dirname, "..");

describe("níveis de XP (curva exponencial)", () => {
  /* Valores calculados à mão (curva lote 4: base 2349, crescimento 1,10): passos 2350, 2585, 2840, 3125, 3440, 3785;
     início do nível 2, 3, 4, 5, 6 = 2350, 4935, 7775, 10900, 14340. */
  test("limites de nível", () => {
    assert.equal(CF.xpLevelOf(0), 1);
    assert.equal(CF.xpLevelOf(2349), 1);
    assert.equal(CF.xpLevelOf(2350), 2);
    assert.equal(CF.xpLevelOf(4934), 2);
    assert.equal(CF.xpLevelOf(4935), 3);
    assert.equal(CF.xpLevelOf(7774), 3);
    assert.equal(CF.xpLevelOf(7775), 4);
    assert.equal(CF.xpLevelOf(10900), 5);
    assert.equal(CF.xpLevelOf(14339), 5);
    assert.equal(CF.xpLevelOf(14340), 6);
  });
  test("passos crescem: cada nível exige mais XP que o anterior", () => {
    assert.deepEqual(H.plain([1, 2, 3, 4, 5, 6].map((l) => CF.xpNeed(l))), [2350, 2585, 2840, 3125, 3440, 3785]);
    for (let l = 2; l <= 40; l++) assert.ok(CF.xpNeed(l) >= CF.xpNeed(l - 1), "nível " + l);
  });
  test("progresso dentro do nível (2400 XP: nível 2, 50 dentro do nível, faltam 2535 para o 3)", () => {
    const i = CF.xpLevelInfo(2400);
    assert.equal(i.level, 2); assert.equal(i.into, 50); assert.equal(i.need, 2585); assert.equal(i.nextAt, 4935);
    assert.ok(Math.abs(i.pct - 1.9342) < 0.001);
  });
});

describe("títulos hierárquicos", () => {
  test("títulos por intervalo de nível", () => {
    assert.equal(CF.titleOf(1), "Iniciante");
    assert.equal(CF.titleOf(4), "Iniciante");
    assert.equal(CF.titleOf(5), "Aprendiz");
    assert.equal(CF.titleOf(9), "Aprendiz");
    assert.equal(CF.titleOf(10), "Praticante");
    assert.equal(CF.titleOf(20), "Veterano");
    assert.equal(CF.titleOf(34), "Veterano");
    assert.equal(CF.titleOf(35), "Mestre");
    assert.equal(CF.titleOf(999), "Mestre");
  });
  test("configuração inválida é recusada", () => {
    assert.throws(() => CF.checkXpConfig({ base: 200, growth: 0.5, titles: [{ from: 1, name: "a" }] }));
    const bad = (cfg) => assert.throws(() => CF.checkXpConfig(cfg));
    bad({ xpPerLevel: 0, titles: [{ from: 1, name: "a" }] });
    bad({ xpPerLevel: 200, titles: [{ from: 2, name: "a" }] });
    bad({ xpPerLevel: 200, titles: [{ from: 1, name: "a" }, { from: 1, name: "b" }] });
    bad({ xpPerLevel: 200, titles: [{ from: 1, name: "a" }, { from: 5, name: "" }] });
    bad({ xpPerLevel: 200, titles: [] });
    assert.equal(CF.checkXpConfig({ base: 200, growth: 1.15, titles: [{ from: 1, name: "a" }, { from: 3, name: "b" }] }), true);
  });
});

describe("eventos de subida de nível", () => {
  test("ganhar XP de 2300 para 4935 cruza os níveis 2 e 3, sem mudar de título", () => {
    const ev = CF.levelUpEvents(2300, 4935);
    assert.deepEqual(H.plain(ev.map((e) => e.level)), [2, 3]);
    assert.ok(ev.every((e) => e.titleChanged === false));
  });
  test("cruzar o nível 5 marca mudança de título", () => {
    const ev = CF.levelUpEvents(2300, 10900);
    assert.deepEqual(H.plain(ev.map((e) => e.level)), [2, 3, 4, 5]);
    const c = ev.find((e) => e.level === 5);
    assert.equal(c.titleChanged, true); assert.equal(c.title, "Aprendiz");
  });
  test("sem ganho, ou perda de XP, não há evento", () => {
    assert.deepEqual(H.plain(CF.levelUpEvents(2350, 2350)), []);
    assert.deepEqual(H.plain(CF.levelUpEvents(4000, 3000)), []);
  });
});

describe("persistência do XP", () => {
  test("pontos salvos voltam iguais após validar o estado", () => {
    const r = CF.validateState({ version: 2, points: 12000 });
    assert.equal(r.ok, true);
    assert.equal(r.state.points, 12000);
    assert.equal(CF.xpLevelInfo(r.state.points).level, 5);
  });
});

describe("sem XP duplicado", () => {
  test("recompensa com o mesmo identificador concede uma vez", () => {
    const S = { points: 0, rewards: {} };
    const ses = { points: 0 };
    assert.equal(CF.grant(S, ses, "ex:2026-11-10:flexao", 10), 10);
    assert.equal(CF.grant(S, ses, "ex:2026-11-10:flexao", 10), 0);
    assert.equal(S.points, 10);
  });
  test("noz da mesma semana não concede XP de novo", () => {
    const S = { points: 40, nozes: { "2026-11-07": 55 }, trail: { start: "2026-11-01" } };
    assert.equal(CF.openNoz(S, "2026-11-07", "2026-11-13"), 0);
    assert.equal(S.points, 40);
  });
});
