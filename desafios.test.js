/* Testes das regras e da apresentação dos desafios. Rodar: node --test desafios.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const D = require("./desafios.js");

const ok = { title: "Semana forte", metric: "units", target: 5, duration: 7, handles: ["ana"] };

describe("validação (espelha as regras do servidor)", () => {
  test("formulário válido passa", () => { assert.equal(D.validate(ok).ok, true); });
  test("nome vazio ou longo é recusado", () => {
    assert.equal(D.validate({ ...ok, title: "   " }).ok, false);
    assert.equal(D.validate({ ...ok, title: "x".repeat(41) }).ok, false);
  });
  test("duração fora das opções é recusada", () => {
    assert.equal(D.validate({ ...ok, duration: 10 }).ok, false);
  });
  test("meta respeita os limites do objetivo", () => {
    assert.equal(D.validate({ ...ok, metric: "xp", target: 5 }).ok, false);        // mínimo 10
    assert.equal(D.validate({ ...ok, metric: "units", target: 501 }).ok, false);   // máximo 500
    assert.equal(D.validate({ ...ok, metric: "xp", target: 500 }).ok, true);
  });
  test("dias treinados não pode passar da duração", () => {
    assert.equal(D.validate({ ...ok, metric: "days", target: 10, duration: 7 }).ok, false);
    assert.equal(D.validate({ ...ok, metric: "days", target: 7, duration: 7 }).ok, true);
  });
  test("convites: de 1 a 5 amigos", () => {
    assert.equal(D.validate({ ...ok, handles: [] }).ok, false);
    assert.equal(D.validate({ ...ok, handles: ["a", "b", "c", "d", "e", "f"] }).ok, false);
  });
  test("objetivo inexistente é recusado", () => {
    assert.equal(D.validate({ ...ok, metric: "pontos" }).ok, false);
  });
});

describe("ranking", () => {
  test("ordena por progresso e marca líder", () => {
    const r = D.rank([
      { handle: "ana", name: "Ana", status: "accepted", progress: 30 },
      { handle: "bia", name: "Bia", status: "accepted", progress: 80 },
      { handle: "caio", name: "Caio", status: "invited" }          // sem progresso
    ]);
    assert.equal(r.length, 2);
    assert.equal(r[0].handle, "bia");
    assert.equal(r[0].leader, true);
    assert.equal(r[1].leader, false);
    assert.equal(r[0].position, 1);
  });
  test("empate no topo é sinalizado", () => {
    const r = D.rank([
      { handle: "a", status: "accepted", progress: 50 },
      { handle: "b", status: "accepted", progress: 50 }
    ]);
    assert.equal(r[0].tie, true);
    assert.equal(r[1].tie, true);
  });
  test("sem progresso algum, ninguém lidera", () => {
    const r = D.rank([{ handle: "a", status: "accepted", progress: 0 }, { handle: "b", status: "accepted", progress: 0 }]);
    assert.equal(r.some(x => x.leader), false);
  });
  test("convidado não aparece no ranking", () => {
    const r = D.rank([{ handle: "x", status: "invited" }]);
    assert.equal(r.length, 0);
  });
});

describe("tempo e progresso", () => {
  test("tempo restante em dias e horas", () => {
    assert.equal(D.timeLeft("2026-11-20T12:00:00Z", "2026-11-15T12:00:00Z"), "Faltam 5 dias e 0 h");
  });
  test("depois do fim mostra Encerrado", () => {
    assert.equal(D.timeLeft("2026-11-15T10:00:00Z", "2026-11-15T12:00:00Z"), "Encerrado");
  });
  test("percentual limitado entre 0 e 100", () => {
    assert.equal(D.pct(150, 100), 100);
    assert.equal(D.pct(0, 10), 0);
    assert.equal(D.pct(5, 10), 50);
  });
  test("quanto falta para o objetivo nunca é negativo", () => {
    assert.equal(D.remaining(7, 5), 0);
    assert.equal(D.remaining(2, 5), 3);
  });
});

describe("apresentação", () => {
  const data = {
    server_now: "2026-11-15T12:00:00Z",
    received: [{ id: "r1", title: "Convite", metric: "units", target: 5, ends_at: "2026-11-20T12:00:00Z", creator_name: "Ana", members: [] }],
    sent: [],
    active: [{
      id: "a1", title: "Forte", metric: "xp", target: 100, ends_at: "2026-11-20T12:00:00Z", is_creator: true,
      members: [
        { handle: "ana", name: "Ana", status: "accepted", progress: 60, me: true },
        { handle: "bia", name: "Bia", status: "accepted", progress: 90 },
        { handle: "caio", name: "Caio", status: "invited" }
      ]
    }],
    finished: []
  };
  test("abas e contagem aparecem", () => {
    const h = D.html(data, "active", {});
    ["Recebidos", "Enviados", "Ativos", "Concluídos"].forEach(t => assert.match(h, new RegExp(t)));
    assert.match(h, /Ativos \(1\)/);
  });
  test("líder, sua posição e quem falta responder aparecem", () => {
    const h = D.html(data, "active", {});
    assert.match(h, /👑 Bia/);
    assert.match(h, /\(você\)/);
    assert.match(h, /Aguardando resposta: Caio/);
    assert.match(h, /Você: 60 de 100/);
  });
  test("convite recebido mostra aceitar e recusar", () => {
    const h = D.html(data, "received", {});
    assert.match(h, /data-dg-act="accept"/);
    assert.match(h, /data-dg-act="decline"/);
    assert.match(h, /Convidado por <b>Ana<\/b>/);
  });
  test("lista vazia mostra mensagem, não cartão", () => {
    const h = D.html(data, "finished", {});
    assert.match(h, /Nada aqui ainda/);
  });
  test("nunca gera undefined ou NaN", () => {
    for (const t of ["received", "sent", "active", "finished"]) {
      assert.doesNotMatch(D.html(data, t, {}), /undefined|NaN/);
    }
  });
});

describe("janela, privacidade e resultado final", () => {
  const base = { id: "c1", title: "Forte", metric: "units", target: 5,
    starts_at: "2026-11-10T12:00:00Z", ends_at: "2026-11-17T12:00:00Z", creator_name: "Ana" };
  test("toda aba mostra início e término", () => {
    const data = { server_now: "2026-11-12T12:00:00Z", active: [{ ...base, members: [] }], received: [], sent: [], finished: [] };
    assert.match(D.html(data, "active", {}), /Início .* · Término /);
  });
  test("convite de desafio já iniciado avisa que o tempo é menor", () => {
    const data = { server_now: "2026-11-12T12:00:00Z", received: [{ ...base, members: [] }], sent: [], active: [], finished: [] };
    assert.match(D.html(data, "received", {}), /entra depois do início/);
  });
  test("convite antes do início não traz o aviso de atraso", () => {
    const data = { server_now: "2026-11-09T12:00:00Z", received: [{ ...base, members: [] }], sent: [], active: [], finished: [] };
    assert.doesNotMatch(D.html(data, "received", {}), /entra depois do início/);
  });
  test("convite sempre mostra o aviso de privacidade", () => {
    const data = { server_now: "2026-11-09T12:00:00Z", received: [{ ...base, members: [] }], sent: [], active: [], finished: [] };
    assert.match(D.html(data, "received", {}), /visíveis para quem está no desafio/);
  });
  test("concluído mostra o vencedor do resultado final", () => {
    const members = [
      { handle: "ana", name: "Ana", status: "accepted", progress: 4, me: true },
      { handle: "bia", name: "Bia", status: "accepted", progress: 7 }
    ];
    const data = { server_now: "2026-11-20T12:00:00Z", finished: [{ ...base, members }], received: [], sent: [], active: [] };
    const h = D.html(data, "finished", {});
    assert.match(h, /Encerrado\./);
    assert.match(h, /Bia venceu com 7/);
  });
  test("concluído com empate informa os dois", () => {
    const members = [
      { handle: "ana", name: "Ana", status: "accepted", progress: 5 },
      { handle: "bia", name: "Bia", status: "accepted", progress: 5 }
    ];
    const data = { server_now: "2026-11-20T12:00:00Z", finished: [{ ...base, members }], received: [], sent: [], active: [] };
    assert.match(D.html(data, "finished", {}), /Empate entre/);
  });
  test("concluído sem progresso diz que ninguém registrou", () => {
    const members = [{ handle: "ana", name: "Ana", status: "accepted", progress: 0 }];
    const data = { server_now: "2026-11-20T12:00:00Z", finished: [{ ...base, members }], received: [], sent: [], active: [] };
    assert.match(D.html(data, "finished", {}), /Ninguém registrou progresso/);
  });
});
