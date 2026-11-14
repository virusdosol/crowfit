/* Caixas mensais na sincronização: envio, abertura única, dois aparelhos, desconexão e reconexão.
   Usa o mesmo servidor simulado do sync.test.js (helpers.js). Rodar: node --test sync-boxes.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { CF, makeServer, serverClient, makeDevice, freshState } = H;

const SEED = "user-a|mensal:2026-11", BOX = "mensal:2026-11", DAY = "2026-11-13", NOW = "2026-11-13T20:00:00.000Z";
const CFG = Object.assign({}, CF.BOX, { criterio: { t: "dias_no_mes", v: 3 } });
const DONE = { "2026-11-02": true, "2026-11-05": true, "2026-11-09": true };

/* Estado com a caixa do mês criada (nível 3, 480 XP). Não abre nada. */
function withBox(over) {
  const S = freshState(Object.assign({ points: 480, done: Object.assign({}, DONE) }, over || {}));
  const g = CF.grantMonthly(S, "2026-11", SEED, 3, DAY, CFG, []);
  return { S, xp: g.xp };
}
async function sync(dev) { await dev.run(true); await dev.idle(); }
const count = (client, name) => client.calls.filter((c) => c === name).length;

describe("envio e abertura única", () => {
  test("caixa aberta chega ao servidor e o XP entra uma vez na base", async () => {
    const db = makeServer();
    const { S, xp } = withBox();
    CF.openBox(S, BOX, NOW);
    await sync(makeDevice({ S, client: serverClient(db) }));
    assert.ok(db.boxes[BOX].opened_at, "abertura registrada");
    assert.equal(db.progress.base_points, 480 + xp);
    assert.equal(db.progress.points, 480 + xp);
    assert.equal(S.points, 480 + xp);
  });
  test("sincronizar de novo não reabre nem soma XP", async () => {
    const db = makeServer();
    const { S, xp } = withBox();
    CF.openBox(S, BOX, NOW);
    const client = serverClient(db);
    const dev = makeDevice({ S, client });
    await sync(dev);
    await sync(dev);
    assert.equal(count(client, "open_my_box"), 1, "abertura enviada uma vez só");
    assert.equal(db.progress.base_points, 480 + xp);
    assert.equal(S.points, 480 + xp);
  });
  test("a caixa é registrada uma vez, mesmo com sincronizações repetidas", async () => {
    const db = makeServer();
    const { S } = withBox();
    const client = serverClient(db);
    const dev = makeDevice({ S, client });
    await sync(dev); await sync(dev);
    assert.equal(Object.keys(db.boxes).length, 1);
    assert.equal(count(client, "grant_my_box") >= 2, true, "envia, mas o servidor não duplica");
  });
  test("caixa não aberta é registrada sem XP na base", async () => {
    const db = makeServer();
    const { S } = withBox();
    await sync(makeDevice({ S, client: serverClient(db) }));
    assert.ok(db.boxes[BOX], "caixa gravada");
    assert.equal(db.boxes[BOX].opened_at, null);
    assert.equal(db.progress.base_points, 480, "sem abrir, o XP da caixa não entra");
  });
});

describe("dois aparelhos", () => {
  test("aparelho novo recebe a caixa aberta em outro aparelho e não soma de novo", async () => {
    const db = makeServer();
    const { S: SA, xp } = withBox();
    CF.openBox(SA, BOX, NOW);
    await sync(makeDevice({ S: SA, client: serverClient(db) }));
    const SB = freshState({ points: 480, done: Object.assign({}, DONE) });
    await sync(makeDevice({ S: SB, client: serverClient(db) }));
    assert.equal(SB.points, 480 + xp, "XP vem da base do servidor, uma vez");
    assert.ok(SB.boxes[BOX].opened, "aparelho B vê a caixa aberta");
    assert.equal(db.progress.base_points, 480 + xp);
  });
  test("os dois abriram offline: o servidor soma o XP uma vez só", async () => {
    const db = makeServer();
    const { S: SA, xp } = withBox();
    const SB = JSON.parse(JSON.stringify(SA));
    CF.openBox(SA, BOX, "2026-11-13T10:00:00.000Z");
    CF.openBox(SB, BOX, "2026-11-13T12:00:00.000Z");
    await sync(makeDevice({ S: SA, client: serverClient(db) }));
    await sync(makeDevice({ S: SB, client: serverClient(db) }));
    assert.equal(db.progress.base_points, 480 + xp);
    assert.equal(SA.points, 480 + xp);
    assert.equal(SB.points, 480 + xp);
  });
  test("servidor já tem o conteúdo da caixa: o aparelho adota esse conteúdo (não aberto aqui)", async () => {
    const db = makeServer({ boxes: { [BOX]: { month: "2026-11", xp: 100, items: [], granted: DAY, opened_at: null } } });
    const { S } = withBox();
    S.boxes[BOX].xp = 150;
    await sync(makeDevice({ S, client: serverClient(db) }));
    assert.equal(S.boxes[BOX].xp, 100, "primeira gravação do servidor vale");
  });
});

describe("desconexão e reconexão", () => {
  test("abre offline, reconecta e envia: XP e abertura chegam ao servidor", async () => {
    const db = makeServer();
    const { S, xp } = withBox();
    const store = new Map();
    CF.openBox(S, BOX, NOW);
    await sync(makeDevice({ S, store, client: null, online: false }));
    assert.equal(db.progress.base_points, 0, "nada enviado enquanto offline");
    assert.equal(db.boxes[BOX], undefined);
    await sync(makeDevice({ S, store, client: serverClient(db) }));
    assert.equal(db.progress.base_points, 480 + xp);
    assert.ok(db.boxes[BOX].opened_at);
    assert.equal(S.points, 480 + xp, "reconexão não soma de novo");
  });
  test("caixa criada offline é enviada na reconexão, com o mesmo conteúdo", async () => {
    const db = makeServer();
    const { S, xp } = withBox();
    const store = new Map();
    await sync(makeDevice({ S, store, client: null, online: false }));
    await sync(makeDevice({ S, store, client: serverClient(db) }));
    assert.equal(db.boxes[BOX].xp, xp);
    assert.equal(db.boxes[BOX].opened_at, null);
  });
});
