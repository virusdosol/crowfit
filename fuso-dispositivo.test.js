/* Fuso do aparelho (v11). Rodar: node --test fuso-dispositivo.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");

function ambiente({ zona = "Asia/Tokyo", uid = "u1", rpc } = {}) {
  const chamadas = [];
  const client = { rpc: (nome, args) => { chamadas.push({ nome, args }); return rpc ? rpc(nome, args) : Promise.resolve({ data: { time_zone: args.p.time_zone }, error: null }); } };
  const estado = { zona, uid };
  const sb = {
    console, Promise, Date, Object, Array, JSON, setTimeout, clearTimeout,
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: estado.zona }) }) },
    CrowfitAuth: {
      getClient: () => client,
      getState: () => (estado.uid ? { user: { id: estado.uid } } : { user: null }),
    },
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "fuso-dispositivo.js"), "utf8"), sb);
  return { CFZ: sb.CFZ, chamadas, estado, sb };
}

describe("fuso do aparelho", () => {
  test("envia o fuso lido do dispositivo, no formato da RPC (nenhum fuso fixo)", async () => {
    const a = ambiente({ zona: "Asia/Tokyo" });
    assert.equal(await a.CFZ.ensure(), true);
    assert.equal(a.chamadas.length, 1);
    assert.equal(a.chamadas[0].nome, "set_my_time_zone");
    assert.equal(a.chamadas[0].args.p.time_zone, "Asia/Tokyo");
    assert.deepEqual(Object.keys(a.chamadas[0].args), ["p"]);
  });

  test("outro fuso do aparelho gera outro envio: o valor vem do dispositivo", async () => {
    const a = ambiente({ zona: "America/Rio_Branco" });
    await a.CFZ.ensure();
    assert.equal(a.chamadas[0].args.p.time_zone, "America/Rio_Branco");
  });

  test("não reenvia na mesma sessão quando o fuso não mudou", async () => {
    const a = ambiente();
    await a.CFZ.ensure(); await a.CFZ.ensure(); await a.CFZ.ensure();
    assert.equal(a.chamadas.length, 1);
  });

  test("se o usuário mudar de fuso durante o uso, envia o novo fuso", async () => {
    const a = ambiente({ zona: "Europe/Lisbon" });
    await a.CFZ.ensure();
    a.estado.zona = "America/Sao_Paulo";
    assert.equal(await a.CFZ.ensure(), true);
    assert.equal(a.chamadas.length, 2);
    assert.equal(a.chamadas[1].args.p.time_zone, "America/Sao_Paulo");
  });

  test("outra conta no mesmo aparelho recebe o próprio envio", async () => {
    const a = ambiente({ uid: "u1" });
    await a.CFZ.ensure();
    a.estado.uid = "u2";
    await a.CFZ.ensure();
    assert.equal(a.chamadas.length, 2);
  });

  test("falha da RPC: resolve false, não lança e não bloqueia; só tenta de novo após o intervalo", async () => {
    const a = ambiente({ rpc: () => Promise.resolve({ data: null, error: { message: "function does not exist" } }) });
    assert.equal(await a.CFZ.ensure(), false);
    assert.equal(await a.CFZ.ensure(), false);
    assert.equal(a.chamadas.length, 1, "recuo: não repete em rajada");
  });

  test("exceção da RPC é engolida", async () => {
    const a = ambiente({ rpc: () => Promise.reject(new Error("rede")) });
    assert.equal(await a.CFZ.ensure(), false);
  });

  test("tempo esgotado: resolve false sem travar o app", async () => {
    const a = ambiente({ rpc: () => new Promise(() => {}) });
    vm.runInContext("CFZ.config.timeoutMs = 20", a.sb); // tempo limite curto só para o teste
    assert.equal(await a.CFZ.ensure(), false);
  });

  test("sem sessão ou sem cliente: não chama o servidor", async () => {
    const a = ambiente({ uid: null });
    assert.equal(await a.CFZ.ensure(), false);
    assert.equal(a.chamadas.length, 0);
  });

  test("fuso inválido ou ausente no dispositivo: não envia nada", async () => {
    const a = ambiente({ zona: null });
    assert.equal(await a.CFZ.ensure(), false);
    assert.equal(a.chamadas.length, 0);
  });

  test("chamadas simultâneas viram um único envio", async () => {
    const a = ambiente();
    await Promise.all([a.CFZ.ensure(), a.CFZ.ensure()]);
    assert.equal(a.chamadas.length, 1);
  });

  test("o código não contém fuso fixo", () => {
    const src = fs.readFileSync(path.join(__dirname, "fuso-dispositivo.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");   // só código, sem comentários
    assert.doesNotMatch(src, /["'`](America|Europe|Asia|Africa|Australia|Pacific)\//);
    assert.doesNotMatch(src, /Sao_Paulo/);
  });

  test("a sincronização chama o fuso antes de qualquer RPC da rodada", () => {
    const src = fs.readFileSync(path.join(__dirname, "supabase-sync.js"), "utf8");
    const ensure = src.indexOf("root.CFZ.ensure()");
    const primeiraRpc = src.indexOf("async function fetchRemote");
    assert.ok(ensure > 0, "chamada de garantia do fuso não encontrada");
    assert.ok(ensure < src.indexOf("var remote = null", src.indexOf("async function run")), "fuso deve vir antes do plano da rodada");
    assert.ok(primeiraRpc > 0);
  });
});
