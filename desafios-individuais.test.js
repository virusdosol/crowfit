/* Integração dos desafios individuais com a trilha (etapa 1). Rodar: node --test desafios-individuais.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");

function sandboxComTrilha(auth, extra) {
  const sb = {
    console, Promise, Date, Object, Array, JSON,
    CF: {
      escText: (s) => String(s),
      parseDate: (s) => new Date(s + "T12:00:00"),
      addDays: (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); },
      dateKey: (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"),
    },
    CFP: {},
    CrowfitAuth: auth,
    setImmediate, ...(extra || {}),
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "trail.js"), "utf8"), sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "desafios-individuais.js"), "utf8"), sb);
  return sb;
}
function clienteFalso(resposta) {
  const chamadas = [];
  const client = { rpc: (nome) => { chamadas.push(nome); return resposta(nome); } };
  return { auth: { getClient: () => client }, chamadas };
}

describe("integração: listagem do servidor → trilha", () => {
  test("toMarcos mantém só entradas com id e âncora e repassa o estado do servidor", () => {
    const sb = sandboxComTrilha({ getClient: () => null });
    const out = sb.CFI.toMarcos([
      { id: "a", nome: "A", ancora: "s1u4", estado: "disponivel" },
      { id: "b", nome: "B", estado: "bloqueado" },
      null,
      { id: "c", nome: "C", ancora: "s1u9", estado: "concluido" },
    ]);
    assert.deepEqual(out.map((x) => x.id), ["a", "c"]);
    assert.equal(out[1].estado, "concluido");
    assert.equal(sb.CFI.toMarcos(null).length, 0);
  });

  test("load chama a RPC uma vez e entrega os dados à trilha", async () => {
    const f = clienteFalso(() => Promise.resolve({ data: [{ id: "a", nome: "Flexões", ancora: "s1u4", estado: "disponivel" }], error: null }));
    const sb = sandboxComTrilha(f.auth);
    assert.equal(await sb.CFI.load(), true);
    assert.deepEqual(f.chamadas, ["individual_challenges_list"]);
    assert.match(sb.CFT.challengeHtml({ trail: { start: "2026-11-02", ex: {}, lv: {} } }, 3, -30), /data-ch="a"/);
  });

  test("não consulta de novo dentro de 30 s (troca de aba e redesenhos não geram rajada)", async () => {
    const f = clienteFalso(() => Promise.resolve({ data: [], error: null }));
    const sb = sandboxComTrilha(f.auth);
    await sb.CFI.load();
    assert.equal(await sb.CFI.load(), false);
    assert.equal(f.chamadas.length, 1);
    assert.equal(await sb.CFI.load(true), true);
    assert.equal(f.chamadas.length, 2);
  });

  test("não reaproveita chamada em voo: chamadas simultâneas viram uma só", async () => {
    let resolver; const pendente = new Promise((r) => { resolver = r; });
    const f = clienteFalso(() => pendente);
    const sb = sandboxComTrilha(f.auth);
    const p1 = sb.CFI.load(true), p2 = sb.CFI.load(true);
    resolver({ data: [], error: null });
    await Promise.all([p1, p2]);
    assert.equal(f.chamadas.length, 1);
  });

  test("erro do servidor: não inventa estado, mantém o anterior e permite nova tentativa", async () => {
    let falha = false;
    const f = clienteFalso(() => Promise.resolve(falha ? { data: null, error: { message: "x" } } : { data: [{ id: "a", nome: "A", ancora: "s1u4", estado: "concluido" }], error: null }));
    const sb = sandboxComTrilha(f.auth);
    assert.equal(await sb.CFI.load(true), true);
    falha = true;
    assert.equal(await sb.CFI.load(true), false);
    assert.match(sb.CFT.challengeHtml({ trail: { start: "2026-11-02", ex: {}, lv: {} } }, 3, -30), /st-done/);
  });

  test("sem sessão: não chama o servidor e não quebra", async () => {
    const sb = sandboxComTrilha({ getClient: () => null });
    assert.equal(await sb.CFI.load(true), false);
  });

  test("não usa as tabelas do desafio entre amigos: só a RPC individual", async () => {
    const f = clienteFalso(() => Promise.resolve({ data: [], error: null }));
    const sb = sandboxComTrilha(f.auth);
    await sb.CFI.load(true);
    assert.ok(f.chamadas.every((n) => n === "individual_challenges_list"));
  });

  test("atualiza sem recarregar o app: volta à aba com a aba visível, reconecta e roda a cada 60 s", async () => {
    const listeners = {}; let intervalo = null;
    const doc = {
      visibilityState: "hidden", body: { contains: () => false },
      getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} },
      addEventListener: (ev, fn) => { listeners[ev] = fn; },
    };
    const win = { addEventListener: (ev, fn) => { listeners["w:" + ev] = fn; }, scrollY: 0, scrollTo() {} };
    const f = clienteFalso(() => Promise.resolve({ data: [], error: null }));
    const sb = sandboxComTrilha(f.auth, { document: doc, window: win, setInterval: (fn, ms) => { intervalo = { fn, ms }; return 1; } });
    // aba oculta: nada acontece
    listeners.visibilitychange();
    assert.equal(f.chamadas.length, 0);
    // aba visível: atualiza
    doc.visibilityState = "visible";
    listeners.visibilitychange();
    await new Promise((r) => setImmediate(r));
    assert.equal(f.chamadas.length, 1);
    // reconectar: atualização forçada
    listeners["w:online"]();
    await new Promise((r) => setImmediate(r));
    assert.equal(f.chamadas.length, 2);
    // intervalo de 60 s, respeitando o mínimo de 30 s entre chamadas
    assert.equal(intervalo.ms, 60000);
    intervalo.fn();
    await new Promise((r) => setImmediate(r));
    assert.equal(f.chamadas.length, 2, "dentro de 30 s não consulta de novo");
    void sb;
  });

  test("os ouvintes são ligados uma única vez", () => {
    let registros = 0;
    const doc = {
      visibilityState: "visible", body: { contains: () => false },
      getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} },
      addEventListener: () => { registros++; },
    };
    const sb = sandboxComTrilha({ getClient: () => null }, { document: doc, window: { addEventListener() {}, scrollY: 0, scrollTo() {} }, setInterval: () => 1 });
    sb.CFI.attachRefresh(); sb.CFI.attachRefresh();
    assert.equal(registros, 1);
  });

  test("a listagem espera o fuso do aparelho antes de consultar a RPC", async () => {
    const ordem = [];
    const f = clienteFalso((nome) => { ordem.push("rpc:" + nome); return Promise.resolve({ data: [], error: null }); });
    const sb = sandboxComTrilha(f.auth);
    sb.CFZ = { ensure: () => { ordem.push("fuso"); return Promise.resolve(true); } };
    await sb.CFI.load(true);
    assert.deepEqual(ordem, ["fuso", "rpc:individual_challenges_list"]);
  });
});
