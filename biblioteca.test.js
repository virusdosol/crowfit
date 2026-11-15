/* Biblioteca: toda categoria existe, todo exercício tem conteúdo e aparece em uma categoria. Rodar: node --test biblioteca.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const B = require("./biblioteca.js");
const TXT = require("./biblioteca-conteudo.js");
const LIB = require("./program.js").LIB;

describe("cobertura", () => {
  test("todo exercício da biblioteca tem conteúdo de execução", () => {
    const sem = Object.keys(LIB).filter((id) => !TXT[id]);
    assert.deepEqual(sem, []);
  });
  test("cada exercício aparece em exatamente uma categoria", () => {
    const seen = {};
    B.CATS.forEach((c) => c.ids.forEach((id) => { seen[id] = (seen[id] || 0) + 1; }));
    const dup = Object.keys(seen).filter((k) => seen[k] > 1);
    const falta = Object.keys(LIB).filter((id) => !seen[id]);
    const sobra = Object.keys(seen).filter((id) => !LIB[id]);
    assert.deepEqual({ dup, falta, sobra }, { dup: [], falta: [], sobra: [] });
  });
  test("cada conteúdo tem passos, respiração e erros", () => {
    Object.keys(TXT).forEach((id) => {
      const [p, r, e] = TXT[id];
      assert.ok(p && r && e, id);
      assert.ok(p.split(" | ").length >= 2, "passos: " + id);
      assert.ok(e.split(" | ").length >= 2, "erros: " + id);
    });
  });
});

describe("páginas", () => {
  test("lista de categorias tem um card por categoria", () => {
    const out = B.html(LIB, TXT, { view: "cats" });
    assert.equal((out.match(/data-act="bib-cat"/g) || []).length, B.CATS.length);
  });
  test("categoria lista os exercícios", () => {
    const out = B.html(LIB, TXT, { view: "cat", cat: "peito" });
    assert.equal((out.match(/data-act="bib-ex"/g) || []).length, B.CATS.find((c) => c.id === "peito").ids.length);
  });
  test("exercício mostra passos, respiração e erros comuns escapados", () => {
    const out = B.html(LIB, TXT, { view: "ex", ex: "fl" });
    assert.match(out, /Passo a passo/);
    assert.match(out, /Respiração/);
    assert.match(out, /Erros comuns/);
    assert.doesNotMatch(out, /<script/);
  });
});
