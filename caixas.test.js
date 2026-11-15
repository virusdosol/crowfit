/* Noz Dourada no cliente: o cliente NÃO sorteia. Aplica e exibe o que o servidor confirmou.
   Rodar: node --test caixas.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CF = require("./core.js");

const NOW = "2026-11-13T20:00:00.000Z";
const ID = "mensal:2026-11";
const pending = (over) => Object.assign(CF.emptyState(), { points: 480 }, over || {});
const srvRes = (over) => Object.assign({ id: ID, xp: 120, items: [], item_details: [], opened: true, already: false, opened_at: NOW, points: 600 }, over || {});

describe("concessão local (só mostra a pendência)", () => {
  test("cria a Noz pendente do mês, sem xp e sem itens", () => {
    const S = pending();
    CF.grantMonthly(S, "2026-11", "2026-11-13");
    assert.deepEqual(S.boxes[ID], { id: ID, kind: "mensal", month: "2026-11", xp: null, items: [], granted: "2026-11-13", opened: null });
  });
  test("um mês tem uma Noz: a segunda concessão local não cria outra", () => {
    const S = pending();
    CF.grantMonthly(S, "2026-11", "2026-11-13");
    assert.equal(CF.grantMonthly(S, "2026-11", "2026-11-14"), null);
    assert.equal(S.boxes[ID].granted, "2026-11-13");
  });
  test("data ou mês inválidos não criam nada", () => {
    const S = pending();
    assert.equal(CF.grantMonthly(S, "2026-13", "2026-11-13"), null);
    assert.equal(CF.grantMonthly(S, "2026-11", "13/11/2026"), null);
    assert.deepEqual(S.boxes || {}, {});
  });
});

describe("aplicar o resultado confirmado pelo servidor", () => {
  test("aplica XP, itens e pontos devolvidos pelo servidor", () => {
    const S = pending();
    CF.grantMonthly(S, "2026-11", "2026-11-13");
    const r = CF.applyBoxOpen(S, ID, srvRes({ items: ["ap_com_01"] }), NOW);
    assert.equal(r.xp, 120);
    assert.deepEqual(r.items, ["ap_com_01"]);
    assert.equal(S.boxes[ID].opened, NOW);
    assert.equal(S.collection.ap_com_01, 1);
    assert.equal(S.points, 600, "pontos vêm do servidor, não de soma local");
  });
  test("não soma XP sozinho: o total só muda para o valor devolvido", () => {
    const S = pending({ points: 480 });
    CF.grantMonthly(S, "2026-11", "2026-11-13");
    CF.applyBoxOpen(S, ID, srvRes({ xp: 120, points: 600 }), NOW);
    CF.applyBoxOpen(S, ID, srvRes({ xp: 120, points: 600 }), NOW);
    assert.equal(S.points, 600, "repetir a resposta não soma de novo");
  });
  test("resposta de outra Noz ou sem campos obrigatórios é recusada", () => {
    const S = pending();
    CF.grantMonthly(S, "2026-11", "2026-11-13");
    assert.equal(CF.applyBoxOpen(S, ID, srvRes({ id: "mensal:2026-10" }), NOW), null);
    assert.equal(CF.applyBoxOpen(S, ID, { id: ID, xp: 120 }, NOW), null);
    assert.equal(S.boxes[ID].opened, null);
    assert.equal(S.points, 480);
  });
  test("item fora do formato é recusado", () => {
    const S = pending();
    CF.grantMonthly(S, "2026-11", "2026-11-13");
    assert.equal(CF.applyBoxOpen(S, ID, srvRes({ items: ["Nome Errado"] }), NOW), null);
  });
  test("caixa inexistente não aplica nada", () => {
    const S = pending();
    assert.equal(CF.applyBoxOpen(S, ID, srvRes(), NOW), null);
  });
  test("uma Noz aberta mantém a data da primeira abertura", () => {
    const S = pending();
    CF.grantMonthly(S, "2026-11", "2026-11-13");
    CF.applyBoxOpen(S, ID, srvRes(), NOW);
    CF.applyBoxOpen(S, ID, srvRes({ opened_at: "2026-11-14T10:00:00.000Z" }), "2026-11-14T10:00:00.000Z");
    assert.equal(S.boxes[ID].opened, NOW);
  });
});

describe("integridade e persistência", () => {
  test("Noz pendente com xp ou itens é descartada na validação", () => {
    const bad = { id: ID, kind: "mensal", month: "2026-11", xp: 50, items: [], granted: "2026-11-13", opened: null };
    const S = pending({ boxes: { [ID]: bad } });
    CF.boxesMerge(S, {});
    assert.equal(CF.boxEntryOk(bad), false);
  });
  test("Noz aberta com xp válido passa na validação", () => {
    assert.equal(CF.boxEntryOk({ id: ID, kind: "mensal", month: "2026-11", xp: 120, items: [], granted: "2026-11-13", opened: NOW }), true);
  });
  test("Noz pendente (xp nulo) passa na validação", () => {
    assert.equal(CF.boxEntryOk({ id: ID, kind: "mensal", month: "2026-11", xp: null, items: [], granted: "2026-11-13", opened: null }), true);
  });
});

describe("mesclagem entre aparelhos", () => {
  test("caixa nova do outro aparelho entra; repetir não muda nada", () => {
    const S = pending();
    const remote = { [ID]: { id: ID, kind: "mensal", month: "2026-11", xp: 120, items: [], granted: "2026-11-13", opened: NOW } };
    assert.equal(CF.boxesMerge(S, remote), 1);
    assert.equal(CF.boxesMerge(S, remote), 0);
  });
  test("se os dois abriram, vale a abertura mais antiga", () => {
    const S = pending();
    CF.grantMonthly(S, "2026-11", "2026-11-13");
    CF.applyBoxOpen(S, ID, srvRes({ opened_at: "2026-11-14T10:00:00.000Z" }), "2026-11-14T10:00:00.000Z");
    CF.boxesMerge(S, { [ID]: { id: ID, kind: "mensal", month: "2026-11", xp: 120, items: [], granted: "2026-11-13", opened: NOW } });
    assert.equal(S.boxes[ID].opened, NOW);
  });
  test("mesclagem nunca remove caixa local", () => {
    const S = pending();
    CF.grantMonthly(S, "2026-11", "2026-11-13");
    CF.boxesMerge(S, {});
    assert.ok(S.boxes[ID]);
  });
});

describe("histórico", () => {
  test("Noz pendente aparece como recebida; aberta mostra XP e itens", () => {
    const S = pending();
    CF.grantMonthly(S, "2026-11", "2026-11-13");
    let h = CF.boxHistory(S, "2026-11-15").find((x) => x.id === ID);
    assert.equal(h.status, "recebida");
    assert.equal(h.xp, null);
    CF.applyBoxOpen(S, ID, srvRes({ items: ["ap_com_01"] }), NOW);
    h = CF.boxHistory(S, "2026-11-15").find((x) => x.id === ID);
    assert.equal(h.status, "aberta");
    assert.equal(h.xp, 120);
    assert.deepEqual(h.items, ["ap_com_01"]);
  });
});
