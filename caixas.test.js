/* Caixas de recompensa: sorteio, criação e abertura únicas, reconexão, dois aparelhos, histórico e integridade.
   Rodar: node --test caixas.test.js. Valores esperados escritos à mão. */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CF = require("./core.js");

const SEED = "user-a|mensal:2026-11";
const CAT = [
  { id: "cor_azul", nome: "Azul", tipo: "aparencia", raridade: "comum" },
  { id: "bandana", nome: "Bandana", tipo: "aparencia", raridade: "rara" },
  { id: "pena_ouro", nome: "Pena de ouro", tipo: "colecionavel", raridade: "lendaria" }
];
const CRIT = { t: "dias_no_mes", v: 3 };
const cfg = Object.assign({}, CF.BOX, { criterio: CRIT });
/* estado com 3 dias treinados em novembro de 2026 */
const trained = (extra) => Object.assign(CF.emptyState(), { points: 500, done: { "2026-11-02": true, "2026-11-05": true, "2026-11-09": true }, trail: { start: "2026-11-01", ex: {}, lv: {} } }, extra || {});
const DAY = "2026-11-30", NOW = "2026-11-30T20:00:00.000Z";

describe("sorteio controlado", () => {
  test("mesma semente e nível: mesmo resultado", () => {
    assert.deepEqual(CF.rollBox(SEED, 3, CAT, cfg), CF.rollBox(SEED, 3, CAT, cfg));
  });
  test("XP fica no intervalo base x nível até (base + porNivel) x nível", () => {
    for (let lv = 1; lv <= 10; lv++) {
      const r = CF.rollBox("s" + lv, lv, CAT, cfg);
      assert.ok(r.xp >= 30 * lv && r.xp <= (30 + 60) * lv, "nível " + lv + ": " + r.xp);
    }
  });
  test("sem catálogo, a caixa não tem itens (só XP)", () => {
    assert.deepEqual(CF.rollBox(SEED, 2, [], cfg).items, []);
  });
  test("raridade: valor baixo cai em comum, valor alto em lendária", () => {
    assert.equal(CF.pickRarity(0), "comum");
    assert.equal(CF.pickRarity(0.999), "lendaria");
  });
  test("gerador é determinístico e uniforme o bastante para uma semente", () => {
    const a = CF.prng("x"), b = CF.prng("x");
    assert.equal(a(), b());
    const vals = Array.from({ length: 1000 }, () => a());
    assert.ok(vals.every((v) => v >= 0 && v < 1));
    assert.ok(Math.abs(vals.reduce((s, v) => s + v, 0) / 1000 - 0.5) < 0.05);
  });
});

describe("critério mensal configurável", () => {
  test("sem critério, nunca cria caixa (padrão)", () => {
    const S = trained();
    assert.equal(CF.grantMonthly(S, "2026-11", SEED, 2, DAY, CF.BOX, CAT), null);
    assert.deepEqual(S.boxes, {});
  });
  test("critério não cumprido não cria caixa", () => {
    const S = trained({ done: { "2026-11-02": true } });
    assert.equal(CF.grantMonthly(S, "2026-11", SEED, 2, DAY, cfg, CAT), null);
  });
  test("critério cumprido cria a caixa do mês", () => {
    const S = trained();
    const g = CF.grantMonthly(S, "2026-11", SEED, 2, DAY, cfg, CAT);
    assert.equal(g.id, "mensal:2026-11");
    assert.equal(S.boxes["mensal:2026-11"].opened, null);
  });
  test("dias de outro mês não contam", () => {
    const S = trained({ done: { "2026-10-02": true, "2026-10-05": true, "2026-10-09": true } });
    assert.equal(CF.monthCriterionMet(S, "2026-11", CRIT), false);
  });
});

describe("criação e abertura únicas", () => {
  test("a caixa do mês é criada uma única vez", () => {
    const S = trained();
    CF.grantMonthly(S, "2026-11", SEED, 2, DAY, cfg, CAT);
    assert.equal(CF.grantMonthly(S, "2026-11", SEED, 2, DAY, cfg, CAT), null);
    assert.equal(Object.keys(S.boxes).length, 1);
  });
  test("abrir soma o XP uma vez; abrir de novo não soma", () => {
    const S = trained();
    CF.grantMonthly(S, "2026-11", SEED, 2, DAY, cfg, CAT);
    const xp = S.boxes["mensal:2026-11"].xp;
    const p0 = S.points;
    const first = CF.openBox(S, "mensal:2026-11", NOW);
    assert.equal(first.xp, xp);
    assert.equal(S.points, p0 + xp);
    assert.equal(CF.openBox(S, "mensal:2026-11", NOW), null);
    assert.equal(S.points, p0 + xp);
  });
  test("itens abertos entram na coleção uma vez", () => {
    const S = trained();
    CF.grantMonthly(S, "2026-11", SEED, 2, DAY, cfg, CAT);
    const items = S.boxes["mensal:2026-11"].items.slice();
    CF.openBox(S, "mensal:2026-11", NOW);
    CF.openBox(S, "mensal:2026-11", NOW);
    items.forEach((i) => assert.equal(S.collection[i], 1));
  });
  test("caixa inexistente não abre", () => {
    assert.equal(CF.openBox(trained(), "mensal:2026-11", NOW), null);
  });
  test("abrir a caixa não mexe em XP de noz nem em recompensas", () => {
    const S = trained({ rewards: { "tr:s1u1": true }, nozes: { "2026-11-07": 40 } });
    CF.grantMonthly(S, "2026-11", SEED, 2, DAY, cfg, CAT);
    CF.openBox(S, "mensal:2026-11", NOW);
    assert.deepEqual(S.rewards, { "tr:s1u1": true });
    assert.equal(S.nozes["2026-11-07"], 40);
  });
});

describe("reconexão e persistência", () => {
  test("caixa aberta continua aberta depois de recarregar (JSON + validação)", () => {
    const S = trained();
    CF.grantMonthly(S, "2026-11", SEED, 2, DAY, cfg, CAT);
    CF.openBox(S, "mensal:2026-11", NOW);
    const r = CF.validateState(JSON.parse(JSON.stringify(S)));
    assert.equal(r.ok, true);
    assert.equal(r.state.boxes["mensal:2026-11"].opened, NOW);
    assert.equal(CF.openBox(r.state, "mensal:2026-11", NOW), null);
    assert.equal(r.state.points, S.points);
  });
  test("caixa não aberta sobrevive ao recarregar e pode ser aberta depois", () => {
    const S = trained();
    CF.grantMonthly(S, "2026-11", SEED, 2, DAY, cfg, CAT);
    const r = CF.validateState(JSON.parse(JSON.stringify(S))).state;
    assert.ok(CF.openBox(r, "mensal:2026-11", NOW));
  });
  test("backup preserva caixas e coleção", () => {
    const S = trained();
    CF.grantMonthly(S, "2026-11", SEED, 2, DAY, cfg, CAT);
    CF.openBox(S, "mensal:2026-11", NOW);
    const d = JSON.parse(CF.makeBackup(S)).data;
    assert.deepEqual(d.boxes, S.boxes);
    assert.deepEqual(d.collection, S.collection);
  });
  test("estado antigo sem os campos carrega vazio", () => {
    const r = CF.validateState({ version: 2, points: 5 });
    assert.deepEqual(r.state.boxes, {});
    assert.deepEqual(r.state.collection, {});
  });
});

describe("dois aparelhos (sincronização)", () => {
  test("mesma semente e mesmo nível: os dois aparelhos chegam ao mesmo XP", () => {
    const A = trained(), B = trained();
    CF.grantMonthly(A, "2026-11", SEED, 2, DAY, cfg, CAT);
    CF.grantMonthly(B, "2026-11", SEED, 2, DAY, cfg, CAT);
    assert.equal(A.boxes["mensal:2026-11"].xp, B.boxes["mensal:2026-11"].xp);
    assert.deepEqual(A.boxes["mensal:2026-11"].items, B.boxes["mensal:2026-11"].items);
  });
  test("mesclar caixas duas vezes não muda nada", () => {
    const A = trained(); CF.grantMonthly(A, "2026-11", SEED, 2, DAY, cfg, CAT);
    const B = trained();
    assert.equal(CF.boxesMerge(B, A.boxes), 1);
    assert.equal(CF.boxesMerge(B, A.boxes), 0);
  });
  test("se os dois abriram, vale a abertura mais antiga e o XP não duplica", () => {
    const A = trained(), B = trained();
    CF.grantMonthly(A, "2026-11", SEED, 2, DAY, cfg, CAT);
    CF.boxesMerge(B, A.boxes);
    const earlier = "2026-11-30T10:00:00.000Z", later = "2026-11-30T21:00:00.000Z";
    CF.openBox(A, "mensal:2026-11", later);
    CF.openBox(B, "mensal:2026-11", earlier);
    CF.boxesMerge(A, B.boxes);
    assert.equal(A.boxes["mensal:2026-11"].opened, earlier);
    /* cada aparelho somou o XP uma vez: o resultado é o mesmo XP, sem dobrar */
    assert.equal(A.points, 500 + A.boxes["mensal:2026-11"].xp);
    assert.equal(B.points, 500 + B.boxes["mensal:2026-11"].xp);
  });
  test("aparelho desconectado: abre offline, depois mescla sem duplicar", () => {
    const server = trained(); CF.grantMonthly(server, "2026-11", SEED, 2, DAY, cfg, CAT);
    const offline = trained(); CF.boxesMerge(offline, server.boxes);
    CF.openBox(offline, "mensal:2026-11", NOW);
    CF.boxesMerge(server, offline.boxes);
    assert.ok(server.boxes["mensal:2026-11"].opened);
    assert.equal(CF.openBox(server, "mensal:2026-11", NOW), null);
  });
  test("mesclagem nunca remove caixa local", () => {
    const A = trained(); CF.grantMonthly(A, "2026-11", SEED, 2, DAY, cfg, CAT);
    CF.boxesMerge(A, {});
    assert.ok(A.boxes["mensal:2026-11"]);
  });
});

describe("histórico e semanal (noz)", () => {
  test("noz de semana elegível e não aberta aparece como recebida", () => {
    const S = trained();
    const h = CF.boxHistory(S, "2026-11-14");
    const noz = h.filter((x) => x.tipo === "semanal");
    assert.ok(noz.length >= 1);
    assert.ok(noz.every((x) => x.status === "recebida"));
  });
  test("noz aberta aparece como aberta com o XP; não duplica a semana", () => {
    const S = trained({ nozes: { "2026-11-07": 55 } });
    const semana = CF.boxHistory(S, "2026-11-14").filter((x) => x.data === "2026-11-07");
    assert.equal(semana.length, 1);
    assert.equal(semana[0].status, "aberta");
    assert.equal(semana[0].xp, 55);
  });
  test("histórico inclui a caixa mensal com o status certo", () => {
    const S = trained();
    CF.grantMonthly(S, "2026-11", SEED, 2, DAY, cfg, CAT);
    let m = CF.boxHistory(S, DAY).find((x) => x.tipo === "mensal");
    assert.equal(m.status, "recebida"); assert.equal(m.xp, null);
    CF.openBox(S, "mensal:2026-11", NOW);
    m = CF.boxHistory(S, DAY).find((x) => x.tipo === "mensal");
    assert.equal(m.status, "aberta"); assert.ok(m.xp > 0);
  });
});

describe("integridade", () => {
  test("caixa malformada é descartada com aviso", () => {
    const r = CF.validateState({ version: 2, boxes: {
      "mensal:2026-11": { id: "mensal:2026-11", kind: "mensal", month: "2026-11", xp: -5, items: [], granted: "2026-11-30", opened: null },
      "mensal:2026-10": { id: "mensal:2026-10", kind: "mensal", month: "2026-10", xp: 40, items: [], granted: "2026-10-31", opened: null },
      "outra:2026-10": { id: "outra:2026-10", kind: "mensal", month: "2026-10", xp: 40, items: [], granted: "2026-10-31", opened: null } } });
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.state.boxes), ["mensal:2026-10"]);
    assert.equal(r.warnings.length, 2);
  });
  test("coleção com item inválido é descartada", () => {
    const r = CF.validateState({ version: 2, collection: { bandana: 2, "Item Ruim!": 1, pena_ouro: 0 } });
    assert.deepEqual(r.state.collection, { bandana: 2 });
  });
  test("caixa com id diferente do mês é descartada", () => {
    const r = CF.validateState({ version: 2, boxes: { "mensal:2026-10": { id: "mensal:2026-09", kind: "mensal", month: "2026-10", xp: 40, items: [], granted: "2026-10-31", opened: null } } });
    assert.deepEqual(r.state.boxes, {});
  });
});
