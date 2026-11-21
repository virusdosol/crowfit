/* Página do desafio individual. Rodar: node --test desafio-individual.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");

function carregar(extra) {
  const sb = Object.assign({ console, Promise, Date, Object, Array, JSON, Number, String, Math, setTimeout, clearTimeout }, extra || {});
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "desafio-individual.js"), "utf8"), sb);
  return sb.CFDI;
}
function clienteFalso(resposta) {
  const chamadas = [];
  return { chamadas, client: { rpc: (nome, args) => { chamadas.push({ nome, args }); return resposta(args); } } };
}
const LINHA = { id: "d1", nome: "Flexões", atividade: "Flexão de braço", total_reps: 60, estrelas: 1, estado: "em_progresso", metas: [50, 100, 150] };

describe("modelo de exibição", () => {
  const D = carregar();
  test("próxima estrela e faltam calculados do servidor", () => {
    const m = D.model(LINHA);
    assert.equal(m.proxima, 100);
    assert.equal(m.faltam, 40);
    assert.equal(m.pct, 20);
    assert.equal(m.podeRegistrar, true);
  });
  test("concluído (3 estrelas): sem registro, 100%", () => {
    const m = D.model({ ...LINHA, estrelas: 3, estado: "concluido", total_reps: 160 });
    assert.equal(m.concluido, true); assert.equal(m.podeRegistrar, false); assert.equal(m.pct, 100);
  });
  test("bloqueado: não pode registrar", () => {
    assert.equal(D.model({ ...LINHA, estado: "bloqueado", estrelas: 0, total_reps: 0 }).podeRegistrar, false);
  });
  test("metas inválidas (não crescentes) não geram próxima estrela", () => {
    assert.equal(D.model({ ...LINHA, metas: [100, 50, 150] }).proxima, null);
  });
});

describe("validação de repetições", () => {
  const D = carregar();
  test("aceita inteiros de 1 a 1000 e recusa o resto", () => {
    assert.equal(D.validReps(1), true);
    assert.equal(D.validReps(1000), true);
    for (const v of [0, -1, 1001, 1.5, NaN, "20", null]) assert.equal(D.validReps(v), false, String(v));
  });
});

describe("envio para o servidor", () => {
  test("payload usa os parâmetros da RPC individual", async () => {
    const D = carregar();
    const f = clienteFalso(() => Promise.resolve({ data: { total: 80, estrelas: 1, conquistas: [], replay: false }, error: null }));
    const out = await D.submit(f.client, "d1", 20, "k1");
    assert.equal(out.ok, true);
    assert.equal(f.chamadas[0].nome, "individual_challenge_record_series");
    assert.equal(f.chamadas[0].args.p_challenge_id, "d1");
    assert.equal(f.chamadas[0].args.p_repeticoes, 20);
    assert.equal(f.chamadas[0].args.p_chave, "k1");
  });
  test("reps inválidas não chamam o servidor", async () => {
    const D = carregar();
    const f = clienteFalso(() => Promise.resolve({ data: null, error: null }));
    const out = await D.submit(f.client, "d1", 0, "k1");
    assert.equal(out.code, "invalid_reps"); assert.equal(f.chamadas.length, 0);
  });
  test("erro de regra do servidor é definitivo (não reenvia a mesma chave)", async () => {
    const D = carregar();
    const f = clienteFalso(() => Promise.resolve({ data: null, error: { message: "completed" } }));
    const out = await D.submit(f.client, "d1", 5, "k1");
    assert.equal(out.code, "completed"); assert.equal(out.unconfirmed, false);
  });
  test("falha genérica é tratada como não confirmada (mantém a chave)", async () => {
    const D = carregar();
    const f = clienteFalso(() => Promise.resolve({ data: null, error: { message: "Failed to fetch" } }));
    const out = await D.submit(f.client, "d1", 5, "k1");
    assert.equal(out.unconfirmed, true);
  });
  test("tempo esgotado não é sucesso e mantém a chave", async () => {
    const D = carregar();
    const f = clienteFalso(() => new Promise(() => {}));
    D.config.timeoutMs = 20;
    const out = await D.submit(f.client, "d1", 5, "k1");
    assert.equal(out.ok, false); assert.equal(out.unconfirmed, true);
  });
  test("exceção de rede é tratada como não confirmada", async () => {
    const D = carregar();
    const f = clienteFalso(() => Promise.reject(new Error("rede")));
    const out = await D.submit(f.client, "d1", 5, "k1");
    assert.equal(out.unconfirmed, true);
  });
});

describe("retry sem duplicar", () => {
  test("após falha sem confirmação, o novo envio reusa reps e chave", () => {
    const D = carregar();
    const ui = { pendingReps: null, pendingKey: null };
    const primeiro = D.prepare(ui, "20");
    ui.pendingReps = primeiro.reps; ui.pendingKey = primeiro.key;
    const segundo = D.prepare(ui, "99");   // o campo mudou: o envio pendente manda
    assert.equal(segundo.key, primeiro.key);
    assert.equal(segundo.reps, 20);
  });
  test("sem pendência, cada envio novo ganha chave nova", () => {
    const D = carregar();
    assert.notEqual(D.prepare({}, "10").key, D.prepare({}, "10").key);
  });
  test("preparar não altera a linha do desafio (nada é contado antes da confirmação)", () => {
    const D = carregar();
    const linha = { ...LINHA };
    D.prepare({}, "10");
    assert.deepEqual(linha, LINHA);
  });
});

describe("aplicação da confirmação", () => {
  const D = carregar();
  test("atualiza total e estrelas só com o retorno do servidor", () => {
    const n = D.applyConfirmed(LINHA, { total: 120, estrelas: 2 });
    assert.equal(n.total_reps, 120); assert.equal(n.estrelas, 2); assert.equal(n.estado, "em_progresso");
  });
  test("terceira estrela conclui", () => {
    assert.equal(D.applyConfirmed(LINHA, { total: 160, estrelas: 3 }).estado, "concluido");
  });
});

describe("renderização", () => {
  const D = carregar();
  test("disponível com metas mostra formulário", () => {
    const h = D.render(LINHA, {});
    assert.match(h, /id="cd-send"/);
    assert.match(h, /Registrar série/);
    assert.match(h, /Faltam 40 repetições/);
  });
  test("concluído mostra 'Desafio concluído' e nenhum formulário", () => {
    const h = D.render({ ...LINHA, estrelas: 3, estado: "concluido", total_reps: 160 }, {});
    assert.match(h, /Desafio concluído/);
    assert.doesNotMatch(h, /cd-send/);
    assert.doesNotMatch(h, /cd-input/);
  });
  test("bloqueado não mostra formulário", () => {
    assert.doesNotMatch(D.render({ ...LINHA, estado: "bloqueado" }, {}), /cd-send/);
  });
  test("com envio pendente, o botão vira 'Tentar de novo'", () => {
    assert.match(D.render(LINHA, { pendingKey: "k", pendingReps: 20 }), /Tentar de novo/);
  });
  test("escapa nome e atividade", () => {
    const h = D.render({ ...LINHA, nome: "<img src=x>", atividade: "<b>x</b>" }, {});
    assert.doesNotMatch(h, /<img src=x>/);
    assert.doesNotMatch(h, /<b>x<\/b>/);
  });
});

describe("chave de envio", () => {
  test("formato UUID v4 quando o navegador não oferece randomUUID", () => {
    const D = carregar();
    assert.match(D.newKey(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  test("usa randomUUID quando disponível", () => {
    const D = carregar({ crypto: { randomUUID: () => "fixo-1" } });
    assert.equal(D.newKey(), "fixo-1");
  });
});
