/* Etapa 6: catálogo temporário, inventário sem duplicatas, XP substituto, equipar/desequipar.
   Rodar: node --test inventory.test.js. Valores esperados escritos à mão. */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CF = require("./core.js");

const SEED = "user-a|mensal:2026-11";
const cfg = Object.assign({}, CF.BOX, { criterio: { t: "dias_no_mes", v: 3 }, itens: 1 });
const DAY = "2026-11-30", NOW = "2026-11-30T20:00:00.000Z";
const withDays = (extra) => Object.assign(CF.emptyState(), {
  points: 500, done: { "2026-11-02": true, "2026-11-05": true, "2026-11-09": true }, trail: { start: "2026-11-01", ex: {}, lv: {} }
}, extra || {});
const byRar = (cat, r) => cat.filter((i) => i.raridade === r);

describe("catálogo temporário aprovado", () => {
  test("35 itens: 18 comuns, 9 épicas, 5 raras, 3 lendárias", () => {
    assert.equal(CF.ITENS.length, 35);
    assert.equal(byRar(CF.ITENS, "comum").length, 18);
    assert.equal(byRar(CF.ITENS, "epica").length, 9);
    assert.equal(byRar(CF.ITENS, "rara").length, 5);
    assert.equal(byRar(CF.ITENS, "lendaria").length, 3);
  });
  test("ids únicos e marcados como temporários", () => {
    const ids = CF.ITENS.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(CF.ITENS.every((i) => i.temporario === true));
  });
});

describe("sorteio sem duplicatas", () => {
  test("nunca sorteia item já possuído", () => {
    const owned = {}; CF.ITENS.filter((i) => i.raridade !== "lendaria").forEach((i) => { owned[i.id] = true; });
    for (let lv = 1; lv <= 40; lv++) {
      const r = CF.rollBox("s" + lv, 2, CF.ITENS, cfg, owned);
      r.items.forEach((id) => assert.ok(!owned[id], "item possuído sorteado: " + id));
    }
  });
  test("escalona para raridade mais rara quando a sorteada se esgota", () => {
    // só sobra uma lendária: qualquer sorteio que não seja lendária deve cair nela (ou dar XP)
    const owned = {}; CF.ITENS.filter((i) => i.raridade !== "lendaria" || i.id !== "ap_len_01").forEach((i) => { owned[i.id] = true; });
    const CAT = CF.ITENS;
    let saw = false;
    for (let lv = 1; lv <= 60; lv++) {
      const r = CF.rollBox("e" + lv, 2, CAT, cfg, owned);
      if (r.items.length) { saw = true; assert.ok(r.items[0] === "ap_len_01" || owned[r.items[0]] === undefined); }
    }
    assert.ok(saw);
  });
  test("catálogo esgotado: vira XP de 33,33% do nível, sem item", () => {
    const owned = {}; CF.ITENS.forEach((i) => { owned[i.id] = true; });
    const cheio = CF.rollBox(SEED, 6, CF.ITENS, cfg, {});
    const vazio = CF.rollBox(SEED, 6, CF.ITENS, cfg, owned);
    assert.deepEqual(vazio.items, []);
    // mesma semente = mesma parte aleatória do XP; diferença é exatamente o substituto (6 x 0,3333 = 2)
    assert.equal(vazio.xp - cheio.xp, CF.xpSubstituto(6));
    assert.equal(CF.xpSubstituto(6), 2);
  });
  test("determinístico com o mesmo inventário", () => {
    const owned = { "ap_com_01": 1 };
    assert.deepEqual(CF.rollBox(SEED, 4, CF.ITENS, cfg, owned), CF.rollBox(SEED, 4, CF.ITENS, cfg, owned));
  });
});

describe("reserva entre caixas", () => {
  test("item de caixa ainda não aberta não é sorteado de novo", () => {
    const S = withDays();
    CF.grantMonthly(S, "2026-11", SEED, 2, DAY, cfg, CF.ITENS);
    const reservado = S.boxes["mensal:2026-11"].items[0];
    assert.ok(CF.itensReservados(S)[reservado]);
    const r = CF.rollBox("outra", 2, CF.ITENS, cfg, CF.itensReservados(S));
    assert.ok(!r.items.includes(reservado));
  });
  test("abrir a caixa coloca cada item na coleção com quantidade 1", () => {
    const S = withDays();
    CF.grantMonthly(S, "2026-11", SEED, 2, DAY, cfg, CF.ITENS);
    const b = S.boxes["mensal:2026-11"];
    CF.openBox(S, b.id, NOW);
    b.items.forEach((i) => assert.equal(S.collection[i], 1));
  });
});

describe("equipar e desequipar", () => {
  const base = () => { const S = withDays(); S.collection = { "ap_com_01": 1 }; return S; };
  test("equipa item possuído do tipo aparência", () => {
    const S = base();
    assert.equal(CF.equipar(S, "ap_com_01", NOW), "ap_com_01");
    assert.equal(CF.aparenciaEquipada(S), "ap_com_01");
  });
  test("não equipa item não possuído", () => {
    const S = base();
    assert.equal(CF.equipar(S, "ap_rar_01", NOW), null);
    assert.equal(CF.aparenciaEquipada(S), null);
  });
  test("não equipa id inexistente", () => {
    const S = base(); S.collection["xyz"] = 1;
    assert.equal(CF.equipar(S, "xyz", NOW), null);
  });
  test("desequipar limpa a aparência", () => {
    const S = base(); CF.equipar(S, "ap_com_01", NOW);
    CF.desequipar(S, NOW);
    assert.equal(CF.aparenciaEquipada(S), null);
  });
  test("aparência equipada some se o item deixar de existir na coleção", () => {
    const S = base(); CF.equipar(S, "ap_com_01", NOW);
    delete S.collection["ap_com_01"];
    assert.equal(CF.aparenciaEquipada(S), null);
  });
  test("itemsMerge: une itens e adota aparência remota só se for mais recente", () => {
    const S = base(); CF.equipar(S, "ap_com_01", "2026-11-01T10:00:00.000Z");
    CF.itemsMerge(S, ["ap_rar_01", "bogus", "ap_com_01"], { id: null, at: "2026-11-01T09:00:00.000Z" });
    assert.equal(S.collection["ap_rar_01"], 1); assert.equal(S.collection["bogus"], undefined);
    assert.equal(CF.aparenciaEquipada(S), "ap_com_01");
    CF.itemsMerge(S, [], { id: "ap_com_01", at: "2026-11-02T00:00:00.000Z" });
    assert.equal(CF.aparenciaEquipada(S), "ap_com_01");
    CF.itemsMerge(S, [], { id: null, at: "2026-11-03T00:00:00.000Z" });
    assert.equal(CF.aparenciaEquipada(S), null);
  });
  test("equipamento sobrevive a serialização (persistência local)", () => {
    const S = base(); CF.equipar(S, "ap_com_01", NOW);
    const back = JSON.parse(JSON.stringify(S));
    assert.equal(CF.aparenciaEquipada(back), "ap_com_01");
  });
});

describe("destaques do perfil", () => {
  test("no máximo 4 troféus em destaque, alternando por toque", () => {
    const S = CF.emptyState();
    ["a1","b2","c3","d4"].forEach((id) => assert.equal(CF.toggleDestaque(S, id), true));
    assert.equal(CF.toggleDestaque(S, "e5"), false);
    assert.equal(CF.toggleDestaque(S, "a1"), true);
    assert.deepEqual(S.showTro, ["b2","c3","d4"]);
  });
  test("loader descarta destaques inválidos", () => {
    const S = CF.emptyState(); S.showTro = ["ok_id", "Bad-Id", 7];
    const r = CF.validateState(JSON.parse(JSON.stringify(S)));
    assert.deepEqual(r.state.showTro, ["ok_id"]);
  });
});
