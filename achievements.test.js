/* Conquistas: requisitos, desbloqueio único, persistência, duplicação e integridade.
   Rodar: node --test achievements.test.js. Valores esperados escritos à mão. */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CF = require("./core.js");

const AT = "2026-11-14T12:00:00.000Z", DAY = "2026-11-14";
const base = (over) => Object.assign(CF.emptyState(), over || {});
const ids = (evs) => evs.map((e) => e.id).sort();

describe("catálogo", () => {
  test("catálogo inicial é válido", () => assert.equal(CF.checkAchCatalog(CF.ACH), true));
  test("catálogo com id repetido, texto vazio ou condição desconhecida é recusado", () => {
    const ok = { id: "a_b", name: "x", how: "y", line: "z", cond: { t: "level", v: 2 } };
    assert.throws(() => CF.checkAchCatalog([ok, ok]));
    assert.throws(() => CF.checkAchCatalog([Object.assign({}, ok, { line: "" })]));
    assert.throws(() => CF.checkAchCatalog([Object.assign({}, ok, { cond: { t: "sorte", v: 1 } })]));
    assert.throws(() => CF.checkAchCatalog([Object.assign({}, ok, { id: "Bad Id" })]));
  });
  test("textos do Crow não são infantis: sem ponto de exclamação e sem emoji", () => {
    CF.ACH.forEach((a) => {
      assert.ok(!/!/.test(a.line), a.id);
      assert.ok(!/\p{Extended_Pictographic}/u.test(a.line), a.id);
    });
  });
});

describe("requisitos e desbloqueio", () => {
  test("nível: nada no nível 2; nível 3 exige 430 XP", () => {
    assert.equal(CF.achMet(CF.ACH.find((a) => a.id === "nivel_3"), base({ points: 429 })), false);
    assert.equal(CF.achMet(CF.ACH.find((a) => a.id === "nivel_3"), base({ points: 430 })), true);
  });
  test("sequência: consistência insana exige 21 dias (S.best)", () => {
    const a = CF.ACH.find((x) => x.id === "consistencia_insana");
    assert.equal(CF.achMet(a, base({ best: 20 })), false);
    assert.equal(CF.achMet(a, base({ best: 21 })), true);
  });
  test("dias: primeiro treino com 1 dia registrado", () => {
    const S = base({ done: { "2026-11-10": true } });
    assert.deepEqual(ids(CF.unlockAchievements(S, DAY, AT)), ["primeiro_treino"]);
  });
  test("marco: primeira noz", () => {
    const S = base({ nozes: { "2026-11-07": 40 } });
    assert.ok(ids(CF.unlockAchievements(S, DAY, AT)).indexOf("primeira_noz") >= 0);
  });
  test("nada desbloqueia sem requisito", () => {
    assert.deepEqual(CF.unlockAchievements(base(), DAY, AT), []);
  });
  test("evento tem id, nome, frase do Crow, data e motivo", () => {
    const S = base({ best: 21 });
    const ev = CF.unlockAchievements(S, DAY, AT).find((e) => e.id === "consistencia_insana");
    assert.equal(ev.type, "achievement_unlocked");
    assert.equal(ev.name, "Consistência insana");
    assert.equal(ev.line, "21 dias seguidos. Até que enfim algo que parece treino.");
    assert.equal(ev.reason, "Sequência de 21 dias de treino");
    assert.equal(ev.day, DAY); assert.equal(ev.at, AT);
  });
});

describe("não duplicar", () => {
  test("a mesma conquista não é concedida de novo", () => {
    const S = base({ best: 21 });
    assert.ok(CF.unlockAchievements(S, DAY, AT).length >= 1);
    assert.deepEqual(CF.unlockAchievements(S, DAY, AT), []);
  });
  test("data e motivo originais são preservados em nova chamada", () => {
    const S = base({ best: 21 });
    CF.unlockAchievements(S, DAY, AT);
    CF.unlockAchievements(S, "2026-12-01", "2026-12-01T00:00:00.000Z");
    assert.equal(S.achievements.consistencia_insana.day, DAY);
    assert.equal(S.achievements.consistencia_insana.at, AT);
  });
  test("condição que deixa de valer não remove a conquista", () => {
    const S = base({ best: 21 });
    CF.unlockAchievements(S, DAY, AT);
    S.best = 0;
    assert.ok(S.achievements.consistencia_insana);
    assert.deepEqual(CF.unlockAchievements(S, DAY, AT), []);
  });
});

describe("estado bloqueado e desbloqueado", () => {
  test("catálogo mostra bloqueado antes e desbloqueado depois", () => {
    const S = base({ best: 21 });
    const antes = CF.achCatalog(S).find((a) => a.id === "consistencia_insana");
    assert.equal(antes.unlocked, false); assert.equal(antes.at, null);
    CF.unlockAchievements(S, DAY, AT);
    const depois = CF.achCatalog(S).find((a) => a.id === "consistencia_insana");
    assert.equal(depois.unlocked, true); assert.equal(depois.day, DAY); assert.equal(depois.reason, "Sequência de 21 dias de treino");
  });
});

describe("persistência", () => {
  test("sobrevive a JSON e à validação do estado", () => {
    const S = base({ best: 21 });
    CF.unlockAchievements(S, DAY, AT);
    const r = CF.validateState(JSON.parse(JSON.stringify(S)));
    assert.equal(r.ok, true);
    assert.deepEqual(r.state.achievements, S.achievements);
  });
  test("sobrevive ao backup", () => {
    const S = base({ best: 21 });
    CF.unlockAchievements(S, DAY, AT);
    assert.deepEqual(JSON.parse(CF.makeBackup(S)).data.achievements, S.achievements);
  });
  test("estado antigo sem o campo carrega vazio", () => {
    const r = CF.validateState({ version: 2, points: 5 });
    assert.equal(r.ok, true); assert.deepEqual(r.state.achievements, {});
  });
});

describe("integridade", () => {
  const good = { at: AT, day: DAY, reason: "Sequência de 21 dias de treino" };
  test("entradas inválidas são descartadas com aviso e as válidas ficam", () => {
    const r = CF.validateState({ version: 2, achievements: {
      consistencia_insana: good,
      "Nome Errado": good,
      nivel_5: { at: AT, day: "14/11/2026", reason: "x" },
      nivel_3: { at: AT, day: DAY },
      primeiro_treino: "texto" } });
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.state.achievements), ["consistencia_insana"]);
    assert.equal(r.warnings.length, 4);
  });
  test("id válido mas fora do catálogo atual é mantido (versão futura do catálogo)", () => {
    const r = CF.validateState({ version: 2, achievements: { conquista_futura: good } });
    assert.ok(r.state.achievements.conquista_futura);
  });
  test("campo de tipo errado vira aviso, não erro", () => {
    const r = CF.validateState({ version: 2, achievements: [1] });
    assert.equal(r.ok, true); assert.deepEqual(r.state.achievements, {});
  });
});

describe("mesclagem com o servidor", () => {
  test("conquista nova do servidor entra; existente fica com a data mais antiga", () => {
    const S = base({ achievements: { nivel_3: { at: "2026-11-20T10:00:00.000Z", day: "2026-11-20", reason: "Chegou ao nível 3" } } });
    const n = CF.achMerge(S, [
      { achievement_id: "primeiro_treino", unlocked_at: "2026-11-01T08:00:00.000Z" },
      { achievement_id: "nivel_3", unlocked_at: "2026-11-15T09:00:00.000Z" }]);
    assert.equal(n, 2);
    assert.equal(S.achievements.primeiro_treino.day, "2026-11-01");
    assert.equal(S.achievements.nivel_3.at, "2026-11-15T09:00:00.000Z");
    assert.equal(S.achievements.nivel_3.reason, "Chegou ao nível 3");
  });
  test("mesclar duas vezes não duplica nem muda nada", () => {
    const S = base();
    const remote = [{ achievement_id: "nivel_5", unlocked_at: "2026-11-02T00:00:00.000Z" }];
    CF.achMerge(S, remote);
    assert.equal(CF.achMerge(S, remote), 0);
  });
  test("entrada inválida do servidor é ignorada", () => {
    const S = base();
    assert.equal(CF.achMerge(S, [{ achievement_id: "Ruim!", unlocked_at: AT }, { achievement_id: "nivel_3", unlocked_at: "nao-e-data" }]), 0);
    assert.deepEqual(S.achievements, {});
  });
});

describe("não altera XP nem troféus", () => {
  test("desbloquear não muda pontos nem recompensas", () => {
    const S = base({ points: 480, best: 21, rewards: { "ex:x": true } });
    CF.unlockAchievements(S, DAY, AT);
    assert.equal(S.points, 480);
    assert.deepEqual(S.rewards, { "ex:x": true });
  });
});

describe("notificações pendentes (persistidas)", () => {
  test("cada conquista nova entra na fila; várias de uma vez ficam todas", () => {
    const S = base({ best: 21, points: 430, done: { "2026-11-10": true } });
    CF.unlockAchievements(S, DAY, AT);
    const ids = CF.achPendingEvents(S).map((e) => e.id).sort();
    assert.deepEqual(ids, ["consistencia_insana", "nivel_3", "primeiro_treino"]);
  });
  test("conquista já na fila não entra duas vezes", () => {
    const S = base({ best: 21 });
    CF.unlockAchievements(S, DAY, AT);
    CF.unlockAchievements(S, DAY, AT);
    assert.equal(S.achPending.length, 1);
  });
  test("ack remove só o que foi mostrado; repetir o ack não faz nada", () => {
    const S = base({ best: 21, points: 430 });
    CF.unlockAchievements(S, DAY, AT);
    assert.equal(CF.achAck(S, ["nivel_3"]), 1);
    assert.deepEqual(CF.achPendingEvents(S).map((e) => e.id), ["consistencia_insana"]);
    assert.equal(CF.achAck(S, ["nivel_3"]), 0);
  });
  test("a fila sobrevive a JSON e à validação (app fechado e aberto de novo)", () => {
    const S = base({ best: 21 });
    CF.unlockAchievements(S, DAY, AT);
    const r = CF.validateState(JSON.parse(JSON.stringify(S)));
    assert.equal(r.ok, true);
    assert.deepEqual(CF.achPendingEvents(r.state).map((e) => e.id), ["consistencia_insana"]);
  });
  test("depois de recarregar, o ack persiste", () => {
    const S = base({ best: 21 });
    CF.unlockAchievements(S, DAY, AT);
    const reloaded = CF.validateState(JSON.parse(JSON.stringify(S))).state;
    CF.achAck(reloaded, ["consistencia_insana"]);
    const again = CF.validateState(JSON.parse(JSON.stringify(reloaded))).state;
    assert.deepEqual(again.achPending, []);
  });
  test("pendente sem conquista gravada correspondente é descartada na validação", () => {
    const r = CF.validateState({ version: 2, achPending: ["nivel_3"] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.state.achPending, []);
    assert.ok(r.warnings.length >= 1);
  });
  test("conquista vinda do servidor não vira notificação pendente", () => {
    const S = base();
    CF.achMerge(S, [{ achievement_id: "nivel_5", unlocked_at: AT }]);
    assert.ok(S.achievements.nivel_5);
    assert.deepEqual(S.achPending, []);
  });
  test("pendentes não alteram XP nem troféus", () => {
    const S = base({ best: 21, points: 480 });
    CF.unlockAchievements(S, DAY, AT);
    assert.equal(S.points, 480);
  });
});
