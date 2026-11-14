/* Suíte de sincronização do Crowfit. Rodar: node --test tests/
   Valores esperados são escritos à mão (não são recalculados pela implementação). */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers.js");
const { SYNC, CF, makeServer, serverClient, makeDevice, freshState, profile } = H;

const T1 = "2026-11-05T10:00:00.000Z", T2 = "2026-11-06T10:00:00.000Z", T3 = "2026-11-07T10:00:00.000Z";

describe("1. envio de progresso completo", () => {
  test("pontos, recompensas, dias, plano e melhor ofensiva chegam ao servidor", async () => {
    const db = makeServer();
    const S = freshState({ points: 80, best: 5, last: "2026-11-12", done: { "2026-11-10": true, "2026-11-12": true },
      rewards: { "sess:2026-11-10": true }, planHistory: [{ from: "2026-11-01", dias: 4 }] });
    const d = makeDevice({ S, client: serverClient(db) });
    await d.run(true); await d.idle();
    assert.equal(db.progress.base_points, 60);             /* 80 - 20 (recompensa de sessão) */
    assert.equal(db.progress.points, 80);
    assert.deepEqual(H.plain(db.progress.done_dates), ["2026-11-10", "2026-11-12"]);
    assert.equal(db.progress.best_streak, 5);
    assert.equal(db.progress.last_workout_date, "2026-11-12");
    assert.deepEqual(H.plain(db.progress.plan_history), [{ from: "2026-11-01", dias: 4 }]);
  });
});

describe("2. recuperação da trilha em dispositivo novo", () => {
  test("início, níveis, marcas e configurações vêm da conta", async () => {
    const db = makeServer({
      trail: { start: "2026-11-01", levels: { "1": 1 }, ex: { "s1u1|flexao": { done: true, at: T1 } } },
      settings: { exp: "Treino sempre", dias: 5, adjust: 1, easy_streak: 2, at: T2 },
      nozes: { "2026-11-07": 40 },
    });
    const S = freshState({ trail: { start: H.TODAY, ex: {}, lv: { "1": 2 } } });
    const d = makeDevice({ S, client: serverClient(db) });
    await d.run(true); await d.idle();
    assert.equal(S.trail.start, "2026-11-01");
    assert.equal(S.trail.lv["1"], 1);
    assert.equal(S.trail.ex.s1u1.flexao, true);
    assert.equal(S.profile, null, "perfil local não é criado a partir da conta");
    assert.equal(d.inst.remoteSettings().dias, 5);
    assert.equal(S.nozes["2026-11-07"], 40);
    assert.ok(d.host.saves >= 1, "salvou no armazenamento local");
    assert.ok(d.host.changes >= 1, "avisou a interface");
  });
});

describe("3. preservação de XP e recompensas", () => {
  test("XP da conta não é somado de novo nem perdido ao recuperar", async () => {
    const db = makeServer({ progress: { base_points: 300, points: 300, rewards: { "ex:2026-11-10:flexao": 10 }, done_dates: [], best_streak: 0, last_workout_date: null, plan_history: [], revision: 1 } });
    const S = freshState({ points: 0, rewards: {} });
    const d = makeDevice({ S, client: serverClient(db) });
    await d.run(true); await d.idle();
    assert.equal(S.points, 310, "300 da base + 10 da recompensa, uma vez");
    assert.equal(S.rewards["ex:2026-11-10:flexao"], true);
  });

  test("XP ganho enquanto a sincronização roda é mantido após a resposta", async () => {
    const db = makeServer({ progress: { base_points: 300, points: 300, rewards: {}, done_dates: [], best_streak: 0, last_workout_date: null, plan_history: [], revision: 1 } });
    const S = freshState({ points: 300 });
    const client = serverClient(db, { beforeRpc: async (name) => { if (name === "merge_my_progress") S.points += 20; } });
    const d = makeDevice({ S, client });
    await d.run(true); await d.idle();
    assert.equal(S.points, 320, "300 da conta + 20 ganhos durante a chamada");
  });
});

describe("4. desmarcação e remarcação de exercícios", () => {
  test("desmarcar envia done=false e remarcar depois envia done=true (o mais novo vence)", async () => {
    const db = makeServer();
    const S = freshState({ trail: { start: "2026-11-01", ex: { s1u2: { agachamento: true } }, lv: { "1": 1 } } });
    const dev = makeDevice({ S, client: serverClient(db) });
    await dev.run(true); await dev.idle();
    assert.equal(db.trail.ex["s1u2|agachamento"].done, true);
    delete S.trail.ex.s1u2;                              /* desmarcou */
    await H.tick(); await dev.run(false); await dev.idle();
    assert.equal(db.trail.ex["s1u2|agachamento"].done, false, "desmarcação chegou");
    S.trail.ex.s1u2 = { agachamento: true };             /* remarcou */
    await H.tick(); await dev.run(false); await dev.idle();
    assert.equal(db.trail.ex["s1u2|agachamento"].done, true, "remarcação chegou");
  });
});

describe("5. abertura duplicada de uma noz", () => {
  test("a mesma semana enviada duas vezes concede XP uma vez", async () => {
    const db = makeServer({ trail: { start: "2026-11-01", levels: {}, ex: {} }, nozes: { "2026-11-07": 40 } });
    const S = freshState({ points: 40, trail: { start: "2026-11-01", ex: {}, lv: {} }, nozes: { "2026-11-07": 40 } });
    const d = makeDevice({ S, client: serverClient(db) });
    await d.run(true); await d.idle();
    await d.run(false); await d.idle();
    assert.equal(db.progress.base_points, 40, "XP da noz não dobra");
    assert.equal(db.nozes["2026-11-07"], 40);
  });
});

describe("6. dois dispositivos alterando o mesmo progresso", () => {
  test("marcas de dois aparelhos convergem: cada um recebe o que o outro fez", async () => {
    const db = makeServer({ trail: { start: "2026-11-01", levels: { "1": 1 }, ex: { "s1u1|flexao": { done: false, at: T1 } } } });
    const A = makeDevice({ S: freshState({ trail: { start: "2026-11-01", ex: { s1u3: { prancha: true } }, lv: { "1": 1 } } }), client: serverClient(db), store: new Map(), uid: H.UID });
    const B = makeDevice({ S: freshState({ trail: { start: "2026-11-01", ex: { s1u1: { flexao: true } }, lv: { "1": 1 } } }), client: serverClient(db), store: new Map(), uid: H.UID });
    await A.run(true); await A.idle();
    await H.tick(); await B.run(true); await B.idle();
    await H.tick(); await A.inst._run(false, "visible"); await A.idle();
    assert.equal(db.trail.ex["s1u3|prancha"].done, true, "marca de A está no servidor");
    assert.equal(B.S.trail.ex.s1u3.prancha, true, "B recebeu a marca de A");
    assert.equal(A.S.trail.ex.s1u1.flexao, true, "A recebeu a marca de B, que é mais nova que o registro antigo do servidor");
    assert.equal(db.trail.ex["s1u1|flexao"].done, true, "o mais novo (B) venceu o registro antigo (T1)");
  });
});

describe("7. sincronização offline e reconexão", () => {
  test("offline não chama o servidor; ao voltar, envia e fica pendente=false", async () => {
    const db = makeServer();
    const client = serverClient(db);
    const S = freshState({ points: 20, trail: { start: "2026-11-01", ex: { s1u1: { flexao: true } }, lv: { "1": 1 } } });
    const d = makeDevice({ S, client, online: false });
    await d.run(true); await d.idle();
    assert.equal(client.calls.length, 0, "nenhuma chamada offline");
    const meta = JSON.parse(d.store.get("corvofit-v2:sync:" + H.UID));
    assert.equal(meta.pending, true, "fica pendente");
    d.nav.onLine = true;
    await d.run(false); await d.idle();
    assert.ok(client.calls.includes("merge_my_progress") && client.calls.includes("merge_my_trail"), "enviou ao reconectar");
    assert.equal(db.trail.ex["s1u1|flexao"].done, true);
    assert.equal(JSON.parse(d.store.get("corvofit-v2:sync:" + H.UID)).pending, false);
  });
});

describe("8. troca de conta durante uma requisição", () => {
  test("resposta atrasada de outra conta não altera o estado atual", async () => {
    const db = makeServer({ trail: { start: "2026-11-01", levels: {}, ex: {} } });
    let release;
    const gate = new Promise((r) => { release = r; });
    const client = serverClient(db, { beforeRpc: async (name) => { if (name === "merge_my_trail") await gate; } });
    const S = freshState({ points: 5 });
    const d = makeDevice({ S, client });
    const p = d.run(true);
    await new Promise((r) => setTimeout(r, 5));
    d.host.gen = 2; d.host.uid = "user-b";            /* troca de conta enquanto a chamada está em curso */
    release(); await p; await d.idle();
    assert.equal(S.trail.start, H.TODAY, "trilha da conta anterior não foi adotada");
    assert.equal(S.points, 5, "pontos não mudaram");
  });
});

describe("9. compatibilidade com dados antigos", () => {
  test("estado sem nozes e sem níveis, e metadados antigos, não quebram a sincronização", async () => {
    const db = makeServer();
    const S = { points: 10, best: 0, last: "", done: {}, rewards: {}, history: [], planHistory: [], adjust: 0, easyStreak: 0,
      profile: profile(), trail: { start: "2026-11-01", ex: {}, lv: {} } };
    const store = new Map([["corvofit-v2:sync:" + H.UID, JSON.stringify({ v: 1, sig: "", blocked: "", pending: false, seeded: true, last: "", amounts: {}, sess: {} })]]);
    const d = makeDevice({ S, client: serverClient(db), store });
    await d.run(false); await d.idle();
    assert.equal(db.progress.base_points, 10);
    assert.equal(JSON.parse(store.get("corvofit-v2:sync:" + H.UID)).pending, false);
  });
  test("servidor sem as tabelas v2 não impede o envio do progresso", async () => {
    const db = makeServer();
    const client = serverClient(db);
    client.rpc = async (name, args) => { if (name.startsWith("merge_my_trail") || name === "merge_my_settings" || name === "merge_my_nozes") return { data: null, error: { message: "function public.merge_my_trail(jsonb) does not exist" } }; return serverClient(db).rpc(name, args); };
    const S = freshState({ points: 30, nozes: { "2026-11-07": 10 } });
    const d = makeDevice({ S, client });
    await d.run(true); await d.idle();
    assert.equal(db.progress.base_points, 30, "progresso sincronizado mesmo sem v2");
  });
});

describe("10. ausência de perda de dados locais", () => {
  test("erro do servidor não apaga nada local", async () => {
    const db = makeServer();
    const client = serverClient(db, { beforeRpc: async (name) => { if (name === "merge_my_progress") throw Object.assign(new Error("invalid_base_points"), { code: "22023" }); } });
    const before = { points: 50, done: { "2026-11-10": true }, ex: { s1u1: { flexao: true } }, nozes: { "2026-11-07": 40 } };
    const S = freshState({ points: 50, done: { "2026-11-10": true }, trail: { start: "2026-11-01", ex: { s1u1: { flexao: true } }, lv: { "1": 1 } }, nozes: { "2026-11-07": 40 } });
    const d = makeDevice({ S, client });
    await d.run(true); await d.idle();
    assert.equal(S.points, before.points);
    assert.deepEqual(H.plain(S.done), before.done);
    assert.deepEqual(H.plain(S.trail.ex), before.ex);
    assert.deepEqual(H.plain(S.nozes), before.nozes);
    assert.equal(d.inst.status().state, "error");
  });
});

describe("limites e validação dos payloads", () => {
  test("trilha: no máximo 500 exercícios por envio, o resto fica para a próxima rodada", () => {
    const S = freshState({ trail: { start: "2026-11-01", ex: {}, lv: {} } });
    for (let u = 1; u <= 20; u++) { S.trail.ex["s1u" + u] = {}; for (let i = 0; i < 40; i++) S.trail.ex["s1u" + u]["e" + i] = true; }
    const b = SYNC.buildTrail({ CF }, S, { exState: {} }, "2026-11-13T12:00:00.000Z");
    assert.equal(b.payload.exercises.length, 500);
    assert.equal(b.rest, 300);
  });
  test("trilha: ids fora do formato são descartados (maiúsculas, espaços, unidade inválida)", () => {
    const S = freshState({ trail: { start: "2026-11-01", ex: { s1u1: { Flexao: true, "x y": true, ok_1: true }, banana: { a: true } }, lv: {} } });
    const b = SYNC.buildTrail({ CF }, S, { exState: {} }, "2026-11-13T12:00:00.000Z");
    assert.deepEqual(H.plain(b.payload.exercises.map((x) => x.unit + "|" + x.ex)), ["s1u1|ok_1"]);
  });
  test("configurações: idade, peso e altura nunca entram no payload", () => {
    const S = freshState({ profile: profile({ dias: 6, exp: "Treino sempre" }), adjust: -1, easyStreak: 10 });
    const st = SYNC.buildSettings({ CF }, S, { setSig: "", setAt: "" });
    assert.deepEqual(H.plain(Object.keys(st).sort()), ["adjust", "at", "dias", "easy_streak", "exp", "sig"]);
    const json = JSON.stringify(st);
    assert.ok(!json.includes("idade") && !json.includes("peso") && !json.includes("altura") && !json.includes("Ana"));
  });
  test("configurações: valores fora do limite não são enviados", () => {
    assert.equal(SYNC.buildSettings({ CF }, freshState({ profile: profile({ dias: 7 }) }), { setSig: "" }), null);
    assert.equal(SYNC.buildSettings({ CF }, freshState({ profile: profile({ exp: "Outro" }) }), { setSig: "" }), null);
    const st = SYNC.buildSettings({ CF }, freshState({ profile: profile(), adjust: 9, easyStreak: 99 }), { setSig: "" });
    assert.equal(st.adjust, 0); assert.equal(st.easy_streak, 0);
  });
  test("nozes: só sábados válidos, no máximo 200 (os mais recentes)", () => {
    const n = {};
    for (let i = 0; i < 210; i++) { const d = new Date(Date.UTC(2020, 0, 4) + i * 7 * 864e5); n[d.toISOString().slice(0, 10)] = 10; }
    n["2026-11-13"] = 10;                              /* sexta: inválida */
    n["2026-11-14"] = 0;                               /* xp zero: inválido */
    const nz = SYNC.buildNozes({ CF }, freshState({ nozes: n }));
    assert.equal(nz.list.length, 200);
    assert.ok(nz.list.every((x) => CF.parseDate(x.week_start).getDay() === 6));
    assert.ok(!nz.list.some((x) => x.week_start === "2026-11-13" || x.week_start === "2026-11-14"));
  });
  test("progresso: pontos inconsistentes com as recompensas não são enviados", () => {
    const S = freshState({ points: 5, rewards: { "sess:2026-11-10": true } });
    const r = SYNC.buildProgress({ CF }, S, {}, TODAY_ISO());
    assert.equal(r.error, "xp_inconsistent");
  });
  test("trilha: níveis fora de 0..2 são descartados localmente", () => {
    const S = freshState({ trail: { start: "2026-11-01", ex: {}, lv: { "1": 1, "2": 7, abc: 1 } } });
    const b = SYNC.buildTrail({ CF }, S, { exState: {} }, "2026-11-13T12:00:00.000Z");
    assert.deepEqual(H.plain(b.payload.levels), { "1": 1 });
  });
});

function TODAY_ISO() { return "2026-11-13"; }

describe("11. recusa do servidor em caixa não bloqueia a sincronização", () => {
  test("criterion_not_defined: caixa fica local, progresso sincroniza, pending=false", async () => {
    const db = makeServer();
    const base = serverClient(db);
    const client = { calls: base.calls, from: base.from, rpc: async (name, args) => (name === "grant_my_box" ? { data: null, error: { message: "criterion_not_defined" } } : base.rpc(name, args)) };
    const S = freshState({ points: 30 });
    S.boxes = { "mensal:2026-10": { id: "mensal:2026-10", kind: "mensal", month: "2026-10", xp: 40, items: [], granted: "2026-11-01", opened: null } };
    const d = makeDevice({ S, client });
    await d.run(true); await d.idle();
    assert.equal(db.progress.base_points, 30, "progresso sincronizado");
    assert.ok(S.boxes["mensal:2026-10"], "caixa continua no aparelho");
    assert.equal(JSON.parse(d.store.get("corvofit-v2:sync:" + H.UID)).pending, false, "sem pendência");
  });

  test("erro inesperado de grant_my_box continua bloqueando (pending=true)", async () => {
    const db = makeServer();
    const base = serverClient(db);
    const client = { calls: base.calls, from: base.from, rpc: async (name, args) => (name === "grant_my_box" ? { data: null, error: { message: "erro_inesperado_xyz" } } : base.rpc(name, args)) };
    const S = freshState({ points: 30 });
    S.boxes = { "mensal:2026-10": { id: "mensal:2026-10", kind: "mensal", month: "2026-10", xp: 40, items: [], granted: "2026-11-01", opened: null } };
    const d = makeDevice({ S, client });
    await d.run(true); await d.idle();
    assert.equal(JSON.parse(d.store.get("corvofit-v2:sync:" + H.UID)).pending, true, "falha real continua pendente");
  });
});

describe("12. eventos de dia (fase 1)", () => {
  const ev = (id, day) => ({ id, day, kind: "done", at: day + "T12:00:00.000Z" });
  function withRpc(base, fn) {
    return { calls: base.calls, from: base.from, rpc: async (name, args) => (name === "record_day_events" ? fn(args) : base.rpc(name, args)) };
  }

  test("aceitos, duplicados e recusados saem do aparelho; pending=false", async () => {
    const db = makeServer();
    const base = serverClient(db);
    const seen = [];
    const client = withRpc(base, (args) => {
      seen.push(args.p.events.map((e) => e.id));
      return { data: args.p.events.map((e, i) => ({ id: e.id, status: i === 0 ? "accepted" : i === 1 ? "duplicate" : "rejected", reason: null })), error: null };
    });
    const S = freshState({ points: 30 });
    S.dayLog = [ev("ea1", "2026-11-10"), ev("ea2", "2026-11-11"), ev("ea3", "2026-11-12")];
    const d = makeDevice({ S, client });
    await d.run(true); await d.idle();
    assert.deepEqual(seen[0], ["ea1", "ea2", "ea3"]);
    assert.equal(S.dayLog.length, 0, "nenhum evento ficou no aparelho");
    assert.equal(JSON.parse(d.store.get("corvofit-v2:sync:" + H.UID)).pending, false);
  });

  test("falha de rede mantém os eventos e marca pendência", async () => {
    const db = makeServer();
    const client = withRpc(serverClient(db), () => ({ data: null, error: { message: "Failed to fetch" } }));
    const S = freshState({ points: 30 });
    S.dayLog = [ev("eb1", "2026-11-10")];
    const d = makeDevice({ S, client });
    await d.run(true); await d.idle();
    assert.equal(S.dayLog.length, 1, "evento preservado");
    assert.equal(JSON.parse(d.store.get("corvofit-v2:sync:" + H.UID)).pending, true);
  });

  test("erro inesperado mantém os eventos e marca pendência", async () => {
    const db = makeServer();
    const client = withRpc(serverClient(db), () => ({ data: null, error: { message: "erro_inesperado_dias" } }));
    const S = freshState({ points: 30 });
    S.dayLog = [ev("ec1", "2026-11-10")];
    const d = makeDevice({ S, client });
    await d.run(true); await d.idle();
    assert.equal(S.dayLog.length, 1);
    assert.equal(JSON.parse(d.store.get("corvofit-v2:sync:" + H.UID)).pending, true);
  });

  test("lote maior que o limite: envia em rodadas até zerar", async () => {
    const db = makeServer();
    const base = serverClient(db);
    const sizes = [];
    const client = withRpc(base, (args) => {
      sizes.push(args.p.events.length);
      return { data: args.p.events.map((e) => ({ id: e.id, status: "accepted", reason: null })), error: null };
    });
    const S = freshState({ points: 30 });
    S.dayLog = Array.from({ length: 201 }, (_, i) => ev("ed" + i, "2026-11-10"));
    const d = makeDevice({ S, client });
    await d.run(true); await d.idle();
    assert.equal(sizes[0], 200, "primeiro lote de 200");
    assert.equal(S.dayLog.length, 1, "um evento restante");
    await d.run(false); await d.idle();
    assert.equal(S.dayLog.length, 0, "rodada seguinte zera a fila");
  });

  test("core: logDay registra evento válido e rejeita tipo inválido", () => {
    const S = { points: 0 };
    const e = H.CF.logDay(S, "done", "2026-11-10", "2026-11-10T12:00:00.000Z");
    assert.ok(e && /^[a-z0-9]{1,40}$/.test(e.id));
    assert.equal(S.dayLog.length, 1);
    assert.equal(H.CF.logDay(S, "x", "2026-11-10", "2026-11-10T12:00:00.000Z"), null);
    assert.equal(H.CF.dayEventOk({ id: "ok1", day: "2026-11-10", kind: "undone", at: "2026-11-10T12:00:00.000Z" }), true);
    assert.equal(H.CF.dayEventOk({ id: "BAD ID", day: "2026-11-10", kind: "done", at: "2026-11-10T12:00:00.000Z" }), false);
  });
});

describe("13. relógio do aparelho (fase 1)", () => {
  const ev = (id, day) => ({ id, day, kind: "done", at: day + "T12:00:00.000Z" });
  function setup(serverOffsetMs) {
    const db = makeServer();
    const base = serverClient(db);
    const sent = [];
    const client = {
      calls: base.calls, from: base.from,
      rpc: async (name, args) => {
        if (name === "cf_server_now") return { data: new Date(Date.now() + serverOffsetMs).toISOString(), error: null };
        if (name === "record_day_events") { sent.push(args.p.events.map((e) => e.id)); return { data: args.p.events.map((e) => ({ id: e.id, status: "accepted", reason: null })), error: null }; }
        return base.rpc(name, args);
      },
    };
    return { db, client, sent };
  }

  test("relógio adiantado 10 min: nada é enviado, eventos ficam, popup mostrado", async () => {
    const shown = [];
    {
      const { client, sent } = setup(10 * 60 * 1000);
      const S = freshState({ points: 30 });
      S.dayLog = [ev("ra1", "2026-11-10")];
      const d = makeDevice({ S, client, aviso: (t) => shown.push(t) });
      await d.run(true); await d.idle();
      assert.equal(sent.length, 0, "não envia com relógio errado");
      assert.equal(S.dayLog.length, 1, "evento preservado");
      assert.equal(shown.length, 1, "popup mostrado");
      assert.match(shown[0], /Ajuste o relógio/);
    }
  });

  test("popup não se repete a cada sincronização dentro de 10 min", async () => {
    const shown = [];
    {
      const { client } = setup(-10 * 60 * 1000);
      const S = freshState({ points: 30 });
      S.dayLog = [ev("rb1", "2026-11-10")];
      const d = makeDevice({ S, client, aviso: (t) => shown.push(t) });
      await d.run(true); await d.idle();
      await d.run(false); await d.idle();
      assert.equal(shown.length, 1);
    }
  });

  test("relógio correto: envia normalmente", async () => {
    const { client, sent } = setup(0);
    const S = freshState({ points: 30 });
    S.dayLog = [ev("rc1", "2026-11-10")];
    const d = makeDevice({ S, client });
    await d.run(true); await d.idle();
    assert.equal(sent.length, 1);
    assert.equal(S.dayLog.length, 0);
  });

  test("servidor sem cf_server_now (v4 não aplicada): não bloqueia o envio", async () => {
    const db = makeServer();
    const base = serverClient(db);
    const sent = [];
    const client = { calls: base.calls, from: base.from, rpc: async (name, args) => {
      if (name === "record_day_events") { sent.push(1); return { data: args.p.events.map((e) => ({ id: e.id, status: "accepted", reason: null })), error: null }; }
      return base.rpc(name, args);
    } };
    const S = freshState({ points: 30 });
    S.dayLog = [ev("rd1", "2026-11-10")];
    const d = makeDevice({ S, client });
    await d.run(true); await d.idle();
    assert.equal(sent.length, 1);
  });
});
