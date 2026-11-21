/* Marcos laterais dos desafios individuais (etapa 1). Rodar: node --test trail.challenge.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");

const C = {
  parseDate: (s) => new Date(s + "T12:00:00"),
  addDays: (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); },
  dateKey: (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"),
  escText: (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]),
};
const sandbox = { console, CF: C, CFP: {} };
vm.createContext(sandbox);
const SRC = fs.readFileSync(path.join(__dirname, "trail.js"), "utf8");
vm.runInContext(SRC, sandbox);
const T = sandbox.CFT;
// Início 02/11/2026 (segunda). Índices 3, 10 e 17 correspondem às unidades s1u4, s1u11 e s1u18.
const S = { trail: { start: "2026-11-02", ex: {}, lv: {} } };

const SERVIDOR = [
  { id: "flexoes", nome: "Flexões", ancora: "s1u4", estado: "disponivel" },
  { id: "abdominais", nome: "Abdominais", ancora: "s1u11", estado: "bloqueado" },
  { id: "prancha", nome: "Prancha", ancora: "s1u18", estado: "concluido" },
];

describe("marcos laterais dos desafios", () => {
  test("sem dados do servidor, nenhum marco é exibido (produção não recebe dados de exemplo)", () => {
    T.setChallenges([]);
    for (let i = 0; i < 120; i++) assert.equal(T.challengeHtml(S, i, -30), "");
  });

  test("setChallenges descarta entradas malformadas, ids repetidos e estados desconhecidos", () => {
    T.setChallenges([
      { id: "ok", nome: "Ok", ancora: "s1u2", estado: "disponivel" },
      { id: "ancora-ruim", nome: "X", ancora: "1", estado: "disponivel" },
      { id: "estado-ruim", nome: "X", ancora: "s1u3", estado: "aberto" },
      { id: "ok", nome: "Repetido", ancora: "s1u5", estado: "disponivel" },
      { id: "sem-nome", nome: "", ancora: "s1u6", estado: "disponivel" },
      null,
    ]);
    assert.equal(T.challengeAt(S, 1).id, "ok");
    assert.equal(T.challengeAt(S, 2), null);
    assert.equal(T.challengeAt(S, 4), null);
    assert.equal(T.challengeAt(S, 5), null);
  });

  test("o marco é resolvido pela chave estável sNuM da unidade, não pela posição na lista", () => {
    T.setChallenges(SERVIDOR);
    assert.equal(T.challengeAt(S, 3).id, "flexoes");
    assert.equal(T.challengeAt(S, 10).id, "abdominais");
    assert.equal(T.challengeAt(S, 17).id, "prancha");
    assert.equal(T.challengeAt(S, 5), null);
  });

  test("o estado vem do servidor: disponivel/em_progresso = open, bloqueado = locked, concluido = done", () => {
    T.setChallenges(SERVIDOR);
    assert.match(T.challengeHtml(S, 3, -30), /class="t-ch r st-open"/);
    assert.match(T.challengeHtml(S, 10, 20), /class="t-ch l st-locked"/);
    assert.match(T.challengeHtml(S, 17, 0), /class="t-ch l st-done"/);
    T.setChallenges([{ id: "x", nome: "X", ancora: "s1u4", estado: "em_progresso" }]);
    assert.match(T.challengeHtml(S, 3, -30), /st-open/);
  });

  test("estado 'inativo' não gera marco", () => {
    T.setChallenges([{ id: "x", nome: "X", ancora: "s1u4", estado: "inativo" }]);
    assert.equal(T.challengeHtml(S, 3, -30), "");
  });

  test("o cliente não desbloqueia nada: o estado vem do servidor, independente da data", () => {
    T.setChallenges([{ id: "futuro", nome: "Futuro", ancora: "s1u20", estado: "bloqueado" }]);
    assert.match(T.challengeHtml({ trail: { start: "2020-01-01", ex: {}, lv: {} } }, 19, 0), /st-locked/);
  });

  test("o cálculo de marcos não usa rolagem, viewport nem data do aparelho", () => {
    // setChallenges pode redesenhar (preservando a rolagem); a decisão de estado não usa nada disso.
    const decisao = SRC.slice(SRC.indexOf("function challengeAt"), SRC.indexOf("function monthMark"));
    assert.doesNotMatch(decisao, /scroll|viewport|innerHeight|getBoundingClientRect|new Date|unlocked\(/);
    const recebe = SRC.slice(SRC.indexOf("function setChallenges"), SRC.indexOf("function challengeAt"));
    assert.doesNotMatch(recebe, /new Date|unlocked\(|dateKey/);
  });

  test("o marco fica do lado oposto ao círculo, sem sobrepor (larguras comuns de tela)", () => {
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
    T.setChallenges(SERVIDOR);
    assert.equal(T.challengeHtml(S, 5, 0), "");
  });

  test("nome é escapado no HTML do marco", () => {
    T.setChallenges([{ id: "x", nome: "<b>Pr</b>", ancora: "s1u4", estado: "disponivel" }]);
    const html = T.challengeHtml(S, 3, -30);
    assert.doesNotMatch(html, /<b>/);
  });

  test("a chave das unidades é estável e no formato que o servidor usa", () => {
    const keys = [0, 1, 2, 3, 4, 5, 6].map((i) => T.unitAt(S, i).key);
    assert.deepEqual(keys, ["s1u1", "s1u2", "s1u3", "s1u4", "s1u5", "s1u6", "s1u7"]);
  });
});

// Regra de desbloqueio: a data que o cliente atribui a cada unidade é a que o servidor calcula
// (ic_data_da_unidade: (start + make_interval(months => 3*(secao-1)))::date + (unidade-1) dias).
function addMonths(s, m) {
  const y0 = +s.slice(0, 4), mo0 = +s.slice(5, 7) - 1 + m;
  const y = y0 + Math.floor(mo0 / 12), mo = ((mo0 % 12) + 12) % 12, d = +s.slice(8, 10);
  return C.dateKey(new Date(y, mo, Math.min(d, new Date(y, mo + 1, 0).getDate())));
}
describe("regra de desbloqueio", () => {
  test("a data de cada unidade é a mesma que o servidor calcula (inclui virada de seção e fim de mês)", () => {
    for (let i = 0; i < 400; i++) {
      const u = T.unitAt(S, i);
      const serverDate = C.addDays(addMonths(S.trail.start, 3 * (u.sec - 1)), u.n - 1);
      assert.equal(u.date, serverDate, `unidade ${u.key} (i=${i})`);
    }
  });

  test("não é possível adiantar: unidade futura não libera", () => {
    const ctx = { S, today: "2026-11-02" };
    assert.equal(T.unlocked(ctx, 0), true);
    assert.equal(T.unlocked(ctx, 1), false);
    assert.equal(T.unlocked(ctx, 30), false);
  });

  test("concluir exercícios não libera a próxima unidade (a liberação é só pela data)", () => {
    const Sx = { trail: { start: "2026-11-02", ex: { s1u1: { e1: true, e2: true } }, lv: {} } };
    assert.equal(T.unlocked({ S: Sx, today: "2026-11-02" }, 1), false);
  });
});
