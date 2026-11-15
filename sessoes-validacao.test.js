/* Sessões livres: validação no servidor (supabase-xp-v8-sessoes.sql).
   Testes estruturais do SQL (não há PostgreSQL aqui: a execução real é feita no projeto de teste)
   + paridade do catálogo com program.js + referência JS do cálculo de sequência.
   Rodar: node --test sessoes-validacao.test.js */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const LIB = require("./program.js").LIB;
const SQL = fs.readFileSync(__dirname + "/supabase-xp-v8-sessoes.sql", "utf8");

/* Corpo de uma função no SQL (entre "as $$" e o "$$;" seguinte). */
function fnBody(name) {
  const i = SQL.indexOf("function public." + name);
  assert.ok(i >= 0, "função " + name + " existe");
  const a = SQL.indexOf("as $$", i) + 5, b = SQL.indexOf("$$;", a);
  return SQL.slice(a, b);
}

describe("catálogo de exercícios", () => {
  test("o servidor tem exatamente os exercícios do app (program.js)", () => {
    const seed = [...SQL.matchAll(/^\s*\('([a-z0-9_]+)'\)/gm)].map((m) => m[1]);
    assert.equal(new Set(seed).size, seed.length, "sem ids repetidos");
    assert.deepEqual(seed.slice().sort(), Object.keys(LIB).slice().sort());
  });
  test("todo id do catálogo cabe no formato aceito pela validação", () => {
    Object.keys(LIB).forEach((id) => assert.match(id, /^[a-z0-9_]{1,40}$/));
  });
});

describe("regras de XP em upsert_my_sessions", () => {
  const body = fnBody("upsert_my_sessions");
  test("exercício só paga se estiver no catálogo", () => {
    assert.match(body, /in \(select c\.id from public\.exercise_catalog c\)/);
  });
  test("XP só na primeira gravação da sessão", () => {
    assert.match(body, /select exists \(select 1 from public\.workout_sessions/);
    assert.match(body, /v_ok := \(not v_existed\)/);
  });
  test("concessão de XP fica dentro de if v_ok", () => {
    const ok = body.indexOf("if v_ok then"), grant = body.indexOf("cf_grant_xp(uid, 'set:'");
    assert.ok(ok > 0 && grant > ok, "cf_grant_xp só aparece depois de if v_ok");
  });
  test("janela de datas: 30 dias para trás, 1 dia para frente", () => {
    assert.match(body, /- 30;/);
    assert.match(body, /\+ 1;/);
    assert.match(body, /v_date between v_min and v_lim/);
  });
  test("duração máxima de 4 h e término no máximo 10 min no futuro", () => {
    assert.match(body, /v_dur <= 14400/);
    assert.match(body, /interval '10 minutes'/);
  });
  test("cada série concluída paga 5 XP, com chave própria por ordem", () => {
    assert.match(body, /'set:' \|\| to_char\(v_date, 'YYYY-MM-DD'\) \|\| ':' \|\| v_ex_id \|\| ':' \|\| s_el\.ord::text, 5/);
  });
  test("grupo de séries concluído paga 10 de bônus", () => {
    assert.match(body, /'grp:' \|\| to_char\(v_date, 'YYYY-MM-DD'\) \|\| ':' \|\| v_ex_id, 10/);
  });
  test("treino completo paga 50 XP", () => {
    assert.match(body, /'sess:' \|\| to_char\(v_date, 'YYYY-MM-DD'\), 50/);
  });
  test("exercício com mais de 20 séries não paga", () => {
    assert.match(body, /jsonb_array_length\(ex_el -> 'sets'\) between 1 and 20/);
  });
  test("exercício concluído exige série marcada como completed", () => {
    assert.match(body, /\(s_el\.value ->> 'completed'\) = 'true'/);
  });
  test("bônus de sessão só se houve exercício pago", () => {
    assert.match(body, /v_status = 'completed' and v_paid > 0/);
  });
  test("chamadas são serializadas por usuário", () => {
    assert.match(body, /perform public\.cf_lock_user\(uid\);/);
  });
  test("não existe caminho que aceite XP vindo do cliente", () => {
    assert.doesNotMatch(body, /el ->> 'xp'|el -> 'xp'|'points'.*cf_grant_xp/);
  });
});

describe("integridade de user_progress (trigger)", () => {
  const trig = fnBody("cf_guard_progress");
  test("trigger existe e roda em insert e update", () => {
    assert.match(SQL, /before insert or update on public\.user_progress/);
  });
  test("best_streak nunca diminui e nunca sobe além da sequência comprovada", () => {
    assert.match(trig, /NEW\.best_streak := greatest\(v_old_best, v_run\);/);
  });
  test("datas futuras além de amanhã são descartadas", () => {
    assert.match(trig, /where d <= v_lim/);
  });
  test("last_workout_date não passa da última data de treino", () => {
    assert.match(trig, /NEW\.last_workout_date > v_max/);
  });
});

/* Referência JS do algoritmo do trigger: maior sequência de dias consecutivos. */
function longestRun(dates) {
  const ds = [...new Set(dates)].sort();
  let best = 0, cur = 0, prev = null;
  for (const d of ds) {
    const t = Date.parse(d + "T00:00:00Z");
    cur = prev !== null && t - prev === 86400000 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = t;
  }
  return best;
}
describe("referência do cálculo de sequência", () => {
  test("sem datas: zero", () => assert.equal(longestRun([]), 0));
  test("dias seguidos contam; buracos quebram", () => {
    assert.equal(longestRun(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-05"]), 3);
  });
  test("datas repetidas não contam em dobro", () => {
    assert.equal(longestRun(["2026-11-01", "2026-11-01", "2026-11-02"]), 2);
  });
  test("virada de mês conta como consecutivo", () => {
    assert.equal(longestRun(["2026-10-31", "2026-11-01"]), 2);
  });
});
