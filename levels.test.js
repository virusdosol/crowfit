/* Testes da progressão de XP e níveis. Rodar: node --test (na raiz do projeto).
   Valores esperados foram escritos à mão, sem reutilizar a fórmula da implementação. */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const H = require("./helpers.js");
const { CF } = H;
const ROOT = path.join(__dirname, "..");

describe("níveis de XP (curva suave)", () => {
  /* Valores calculados à mão (base 350, factor 18, expo 1,2; passos arredondados a múltiplos de 5):
     passos 350, 370, 390, 410... ; início do nível 2, 3, 4, 5, 6 = 350, 720, 1110, 1525, 1970. */
  test("limites de nível", () => {
    assert.equal(CF.xpLevelOf(0), 1);
    assert.equal(CF.xpLevelOf(349), 1);
    assert.equal(CF.xpLevelOf(350), 2);
    assert.equal(CF.xpLevelOf(719), 2);
    assert.equal(CF.xpLevelOf(720), 3);
    assert.equal(CF.xpLevelOf(1109), 3);
    assert.equal(CF.xpLevelOf(1110), 4);
    assert.equal(CF.xpLevelOf(1524), 4);
    assert.equal(CF.xpLevelOf(1525), 5);
    assert.equal(CF.xpLevelOf(1970), 6);
  });
  test("passos crescem: cada nível exige mais XP que o anterior", () => {
    assert.deepEqual(H.plain([1, 2, 3, 4, 5, 6].map((l) => CF.xpNeed(l))), [350, 370, 390, 415, 445, 475]);
    for (let l = 2; l <= 63; l++) assert.ok(CF.xpNeed(l) >= CF.xpNeed(l - 1), "nível " + l);
  });
  test("subida gradual: o passo cresce devagar, sem saltos", () => {
    const steps = []; for (let l = 1; l <= 63; l++) steps.push(CF.xpNeed(l));
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i] - steps[i - 1] <= 60, "salto entre níveis " + (i) + " e " + (i + 1));
  });
  test("nível máximo é 64, mesmo com muito XP", () => {
    assert.equal(CF.xpLevelOf(CF.xpStart(64)), 64);
    assert.equal(CF.xpLevelOf(CF.xpStart(65)), 64);
    assert.equal(CF.xpLevelOf(10 ** 9), 64);
    assert.equal(CF.xpLevelInfo(10 ** 9).max, true);
    assert.equal(CF.xpLevelInfo(10 ** 9).pct, 100);
  });
  test("progresso dentro do nível (1000 XP: nível 2, 650 dentro do nível de 720)", () => {
    const i = CF.xpLevelInfo(1000);
    assert.equal(i.level, 3); assert.equal(i.into, 280); assert.equal(i.need, 390); assert.equal(i.nextAt, 1110);
    assert.equal(i.max, false);
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
    const ok = { base: 350, factor: 18, expo: 1.2, max: 64 };
    assert.throws(() => CF.checkXpConfig({ ...ok, expo: 0.5, titles: [{ from: 1, name: "a" }] }));
    const bad = (cfg) => assert.throws(() => CF.checkXpConfig(cfg));
    bad({ ...ok, base: 0, titles: [{ from: 1, name: "a" }] });
    bad({ ...ok, titles: [{ from: 2, name: "a" }] });
    bad({ ...ok, titles: [{ from: 1, name: "a" }, { from: 1, name: "b" }] });
    bad({ ...ok, titles: [{ from: 1, name: "a" }, { from: 5, name: "" }] });
    bad({ ...ok, titles: [] });
    assert.equal(CF.checkXpConfig({ ...ok, titles: [{ from: 1, name: "a" }, { from: 3, name: "b" }] }), true);
  });
});

describe("eventos de subida de nível", () => {
  test("ganhar XP de 300 para 720 cruza o nível 2 e o nível 3, sem mudar de título", () => {
    const ev = CF.levelUpEvents(300, 720);
    assert.deepEqual(H.plain(ev.map((e) => e.level)), [2, 3]);
    assert.ok(ev.every((e) => e.titleChanged === false));
  });
  test("cruzar o nível 5 marca mudança de título", () => {
    const ev = CF.levelUpEvents(300, 1600);
    assert.deepEqual(H.plain(ev.map((e) => e.level)), [2, 3, 4, 5]);
    const c = ev.find((e) => e.level === 5);
    assert.equal(c.titleChanged, true); assert.equal(c.title, "Aprendiz");
  });
  test("sem ganho, ou perda de XP, não há evento", () => {
    assert.deepEqual(H.plain(CF.levelUpEvents(350, 350)), []);
    assert.deepEqual(H.plain(CF.levelUpEvents(4000, 3000)), []);
  });
});

describe("persistência do XP", () => {
  test("pontos salvos voltam iguais após validar o estado", () => {
    const r = CF.validateState({ version: 2, points: 1800 });
    assert.equal(r.ok, true);
    assert.equal(r.state.points, 1800);
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
