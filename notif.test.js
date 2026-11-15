/* Testes da central de notificações (núcleo). Rodar: node --test notif.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CF = require("./core.js");
const N = require("./notif.js");
const deps = { CF };

function clockFor(today, hhmm) {
  const [h, m] = (hhmm || "12:00").split(":");
  const d = new Date(today + "T" + h + ":" + m + ":00");
  return { today, iso: d.toISOString(), weekday: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() };
}
const TODAY = "2026-11-15";
function base() { const S = CF.emptyState(); S.profile = { nome: "T", idade: 30, peso: 70, altura: 170, exp: "Treino às vezes", dias: 3 }; S.points = 0; return S; }

describe("detecção por diferença de estado", () => {
  test("primeira varredura só registra o estado: nada de notificações antigas", () => {
    const inbox = N.emptyInbox(), S = base(); S.points = 5000; S.achievements = { x: { at: "a", day: TODAY, reason: "r" } };
    assert.equal(N.scanLocal(inbox, S, clockFor(TODAY), deps), 0);
    assert.equal(inbox.items.length, 0);
    assert.ok(inbox.snap);
  });
  test("subir de nível gera uma notificação, e repetir a varredura não repete", () => {
    const inbox = N.emptyInbox(), S = base(), c = clockFor(TODAY);
    N.scanLocal(inbox, S, c, deps);
    S.points = 400;                                   /* passa do nível 1 */
    assert.equal(N.scanLocal(inbox, S, c, deps), 1);
    assert.equal(N.scanLocal(inbox, S, c, deps), 0);  /* não repete */
    assert.equal(inbox.items.filter(i => i.type === "level").length, 1);
  });
  test("conquista nova gera aviso uma vez", () => {
    const inbox = N.emptyInbox(), S = base(), c = clockFor(TODAY);
    N.scanLocal(inbox, S, c, deps);
    S.achievements = { primeira: { at: c.iso, day: TODAY, reason: "Primeiro treino" } };
    N.scanLocal(inbox, S, c, deps); N.scanLocal(inbox, S, c, deps);
    const a = inbox.items.filter(i => i.type === "achievement");
    assert.equal(a.length, 1);
    assert.equal(a[0].body, "Primeiro treino");
  });
  test("troféu novo gera aviso com a contagem", () => {
    const inbox = N.emptyInbox(), S = base(), c = clockFor(TODAY);
    N.scanLocal(inbox, S, c, { CF, trophies: 0 });
    N.scanLocal(inbox, S, c, { CF, trophies: 2 });
    assert.match(inbox.items.find(i => i.type === "trophy").body, /2 troféus/);
  });
});

describe("meta semanal e nozes", () => {
  test("meta semanal só dispara ao atingir os dias do perfil", () => {
    /* semana de 15/11 (domingo) a 18/11 (quarta): hoje é 18/11 */
    const hoje = "2026-11-18", inbox = N.emptyInbox(), S = base(), c = clockFor(hoje);
    N.scanLocal(inbox, S, c, deps);
    S.done = { "2026-11-15": true, "2026-11-16": true };          /* 2 de 3 */
    N.scanLocal(inbox, S, c, deps);
    assert.equal(inbox.items.filter(i => i.type === "goal").length, 0);
    S.done["2026-11-17"] = true;                                   /* 3 de 3 */
    N.scanLocal(inbox, S, c, deps);
    assert.equal(inbox.items.filter(i => i.type === "goal").length, 1);
  });
  test("noz disponível só para a semana atual, e não quando já aberta", () => {
    const inbox = N.emptyInbox(), S = base(), c = clockFor(TODAY);
    N.scanLocal(inbox, S, c, deps);
    const sat = CF.addDays(CF.addDays(TODAY, -new Date(TODAY + "T12:00:00").getDay()), 6);
    S.nozes = {};
    N.scanLocal(inbox, S, c, deps);
    assert.equal(inbox.items.filter(i => i.type === "noz_available").length, inbox.items.some(i => i.key === "noz:" + sat) ? 1 : 0);
    S.nozes[sat] = 15;                                             /* aberta */
    N.scanLocal(inbox, S, c, deps);
    assert.equal(inbox.items.filter(i => i.type === "noz_opened").length, 1);
  });
});

describe("lembrete de treino", () => {
  test("dispara no horário escolhido, no dia escolhido, se não treinou", () => {
    const inbox = N.emptyInbox(); inbox.prefs.reminder = { on: true, time: "19:00", days: [0, 1, 2, 3, 4, 5, 6] };
    const S = base();
    assert.equal(N.reminderDue(inbox, S, clockFor(TODAY, "18:30")), false);
    assert.equal(N.reminderDue(inbox, S, clockFor(TODAY, "19:05")), true);
  });
  test("não lembra se já treinou hoje", () => {
    const inbox = N.emptyInbox(); inbox.prefs.reminder = { on: true, time: "19:00", days: [0, 1, 2, 3, 4, 5, 6] };
    const S = base(); S.done = { [TODAY]: true };
    assert.equal(N.reminderDue(inbox, S, clockFor(TODAY, "20:00")), false);
  });
  test("desligado ou em dia não escolhido: nunca dispara", () => {
    const inbox = N.emptyInbox(); const S = base();
    assert.equal(N.reminderDue(inbox, S, clockFor(TODAY, "20:00")), false);
    inbox.prefs.reminder = { on: true, time: "19:00", days: [] };
    assert.equal(N.reminderDue(inbox, S, clockFor(TODAY, "20:00")), false);
  });
  test("lembrete do dia não se repete", () => {
    const inbox = N.emptyInbox(), c = clockFor(TODAY, "20:00");
    assert.equal(N.addReminder(inbox, c), true);
    assert.equal(N.addReminder(inbox, c), false);
  });
});

describe("social (dados do servidor)", () => {
  test("primeira varredura não avisa desafios já terminados, mas avisa convites pendentes", () => {
    const inbox = N.emptyInbox(), c = clockFor(TODAY);
    N.scanSocial(inbox, { incoming: [], outgoing: [], friends: [] },
      { received: [{ id: "i1", title: "Forte" }], finished: [{ id: "f1", title: "Velho" }] }, c);
    assert.equal(inbox.items.some(i => i.type === "challenge_inv"), true);
    assert.equal(inbox.items.some(i => i.type === "challenge_res"), false);
  });
  test("pedido de amizade novo avisa uma vez", () => {
    const inbox = N.emptyInbox(), c = clockFor(TODAY);
    N.scanSocial(inbox, { incoming: [], outgoing: [], friends: [] }, null, c);
    const soc = { incoming: [{ handle: "ana", name: "Ana" }], outgoing: [], friends: [] };
    N.scanSocial(inbox, soc, null, c); N.scanSocial(inbox, soc, null, c);
    assert.equal(inbox.items.filter(i => i.type === "friend_req").length, 1);
  });
  test("pedido enviado que virou amizade gera 'aceito'", () => {
    const inbox = N.emptyInbox(), c = clockFor(TODAY);
    N.scanSocial(inbox, { incoming: [], outgoing: [{ handle: "bia" }], friends: [] }, null, c);
    N.scanSocial(inbox, { incoming: [], outgoing: [], friends: [{ handle: "bia", name: "Bia" }] }, null, c);
    assert.equal(inbox.items.filter(i => i.type === "friend_ok").length, 1);
  });
  test("resultado de desafio que terminou avisa uma vez, depois da primeira varredura", () => {
    const inbox = N.emptyInbox(), c = clockFor(TODAY);
    N.scanSocial(inbox, { incoming: [], outgoing: [], friends: [] }, { received: [], finished: [] }, c);
    N.scanSocial(inbox, { incoming: [], outgoing: [], friends: [] }, { received: [], finished: [{ id: "x", title: "Semana" }] }, c);
    N.scanSocial(inbox, { incoming: [], outgoing: [], friends: [] }, { received: [], finished: [{ id: "x", title: "Semana" }] }, c);
    assert.equal(inbox.items.filter(i => i.type === "challenge_res").length, 1);
  });
});

describe("central: leitura, limpeza e limite do aparelho", () => {
  test("marcar como lida e marcar tudo", () => {
    const inbox = N.emptyInbox(), c = clockFor(TODAY);
    N.addItem(inbox, "level", "a", "t", "b", c); N.addItem(inbox, "level", "b", "t", "b", c);
    N.markRead(inbox, "a");
    assert.equal(N.unread(inbox), 1);
    N.markAllRead(inbox);
    assert.equal(N.unread(inbox), 0);
  });
  test("limpar antigas remove da central sem repetir depois", () => {
    const inbox = N.emptyInbox();
    N.addItem(inbox, "level", "velha", "t", "b", { today: "2026-09-01", iso: "2026-09-01T10:00:00.000Z" });
    N.addItem(inbox, "level", "nova", "t", "b", clockFor(TODAY));
    const removed = N.clearOld(inbox, clockFor(TODAY), 30);
    assert.equal(removed, 1);
    assert.equal(inbox.items.length, 1);
    assert.equal(N.addItem(inbox, "level", "velha", "t", "b", clockFor(TODAY)), false);
  });
  test("aviso do aparelho exige permissão, categoria ligada e respeita o limite diário", () => {
    const inbox = N.emptyInbox(), c = clockFor(TODAY);
    const it = { key: "k1", cat: "training" };
    assert.equal(N.shouldDeliver(inbox, it, "granted", c), false);   /* aviso do aparelho desligado */
    inbox.prefs.deviceOn = true;
    assert.equal(N.shouldDeliver(inbox, it, "default", c), false);   /* sem permissão */
    assert.equal(N.shouldDeliver(inbox, it, "granted", c), true);
    inbox.prefs.cats.training = false;
    assert.equal(N.shouldDeliver(inbox, it, "granted", c), false);   /* categoria desligada */
    inbox.prefs.cats.training = true;
    for (let i = 0; i < N.MAX_DEVICE_PER_DAY; i++) N.markDelivered(inbox, { key: "x" + i, cat: "training" }, c);
    assert.equal(N.shouldDeliver(inbox, { key: "novo", cat: "training" }, "granted", c), false);  /* limite do dia */
  });
  test("cada item entregue ao aparelho não volta a ser entregue", () => {
    const inbox = N.emptyInbox(), c = clockFor(TODAY); inbox.prefs.deviceOn = true;
    const it = { key: "same", cat: "training" };
    N.markDelivered(inbox, it, c);
    assert.equal(N.shouldDeliver(inbox, it, "granted", c), false);
  });
});

describe("apresentação", () => {
  test("central mostra não lidas, preferências e nunca undefined/NaN", () => {
    const inbox = N.emptyInbox(), c = clockFor(TODAY);
    N.addItem(inbox, "level", "a", "Novo nível", "Você chegou ao nível 2.", c);
    const h = N.html(inbox, CF, TODAY, "default", {});
    assert.match(h, /nt-unread/);
    assert.match(h, /Preferências/);
    assert.match(h, /Ativar avisos no aparelho/);
    assert.doesNotMatch(h, /undefined|NaN/);
  });
  test("sem notificações mostra o estado vazio", () => {
    assert.match(N.html(N.emptyInbox(), CF, TODAY, "unsupported", {}), /Nada por aqui/);
  });
  test("navegador sem suporte não oferece botão de permissão", () => {
    const h = N.html(N.emptyInbox(), CF, TODAY, "unsupported", {});
    assert.doesNotMatch(h, /nt-perm/);
    assert.match(h, /não disponível neste navegador/);
  });
});
