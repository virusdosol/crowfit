/* Amigos: regras de ID e mensagens (funções puras). Rodar: node --test amigos.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("./amigos.js").CrowAmigos;

test("ID aceita 3 a 20 caracteres minúsculos, números e _", () => {
  assert.equal(A.validHandle("ana"), true);
  assert.equal(A.validHandle("treino_ana_01"), true);
  assert.equal(A.validHandle("a".repeat(20)), true);
});
test("ID recusa curto, longo, maiúsculas, espaços e símbolos", () => {
  assert.equal(A.validHandle("an"), false);
  assert.equal(A.validHandle("a".repeat(21)), false);
  assert.equal(A.validHandle("Ana"), false);
  assert.equal(A.validHandle("ana x"), false);
  assert.equal(A.validHandle("ana-1"), false);
  assert.equal(A.validHandle(null), false);
});
test("normalização tira espaços e põe em minúsculas", () => {
  assert.equal(A.normHandle("  Treino_Ana "), "treino_ana");
  assert.equal(A.normHandle(undefined), "");
});
test("erros do servidor viram mensagem clara", () => {
  assert.equal(A.msgFor({ message: "handle_taken" }), A.MSG.handle_taken);
  assert.equal(A.msgFor({ message: "user_not_found" }), A.MSG.user_not_found);
  assert.match(A.msgFor({ message: "erro desconhecido" }), /Tente de novo/);
});
