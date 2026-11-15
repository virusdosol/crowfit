/* Organização da página de troféus. Rodar: node --test trofeus-lista.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const L = require("./trofeus-lista.js");

const lv = (u) => [0, 1, 2, 3].map((i) => ({ id: ["bronze", "prata", "ouro", "diamante"][i], unlocked: i < u }));
const rows = [
  { id: "flexao", name: "Flexão de braço", value: 1200, levels: lv(1) },   // bronze
  { id: "prancha", name: "Prancha", value: 500, levels: lv(0) },            // em progresso
  { id: "marcha", name: "Marcha acelerada", value: 0, levels: lv(0) },      // nada
  { id: "ag", name: "Agachamento", value: 99999, levels: lv(4) }            // completo
];
const cats = [{ id: "peito", n: "Peito", ids: ["flexao", "prancha"] }, { id: "pernas", n: "Pernas", ids: ["ag", "marcha"] }];

describe("filtros", () => {
  test("todos devolve tudo", () => assert.equal(L.filterRows(rows, "all", "").length, 4));
  test("em progresso: começou e não completou", () => assert.deepEqual(L.filterRows(rows, "prog", "").map((r) => r.id), ["flexao", "prancha"]));
  test("desbloqueados: pelo menos 1 troféu", () => assert.deepEqual(L.filterRows(rows, "unl", "").map((r) => r.id), ["flexao", "ag"]));
  test("completos: os 4 níveis", () => assert.deepEqual(L.filterRows(rows, "done", "").map((r) => r.id), ["ag"]));
});
describe("busca", () => {
  test("ignora acento e caixa", () => assert.deepEqual(L.filterRows(rows, "all", "FLEXAO").map((r) => r.id), ["flexao"]));
  test("combina com filtro", () => assert.deepEqual(L.filterRows(rows, "done", "marcha").map((r) => r.id), []));
  test("busca vazia não filtra", () => assert.equal(L.filterRows(rows, "all", "   ").length, 4));
});
describe("categorias", () => {
  test("conta troféus conquistados e total (4 por exercício)", () => {
    const s = L.categorySummary(rows, cats);
    assert.deepEqual(s.map((c) => [c.won, c.total, c.exercises]), [[1, 8, 2], [4, 8, 2]]);
  });
  test("exercício fora das categorias não entra", () => assert.equal(L.catOf(cats, "nada"), null));
  test("acha a categoria do exercício", () => assert.equal(L.catOf(cats, "ag").id, "pernas"));
});
