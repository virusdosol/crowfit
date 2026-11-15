/* Testes do cálculo do Painel de Evolução. Rodar: node --test painel.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CF = require("./core.js");
const CFP = require("./program.js");
// trail.js espera CF e CFP como globais (como no navegador)
globalThis.self = globalThis; globalThis.CF = CF; globalThis.CFP = CFP;
require("./trail.js");          // com self = globalThis, trail.js publica CFT no global
const CFT = globalThis.CFT;
const PAINEL = require("./painel.js");

const deps = { CF, CFP, T: CFT };
const TODAY = "2026-11-15";

function stateWith(start, markAll, extra) {
  const S = CF.emptyState();
  S.profile = { nome: "Teste", idade: 30, peso: 70, altura: 170, exp: "Treino às vezes", dias: 4 };
  S.trail = { start: start, ex: {}, lv: {} };
  S.points = 0;
  Object.assign(S, extra || {});
  return S;
}

describe("registro diário vem da trilha", () => {
  test("sem início de trilha, não há dias", () => {
    const S = CF.emptyState();
    assert.deepEqual(PAINEL.ledger(S, TODAY, deps), []);
  });

  test("um dia por data desde o início até hoje, sem datas futuras", () => {
    const S = stateWith("2026-11-10");
    const days = PAINEL.ledger(S, TODAY, deps);
    assert.equal(days.length, 6);                       // 10,11,12,13,14,15
    assert.equal(days[0].date, "2026-11-10");
    assert.equal(days[days.length - 1].date, TODAY);
  });

  test("unidade concluída só conta quando TODOS os exercícios previstos estão marcados", () => {
    const S = stateWith("2026-11-10");
    const u = CFT.unitAt(S, 0);                         // primeiro dia da trilha
    const ct = CFP.build(u.sec, u.n, u.dow, CF.levelFor(S.profile, S.adjust));
    const m = {};
    ct.exercises.slice(0, -1).forEach(e => m[e.id] = true);   // falta um
    S.trail.ex[u.key] = m;
    let days = PAINEL.ledger(S, TODAY, deps);
    assert.equal(days[0].unitDone, false);
    assert.equal(days[0].done, ct.exercises.length - 1);

    m[ct.exercises[ct.exercises.length - 1].id] = true;  // completa
    days = PAINEL.ledger(S, TODAY, deps);
    assert.equal(days[0].unitDone, true);
  });

  test("exercício marcado fora do plano do dia não conta", () => {
    const S = stateWith("2026-11-10");
    const u = CFT.unitAt(S, 0);
    S.trail.ex[u.key] = { id_inventado_xyz: true };
    const days = PAINEL.ledger(S, TODAY, deps);
    assert.equal(days[0].done, 0);
    assert.equal(days[0].unitDone, false);
  });
});

describe("resumos e comparação de períodos", () => {
  test("dias ativos vêm de S.done, não de sessões", () => {
    const S = stateWith("2026-11-01");
    S.done = { "2026-11-14": true, "2026-11-15": true };
    S.history = [{ id: "x", date: "2026-11-02", status: "completed" }]; // não deve contar
    const st = PAINEL.compute(S, TODAY, deps, {});
    assert.equal(st.periods.semanal.cur.activeDays, 2);
  });

  test("semanal compara com os 7 dias anteriores", () => {
    const S = stateWith("2026-10-01");
    S.done = { "2026-11-15": true, "2026-11-05": true };
    const st = PAINEL.compute(S, TODAY, deps, {});
    assert.equal(st.periods.semanal.cur.activeDays, 1);
    assert.equal(st.periods.semanal.prev.activeDays, 1);   // 05/11 cai na semana anterior
    assert.equal(st.periods.mensal.cur.activeDays, 2);
  });

  test("geral não tem período anterior (não inventa comparação)", () => {
    const S = stateWith("2026-11-10");
    const st = PAINEL.compute(S, TODAY, deps, {});
    assert.equal(st.periods.geral.prev, null);
  });

  test("grupos musculares somam só exercícios concluídos", () => {
    const S = stateWith("2026-11-10");
    const u = CFT.unitAt(S, 0);
    const ct = CFP.build(u.sec, u.n, u.dow, CF.levelFor(S.profile, S.adjust));
    const m = {};
    ct.exercises.forEach(e => m[e.id] = true);
    S.trail.ex[u.key] = m;
    const st = PAINEL.compute(S, TODAY, deps, {});
    assert.equal(st.periods.geral.cur.groups[ct.group], ct.exercises.length);
    assert.equal(st.periods.geral.cur.exercises, ct.exercises.length);
  });

  test("sem dados, nada é inventado: zeros e frequência 0", () => {
    const S = stateWith("2026-11-15");
    const st = PAINEL.compute(S, TODAY, deps, {});
    assert.equal(st.periods.semanal.cur.units, 0);
    assert.equal(st.periods.semanal.cur.frequency, 0);
  });
});

describe("visão geral e marcos", () => {
  test("nível e XP vêm de CF.xpLevelInfo sobre S.points", () => {
    const S = stateWith("2026-11-10", false, { points: 500, streak: 3, best: 9 });
    const st = PAINEL.compute(S, TODAY, deps, { trophies: 2, achievements: 4 });
    assert.equal(st.overview.xp, 500);
    assert.equal(st.overview.level, CF.xpLevelInfo(500).level);
    assert.equal(st.overview.streak, 3);
    assert.equal(st.marcos.best, 9);
    assert.equal(st.marcos.trophies, 2);
    assert.equal(st.marcos.achievements, 4);
  });

  test("histórico visual tem no máximo 84 dias", () => {
    const S = stateWith("2025-01-01");
    const st = PAINEL.compute(S, TODAY, deps, {});
    assert.ok(st.heat.length <= 84);
  });
});

describe("apresentação (HTML do painel)", () => {
  const S0 = stateWith("2026-11-10", false, { points: 300, streak: 2, best: 5 });
  test("sem trilha: mostra estado vazio e os filtros, sem números inventados", () => {
    const S = CF.emptyState();
    const h = PAINEL.html(PAINEL.compute(S, TODAY, deps, {}), "semanal", {});
    assert.match(h, /data-pn-period="semanal"/);
    assert.match(h, /Sua evolução começa na trilha/);
    assert.doesNotMatch(h, /undefined|NaN/);
  });
  test("com trilha: cartões, grupos e histórico, sem undefined/NaN", () => {
    for (const p of ["semanal", "mensal", "geral"]) {
      const h = PAINEL.html(PAINEL.compute(S0, TODAY, deps, { trophies: 1, achievements: 2 }), p, {});
      assert.match(h, /pn-hero/);
      assert.match(h, /Grupos musculares/);
      assert.match(h, /Histórico/);
      assert.doesNotMatch(h, /undefined|NaN/);
    }
  });
  test("aviso de sincronização pendente aparece quando informado", () => {
    const h = PAINEL.html(PAINEL.compute(S0, TODAY, deps, {}), "semanal", { pending: true });
    assert.match(h, /aguardando sincronização/);
  });
});

describe("nível máximo", () => {
  test("no nível máximo não diz 'faltam XP'", () => {
    const S = stateWith("2026-11-10", false, { points: 10000000, streak: 0, best: 0 });
    const h = PAINEL.html(PAINEL.compute(S, TODAY, deps, {}), "semanal", {});
    assert.match(h, /Nível máximo alcançado/);
    assert.doesNotMatch(h, /Faltam/);
  });
});
