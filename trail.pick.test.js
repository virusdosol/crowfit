/* Barra da trilha: escolha da unidade (sem "null" e sem regra forçada de hoje). Rodar: node --test trail.pick.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "trail.js"), "utf8"), sandbox);
const pick = sandbox.CFT.pickIndex;

const unit = (bottom, n) => ({ bottom, hasUnit: true, n });
const noz = (bottom) => ({ bottom, hasUnit: false });

describe("escolha da unidade na barra", () => {
  test("mostra o primeiro item abaixo da barra", () => {
    const items = [unit(100, 1), unit(300, 2), unit(500, 3)];
    assert.equal(pick(items, 200), 1);
  });
  test("a noz usa a unidade anterior (o sábado), nunca fica sem unidade", () => {
    const sat = unit(150, 7), nozItem = noz(260);
    assert.equal(pick([sat, nozItem, unit(400, 8)], 200), 0);
  });
  test("a barra acompanha a rolagem pela semana atual (não fica presa em hoje)", () => {
    const seg = unit(100, 1), ter = unit(300, 2), qua = unit(500, 3);
    assert.equal(pick([seg, ter, qua], 200), 1);
    assert.equal(pick([seg, ter, qua], 400), 2);
  });
  test("sem nenhuma unidade antes da noz, não escolhe nada", () => {
    assert.equal(pick([noz(300)], 200), -1);
  });
  test("nunca devolve um item sem unidade", () => {
    const items = [noz(100), noz(300)];
    assert.equal(pick(items, 200), -1);
  });
});
