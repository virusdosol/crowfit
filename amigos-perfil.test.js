/* Fase 3: perfil social e classificação (funções puras). Rodar: node --test amigos-perfil.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("./amigos.js").CrowAmigos;

const base = {
  handle: "ana_treino", name: "Ana", level: 3, xp: 420,
  current_streak: 5, best_streak: 12, last_workout: "2026-11-13", since: "2026-10-01",
  achievements: [], trophies: [{ ex: "flexao", lv: 2, value: 40 }, { ex: "prancha", lv: 1, value: 30 }],
};

test("troféus: conta níveis desbloqueados e descarta exercícios sem nível", () => {
  const cat = [
    { id: "flexao", value: 130.9, levels: [{ unlocked: true }, { unlocked: true }, { unlocked: false }, { unlocked: false }] },
    { id: "prancha", value: 0, levels: [{ unlocked: false }, { unlocked: false }] },
  ];
  assert.deepEqual(A.buildTrophyItems(cat), [{ ex: "flexao", lv: 2, value: 130 }]);
});

test("troféus: envia no formato de set_my_trophies (ex, lv 1-4, value inteiro)", () => {
  const items = A.buildTrophyItems([{ id: "x", value: -5, levels: [{ unlocked: true }] }]);
  assert.equal(items.length, 1);
  assert.equal(typeof items[0].ex, "string");
  assert.equal(items[0].value, 0);
});

test("total de troféus soma os níveis, não conta exercícios", () => {
  assert.equal(A.totalTroféus(base), 3);
  assert.equal(A.totalTroféus({}), 0);
});

test("classificação por XP e por melhor ofensiva usa best_streak", () => {
  const rows = [
    { handle: "bia", xp: 100, best_streak: 30 },
    { handle: "ana", xp: 300, best_streak: 2 },
    { handle: "caio", xp: 100, best_streak: 30 },
  ];
  assert.deepEqual(A.ordenaRank(rows, "xp").map(r => r.handle), ["ana", "bia", "caio"]);
  assert.deepEqual(A.ordenaRank(rows, "streak").map(r => r.handle), ["bia", "caio", "ana"]);
  assert.equal(A.rankKey("streak"), "best_streak");
  assert.equal(A.rankValue({ best_streak: 7 }, "streak"), "7 dias");
  assert.equal(A.rankValue({ xp: 50 }, "xp"), "50 XP");
});

test("perfil de amigo: não mostra botão de editar e oferece remover amizade", () => {
  const h = A.perfilHtml(base, false);
  assert.match(h, /data-act="unfriend"/);
  assert.doesNotMatch(h, /Editar nome e ID/);
  assert.doesNotMatch(h, /<span class="am-tag">Você<\/span>/);
});

test("perfil próprio: mostra 'Você' e botão de editar, sem remover amizade", () => {
  const h = A.perfilHtml(base, true);
  assert.match(h, /Editar nome e ID/);
  assert.match(h, /am-tag/);
  assert.doesNotMatch(h, /data-act="unfriend"/);
});

test("perfil mostra nível, XP, troféus e as duas ofensivas com rótulos corretos", () => {
  const h = A.perfilHtml(base, false);
  assert.match(h, /<b>Nv 3<\/b>/);
  assert.match(h, /<b>420<\/b><span>XP total<\/span>/);
  assert.match(h, /<b>3<\/b><span>troféus<\/span>/);
  assert.match(h, /<b>5<\/b><span>ofensiva atual<\/span>/);
  assert.match(h, /<b>12<\/b><span>melhor ofensiva<\/span>/);
  assert.doesNotMatch(h, /\[object Object\]/);
});

test("nome e ID do jogador são escapados (sem HTML injetado)", () => {
  const h = A.perfilHtml({ ...base, name: "<img src=x onerror=alert(1)>", handle: "a\"b" }, false);
  assert.doesNotMatch(h, /<img src=x/);
  assert.match(h, /&lt;img/);
});

test("perfil não exibe campos sensíveis mesmo se o servidor enviar", () => {
  const h = A.perfilHtml({ ...base, email: "ana@exemplo.com", provider: "google" }, false);
  assert.doesNotMatch(h, /ana@exemplo\.com/);
  assert.doesNotMatch(h, /google/);
});
