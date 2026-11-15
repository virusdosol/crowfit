/* Noz Dourada na sincronização (contrato da v3): o aparelho pede a concessão, o SERVIDOR sorteia e credita o XP,
   e o aparelho só aplica o que o servidor devolve. Usa o servidor simulado de helpers.js.
   Rodar: node --test sync-boxes.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { CF, makeServer, serverClient, makeDevice, freshState } = H;

const ID = "mensal:2026-11", NOW = "2026-11-13T20:00:00.000Z";
const withDb = (db) => { db.today = "2026-11-13"; return db; };
async function sync(dev) { await dev.run(true); await dev.idle(); }
const count = (client, name) => client.calls.filter((c) => c === name).length;

/* Abre a Noz como a tela faz: chamada ao servidor e aplicação do resultado confirmado. */
async function openLikeScreen(S, client) {
  const r = await client.rpc("open_my_box", { p: { id: ID } });
  assert.equal(r.error, null, "servidor aceitou a abertura");
  return CF.applyBoxOpen(S, ID, r.data, NOW);
}

describe("concessão pelo servidor", () => {
  test("sincronizar concede a Noz do mês corrente, sem sortear no aparelho", async () => {
    const db = withDb(makeServer());
    const S = freshState({ points: 480 });
    await sync(makeDevice({ S, client: serverClient(db) }));
    assert.ok(db.boxes[ID], "servidor registrou a Noz do mês");
    assert.equal(db.boxes[ID].opened_at, null, "nasce pendente");
    assert.equal(db.boxes[ID].xp, null, "sem XP antes da abertura");
    assert.equal(S.boxes[ID].xp, null, "aparelho não guarda sorteio");
    assert.equal(db.progress.points, 480, "concessão não credita XP");
  });
  test("sincronizar várias vezes não cria Noz extra", async () => {
    const db = withDb(makeServer());
    const S = freshState({ points: 480 });
    const client = serverClient(db);
    const dev = makeDevice({ S, client });
    await sync(dev); await sync(dev);
    assert.equal(Object.keys(db.boxes).length, 1);
  });
  test("Noz de mês passado não é concedida depois (sem retroativa)", async () => {
    const db = withDb(makeServer());
    const S = freshState({ points: 480, boxes: { "mensal:2026-10": { id: "mensal:2026-10", kind: "mensal", month: "2026-10", xp: null, items: [], granted: "2026-10-05", opened: null } } });
    await sync(makeDevice({ S, client: serverClient(db) }));
    assert.equal(db.boxes["mensal:2026-10"], undefined, "servidor recusou o mês passado");
    assert.equal(db.progress.points, 480);
  });
});

describe("abertura pela tela (servidor sorteia e credita)", () => {
  test("abrir credita o XP uma vez e os pontos batem com o servidor", async () => {
    const db = withDb(makeServer());
    const S = freshState({ points: 480 });
    const client = serverClient(db);
    await sync(makeDevice({ S, client }));
    const r = await openLikeScreen(S, client);
    assert.ok(r, "resultado aplicado");
    assert.equal(S.points, db.progress.points, "pontos do aparelho = pontos do servidor");
    assert.equal(S.points, 480 + r.xp);
  });
  test("sincronizar depois de abrir não reabre nem soma XP de novo", async () => {
    const db = withDb(makeServer());
    const S = freshState({ points: 480 });
    const client = serverClient(db);
    const dev = makeDevice({ S, client });
    await sync(dev);
    await openLikeScreen(S, client);
    const pts = db.progress.points;
    await sync(dev); await sync(dev);
    assert.equal(db.progress.points, pts, "XP não duplica");
    assert.equal(S.points, pts);
  });
  test("abrir de novo a mesma Noz devolve o resultado gravado, sem novo crédito", async () => {
    const db = withDb(makeServer());
    const S = freshState({ points: 480 });
    const client = serverClient(db);
    await sync(makeDevice({ S, client }));
    const first = await client.rpc("open_my_box", { p: { id: ID } });
    const pts = db.progress.points;
    const again = await client.rpc("open_my_box", { p: { id: ID } });
    assert.equal(again.data.already, true);
    assert.equal(again.data.xp, first.data.xp);
    assert.equal(db.progress.points, pts, "repetir não credita");
  });
  test("abrir sem Noz concedida é recusado pelo servidor", async () => {
    const db = withDb(makeServer());
    const r = await serverClient(db).rpc("open_my_box", { p: { id: ID } });
    assert.equal(r.error.message, "box_not_granted");
    assert.equal(db.progress.points || 0, 0);
  });
});

describe("dois aparelhos", () => {
  test("o segundo aparelho recebe a abertura do primeiro sem somar XP", async () => {
    const db = withDb(makeServer());
    const A = freshState({ points: 480 }), B = freshState({ points: 480 });
    const client = serverClient(db);
    await sync(makeDevice({ S: A, client }));
    await openLikeScreen(A, client);
    const pts = db.progress.points;
    await sync(makeDevice({ S: B, client }));
    assert.ok(B.boxes[ID].opened, "B vê a Noz aberta");
    assert.equal(db.progress.points, pts, "B não creditou nada");
  });
});

describe("desconexão e reconexão", () => {
  test("offline não concede; ao reconectar, a Noz do mês entra no servidor", async () => {
    const db = withDb(makeServer());
    const S = freshState({ points: 480 });
    const store = new Map();
    await sync(makeDevice({ S, store, client: null, online: false }));
    assert.equal(db.boxes[ID], undefined);
    await sync(makeDevice({ S, store, client: serverClient(db) }));
    assert.ok(db.boxes[ID], "concedida na reconexão");
    assert.equal(db.progress.points, 480, "sem crédito de XP");
  });
});
