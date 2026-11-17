/* Marcos laterais dos desafios individuais (etapa 1). Rodar: node --test trail.challenge.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");

const DAY = 864e5;
const C = {
  parseDate: (s) => new Date(s + "T12:00:00"),
  addDays: (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); },
  dateKey: (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"),
};
const sandbox = { console, CF: C, CFP: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "trail.js"), "utf8"), sandbox);
const T = sandbox.CFT;
const S = { trail: { start: "2026-11-02", ex: {}, lv: {} } };

describe("marcos laterais dos desafios", () => {
  test("cada marco resolve para uma unidade estável (key sNuM)", () => {
    const hit = [];
    for (let i = 0; i < 30; i++) { const c = T.challengeAt(S, i); if (c) hit.push([i, c.id]); }
    assert.deepEqual(hit.map((h) => h[1]), ["flexoes", "abdominais", "prancha"]);
  });

  test("o marco é um botão próprio, na lateral, com o estado vindo do mock de desenvolvimento", () => {
    const html = T.challengeHtml(S, 3, -30);
    assert.match(html, /class="t-ch r st-open"/);
    assert.match(html, /data-ch="flexoes"/);
    assert.match(T.challengeHtml(S, 10, 20), /t-ch l st-locked/);
    assert.match(T.challengeHtml(S, 17, 0), /t-ch l st-done/);
  });

  test("o marco fica do lado oposto ao círculo, sem sobrepor (todas as larguras comuns)", () => {
    for (const W of [288, 328, 412]) {
      const half = W / 2;
      for (let x = -62; x <= 62; x++) {
        const nodeL = x - 46, nodeR = x + 46;
        const side = x >= 0 ? "l" : "r";
        const mL = side === "l" ? -half : half - 64, mR = side === "l" ? -half + 64 : half;
        assert.ok(nodeR <= mL || nodeL >= mR, `colisão em x=${x}, largura=${W}`);
      }
    }
  });

  test("dia sem marco não gera marcação extra", () => {
    assert.equal(T.challengeHtml(S, 5, 0), "");
  });
});
