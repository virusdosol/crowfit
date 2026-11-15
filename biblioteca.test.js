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

describe("história do Bóris", () => {
  const fs2 = require("fs");
  const B2 = require("./biblioteca.js");
  test("tem falas e cada imagem existe no projeto", () => {
    assert.ok(B2.STORY.length >= 4);
    B2.STORY.forEach((s) => {
      assert.ok(s.fala.length > 0);
      assert.ok(fs2.existsSync(s.img), s.img);
    });
  });
  test("tela da história tem botão de continuar e de pular", () => {
    const out = B2.storyHtml(0);
    assert.match(out, /data-act="bib-story-next"/);
    assert.match(out, /data-act="bib-story-skip"/);
  });
  test("cabeçalho da biblioteca mostra o Bóris", () => {
    assert.match(B2.html(LIB, TXT, { view: "cats" }), /boris-frente\.png/);
  });
});

describe("busca e filtros", () => {
  const { filterLib, norm, CATS } = require("./biblioteca.js");
  test("busca ignora maiúsculas e acentos", () => {
    assert.equal(norm("Agachamento Ápice"), "agachamento apice");
    const ids = filterLib(LIB, CATS, { q: "polichinelo" });
    assert.ok(ids.includes("po"));
  });
  test("filtro por tipo devolve só repetições ou só tempo", () => {
    const r = filterLib(LIB, CATS, { kind: "r" });
    const s = filterLib(LIB, CATS, { kind: "s" });
    assert.ok(r.length > 0 && s.length > 0);
    assert.ok(r.every((id) => LIB[id][1] === "r"));
    assert.ok(s.every((id) => LIB[id][1] === "s"));
  });
  test("favoritos filtram só os ids marcados", () => {
    assert.deepEqual(filterLib(LIB, CATS, { favs: ["po", "bu"] }).sort(), ["bu", "po"]);
  });
  test("busca sem resultado devolve lista vazia", () => {
    assert.deepEqual(filterLib(LIB, CATS, { q: "zzzzzz_inexistente" }), []);
  });
  test("não repete exercício nem devolve id inexistente", () => {
    const todos = filterLib(LIB, CATS, {});
    assert.equal(new Set(todos).size, todos.length);
    assert.ok(todos.every((id) => LIB[id]));
  });
});
