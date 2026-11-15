/* Testes de select.js. Rodar: node --test select.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const S = require("./select.js");

const ev = (u, k, type) => ({ user_id: u, key: k, type, title: "t", body: "b", action: "amigos" });

describe("selectToSend", () => {
  test("envia só para quem tem inscrição", () => {
    const plan = S.selectToSend({ events: [ev("a", "1", "friend_req"), ev("b", "2", "friend_req")], sentKeys: new Set(), subUsers: new Set(["a"]), counts: new Map(), max: 3 });
    assert.deepEqual(plan.map((e) => e.user_id), ["a"]);
  });
  test("não envia categoria desligada pelo usuário", () => {
    const off = new Map([["a", new Set(["social"])]]);
    const plan = S.selectToSend({ events: [ev("a", "1", "friend_req")], sentKeys: new Set(), subUsers: new Set(["a"]), counts: new Map(), max: 3, offCats: off });
    assert.equal(plan.length, 0);
  });
  test("envia normalmente quando a categoria está ligada", () => {
    const plan = S.selectToSend({ events: [ev("a", "1", "challenge_inv")], sentKeys: new Set(), subUsers: new Set(["a"]), counts: new Map(), max: 3, offCats: new Map() });
    assert.equal(plan.length, 1);
  });
  test("não repete evento já enviado", () => {
    const plan = S.selectToSend({ events: [ev("a", "1", "friend_ok")], sentKeys: new Set(["a|1"]), subUsers: new Set(["a"]), counts: new Map(), max: 3 });
    assert.equal(plan.length, 0);
  });
  test("respeita o limite diário", () => {
    const events = [ev("a", "1", "friend_req"), ev("a", "2", "friend_req")];
    const plan = S.selectToSend({ events, sentKeys: new Set(), subUsers: new Set(["a"]), counts: new Map([["a", 2]]), max: 3 });
    assert.equal(plan.length, 1);
  });
  test("evento duplicado no mesmo lote é enviado uma vez", () => {
    const events = [ev("a", "1", "friend_req"), ev("a", "1", "friend_req")];
    const plan = S.selectToSend({ events, sentKeys: new Set(), subUsers: new Set(["a"]), counts: new Map(), max: 3 });
    assert.equal(plan.length, 1);
  });
});

describe("pushPayload", () => {
  test("monta título, texto, tag e ação", () => {
    const p = JSON.parse(S.pushPayload({ title: "Oi", body: "Tudo bem", type: "friend_req", action: "amigos" }));
    assert.deepEqual(p, { title: "Oi", body: "Tudo bem", tag: "crowfit-friend_req", action: "amigos" });
  });
  test("usa 'home' quando não há ação", () => {
    assert.equal(JSON.parse(S.pushPayload({ type: "x" })).action, "home");
  });
});
