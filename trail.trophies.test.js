/* Trilha -> troféus: carrega trail.js num contexto sem DOM e usa exercícios reais do programa.
   Rodar: node --test trail.trophies.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const CF = require("./core.js");
const CFP = require("./program.js");

const sandbox = { CF, CFP, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "trail.js"), "utf8"), sandbox);
const T = sandbox.CFT;

const START = "2026-11-09"; /* segunda: unidade s1u1 */
const TODAY = "2026-11-30";
const ctx = (S) => ({ S, today: TODAY, save() { return true; }, say() {}, esc: (s) => s, view() {}, back() {}, mascote: () => "", noz() {} });
const realIds = (n, date) => CFP.build(1, n, CF.parseDate(date).getDay(), 0).exercises.map((e) => e.id);
const fresh = () => { const S = CF.emptyState(); S.trail.start = START; return S; };

describe("trilha alimenta os troféus", () => {
  test("cada exercício marcado na trilha vira um registro", () => {
    const S = fresh(), ids = realIds(1, START);
    S.trail.ex.s1u1 = { [ids[0]]: true };
    const recs = T.trophyRecords(ctx(S));
    assert.equal(recs.length, 1);
    assert.equal(recs[0].ex, ids[0]);
  });
  test("desmarcar tira a contagem; marcar de novo devolve, sem duplicar", () => {
    const S = fresh(), id = realIds(1, START)[0];
    S.trail.ex.s1u1 = { [id]: true };
    assert.equal(CF.trophyAll(T.trophyRecords(ctx(S)))[id].exercises, 1);
    delete S.trail.ex.s1u1[id];
    assert.equal(T.trophyRecords(ctx(S)).length, 0);
    S.trail.ex.s1u1 = { [id]: true };
    assert.equal(CF.trophyAll(T.trophyRecords(ctx(S)))[id].exercises, 1);
  });
  test("a mesma unidade em dias diferentes conta como ocorrências diferentes", () => {
    const S = fresh(), id = realIds(1, START)[0];
    S.trail.ex.s1u1 = { [id]: true };
    S.trail.ex.s1u2 = { [id]: true };
    assert.equal(T.trophyRecords(ctx(S)).filter((r) => r.ex === id).length, 2);
  });
  test("chaves fora do padrão são ignoradas", () => {
    const S = fresh();
    S.trail.ex.lixo = { flexao: true };
    S.trail.ex.s1u999 = { flexao: true };
    assert.equal(T.trophyRecords(ctx(S)).length, 0);
  });
  test("ler troféus não altera XP, recompensas nem o estado da trilha", () => {
    const S = fresh(); S.points = 90; S.trail.ex.s1u1 = {};
    realIds(1, START).forEach((id) => { S.trail.ex.s1u1[id] = true; });
    const exBefore = JSON.stringify(S.trail.ex);
    T.trophyRecords(ctx(S));
    assert.equal(S.points, 90);
    assert.deepEqual(S.rewards, {});
    assert.equal(JSON.stringify(S.trail.ex), exBefore);
    assert.deepEqual(S.trail.lv, {}); /* ler troféus não congela nível de seção */
  });
  test("sessões avulsas abandonadas não entram", () => {
    const S = fresh();
    const ses = CF.newSession("P", [{ id: "flexao", n: "Flexão", t: "r", val: 10, sets: 2, rest: 45, optional: false }], START, Date.now(), 3, false);
    CF.abandonSession(S, ses, Date.now());
    assert.equal(T.trophyRecords(ctx(S)).length, 0);
  });
});
