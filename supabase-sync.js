/* Crowfit: sincronização do progresso com o Supabase (RPCs de supabase-sync.sql).
   Contrato: merge_my_progress, upsert_my_sessions, unlock_my_achievements (v1) e merge_my_trail,
   merge_my_settings, merge_my_nozes (v2, de supabase-sync-v2.sql). Leitura só por SELECT (RLS).
   Dados v2 (trilha, configurações, nozes) têm assinatura própria (v2sig) e falhas isoladas: nunca travam o progresso.
   - Usa o cliente já criado por auth.js (CrowfitAuth.getClient()). Nunca cria outro cliente e nunca usa chave administrativa.
   - Toda escrita remota passa pelas RPCs; o servidor usa auth.uid(), então nenhum UID é enviado.
   - O app abre e funciona sem rede: este módulo nunca bloqueia a interface e nunca apaga dado local.
   - Cada rodada guarda a conta (UID) e a "geração" do app; se a conta trocar no meio de uma resposta, nada é gravado.
   - Metadados de sincronização ficam em "corvofit-v2:sync:<UID>" (separados da partição "corvofit-v2:u:<UID>").
   - XP: base_points = S.points - soma das recompensas enviadas. Assim o total local é preservado exatamente
     e o servidor (points = base_points + soma(rewards)) não soma nada duas vezes. */
(function (root, factory) {
  var m = factory(root);
  if (typeof module === "object" && module.exports) module.exports = m; else root.CFSync = m.instance;
})(typeof self !== "undefined" ? self : this, function (root) {
"use strict";
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/, REW_KEY = /^[A-Za-z0-9:_.|-]+$/, ACH_RE = /^[a-z0-9_]{1,40}$/;
var META_NS = "corvofit-v2:sync:", MIN_DATE = "2020-01-01", DEBOUNCE = 4000, BATCH = 100, RETRY = [15000, 60000, 300000];
var FB = ["hard", "ok", "easy"], FINAL = ["completed", "interrupted", "abandoned"];

function isInt(v, lo, hi) { return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi; }
function hash(s) { /* cyrb53: só para detectar mudança, não é segurança */
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57, c;
  for (var i = 0; i < s.length; i++) { c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
function isoOk(v) { /* mesma janela de cf_ts: 2020-01-01 até agora + 2 dias */
  if (typeof v !== "string") return null; var t = Date.parse(v); if (!isFinite(t)) return null;
  if (t < Date.parse("2020-01-01T00:00:00Z") || t > Date.now() + 2 * 864e5) return null;
  return new Date(t).toISOString();
}

/* ---------- valor (em XP) de cada recompensa, a partir do identificador ---------- */
/* ex:<data>:<exercício> = 10 | sess:<data> = 20 | tr:s<k>u<n> = 10 x exercícios da unidade + 20 (derivado da trilha congelada). */
function trailAmount(E, S, k, n) {
  try {
    var tr = S.trail; if (!tr || !DATE_RE.test(tr.start) || !tr.lv || typeof tr.lv[k] !== "number" || !E.CFT || !E.CFP) return null;
    var date = E.CF.addDays(E.CFT.secStart(S, k), n - 1), dow = E.CF.parseDate(date).getDay();
    var c = E.CFP.build(k, n, dow, tr.lv[k]).exercises.length, a = 10 * c + 20;
    return c > 0 && a <= 1000 ? a : null;
  } catch (e) { return null; }
}
function amountFor(E, S, key, known) {
  var v = known && known[key]; if (isInt(v, 1, 1000)) return v; /* valor que o servidor já guarda prevalece */
  var m;
  if (/^ex:\d{4}-\d{2}-\d{2}:[A-Za-z0-9_|.-]+$/.test(key)) return 10;
  if (/^sess:\d{4}-\d{2}-\d{2}$/.test(key)) return 20;
  if ((m = /^tr:s(\d{1,3})u(\d{1,3})$/.exec(key))) return trailAmount(E, S, +m[1], +m[2]);
  return null;
}

/* ---------- payload de merge_my_progress ---------- */
function buildProgress(E, S, known, today) {
  var lim = E.CF.addDays(today, 1), rew = {}, sum = 0, skipped = 0;
  var done = Object.keys(S.done || {}).filter(function (d) { return DATE_RE.test(d) && d >= MIN_DATE && d <= lim; }).sort().slice(-20000);
  var plans = (S.planHistory || []).filter(function (p) { return p && DATE_RE.test(p.from) && p.from <= lim && isInt(p.dias, 3, 6); })
    .map(function (p) { return { from: p.from, dias: p.dias }; }).slice(-200);
  Object.keys(S.rewards || {}).forEach(function (k) {
    if (S.rewards[k] !== true) return;
    var a = (k.length <= 80 && REW_KEY.test(k)) ? amountFor(E, S, k, known) : null;
    if (a === null) { skipped++; return; } /* sem valor seguro: continua dentro de base_points, nunca é enviada */
    rew[k] = a; sum += a;
  });
  var base = S.points - sum;
  if (!isInt(S.points, 0, 1e7) || base < 0 || base > 1e7) return { error: "xp_inconsistent", message: "Os pontos locais não batem com as recompensas registradas. Nada foi enviado nem alterado.", skippedRewards: skipped };
  return { payload: { base_points: base, best_streak: Math.min(100000, Math.max(0, S.best | 0)),
    last_workout_date: (DATE_RE.test(S.last || "") && S.last >= MIN_DATE && S.last <= lim) ? S.last : null,
    done_dates: done, plan_history: plans, rewards: rew }, base: base, rewardsSum: sum, skippedRewards: skipped };
}

/* ---------- sessões ---------- */
function toRemoteSession(s, today, E) {
  if (!s || typeof s !== "object" || typeof s.id !== "string" || s.id.length < 1 || s.id.length > 64) return null;
  if (FINAL.indexOf(s.status) < 0 || "PLCF".indexOf(s.type) < 0 || String(s.type).length !== 1) return null;
  var lim = E.CF.addDays(today, 1);
  if (!DATE_RE.test(s.date) || s.date < MIN_DATE || s.date > lim) return null;
  if (!Array.isArray(s.exercises) || s.exercises.length > 40) return null;
  var ex = s.exercises.map(function (x) {
    var st = x.status === "running" || x.status === "paused" ? "in_progress" : x.status;
    return { exerciseId: x.exerciseId, name: x.name, kind: x.kind, target: x.target, optional: !!x.optional, rest: x.rest, status: st,
      setIdx: x.setIdx, restPending: false, points: isInt(x.points, 0, 1000) ? x.points : 0, timer: null,
      sets: (x.sets || []).map(function (t) { return { index: t.index, target: t.target, completedReps: t.completedReps, seconds: t.seconds, completed: !!t.completed }; }) };
  });
  if (JSON.stringify(ex).length > 58000) return null;
  return { id: s.id, date: s.date, type: s.type, status: s.status, extra: !!s.extra, plan: isInt(s.plan, 3, 6) ? s.plan : null,
    started_at: isoOk(s.startedAt), ended_at: isoOk(s.endedAt), duration: Math.min(86400, Math.max(0, Math.round(Number(s.duration) || 0))),
    points: isInt(s.points, 0, 100000) ? s.points : 0, feedback: FB.indexOf(s.feedback) >= 0 ? s.feedback : null, exercises: ex };
}
function pendingSessions(E, S, meta, today) {
  var items = [], skipped = 0;
  (S.history || []).forEach(function (s) {
    if (!s || typeof s.id !== "string") return;
    var st = meta.sess[s.id];
    if (st === 1 || (st === 0 && !s.feedback)) return; /* já está no servidor (e o feedback, se existe, já foi) */
    var p = toRemoteSession(s, today, E); if (!p) { skipped++; return; }
    items.push({ id: s.id, p: p, fb: !!p.feedback });
  });
  return { items: items, skipped: skipped };
}
function fromRemoteSession(r) {
  if (!r || typeof r.session_id !== "string") return null;
  var ex = Array.isArray(r.exercises) ? r.exercises : [];
  return { id: r.session_id, date: String(r.session_date || "").slice(0, 10), startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
    completedAt: r.status === "completed" && r.ended_at ? new Date(r.ended_at).toISOString() : null, endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
    type: r.type, status: r.status, extra: !!r.extra, plan: r.plan == null ? null : r.plan, points: r.points, duration: r.duration_seconds,
    feedback: FB.indexOf(r.feedback) >= 0 ? r.feedback : null, exIdx: ex.length, exercises: ex };
}

/* ---------- adoção do resultado (aditiva: nunca remove nada local) ---------- */
function adoptProgress(E, S, row, points0, meta, today) {
  var ch = false, before = S.points + "|" + Object.keys(S.rewards).length + "|" + Object.keys(S.done).length + "|" + S.planHistory.length + "|" + S.best + "|" + S.last;
  var rw = row.rewards && typeof row.rewards === "object" ? row.rewards : {};
  Object.keys(rw).forEach(function (k) {
    if (k.length > 80 || !REW_KEY.test(k) || !isInt(rw[k], 1, 1000)) return;
    meta.amounts[k] = rw[k]; if (S.rewards[k] !== true) S.rewards[k] = true;
  });
  (Array.isArray(row.done_dates) ? row.done_dates : []).forEach(function (d) { if (DATE_RE.test(d)) S.done[d] = true; });
  var map = {}; S.planHistory.forEach(function (p) { map[p.from] = p; });
  (Array.isArray(row.plan_history) ? row.plan_history : []).forEach(function (p) { if (p && DATE_RE.test(p.from) && isInt(p.dias, 3, 6) && !map[p.from]) map[p.from] = { from: p.from, dias: p.dias }; });
  S.planHistory = Object.keys(map).sort().map(function (k) { return map[k]; }).slice(-200);
  if (isInt(row.best_streak, 0, 100000) && row.best_streak > S.best) S.best = row.best_streak;
  if (typeof row.last_workout_date === "string" && DATE_RE.test(row.last_workout_date) && (!S.last || row.last_workout_date > S.last)) S.last = row.last_workout_date;
  /* pontos: nunca abaixo do que já havia; ganhos locais ocorridos durante a chamada (delta) são mantidos. */
  var delta = S.points - points0, rp = isInt(row.points, 0, 1e7) ? row.points : points0;
  S.points = Math.min(1e7, Math.max(rp, points0) + delta);
  E.CF.refreshStreak(S, today);
  return before !== (S.points + "|" + Object.keys(S.rewards).length + "|" + Object.keys(S.done).length + "|" + S.planHistory.length + "|" + S.best + "|" + S.last);
}
function adoptSessions(E, S, remote, meta) {
  var ch = false, have = {};
  S.history.forEach(function (s) { have[s.id] = s; });
  remote.forEach(function (r) {
    var loc = have[r.session_id];
    if (loc) {
      if (!loc.feedback && FB.indexOf(r.feedback) >= 0) { loc.feedback = r.feedback; ch = true; }
      meta.sess[loc.id] = r.feedback ? 1 : 0; return;
    }
    var c = fromRemoteSession(r); if (!c) return;
    var v = E.CF.validateState({ version: 2, history: [c] });
    if (!v.ok || !v.state.history.length) return;
    S.history.push(v.state.history[0]); have[c.id] = v.state.history[0]; meta.sess[c.id] = c.feedback ? 1 : 0; ch = true;
  });
  if (ch) {
    S.history.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.startedAt) < String(b.startedAt) ? -1 : String(a.startedAt) > String(b.startedAt) ? 1 : 0; });
    if (S.history.length > 1000) S.history = S.history.slice(-1000);
  }
  return ch;
}

/* ---------- v2: trilha, configurações e nozes ---------- */
var TRAIL_UNIT = /^s\d{1,3}u\d{1,3}$/, EX_ID = /^[a-z0-9_]{1,24}$/, EPOCH = "2020-01-01T00:00:00.000Z", MISSING_RE = /could not find the function|does not exist|PGRST202|42883/i;
var V2_SIG_KEY = "v2";

/* Trilha: início, níveis e diferenças de exercícios desde o último envio bem-sucedido.
   meta.exState[unidade|exercício] = { d: marcado?, at: última mudança conhecida (ISO) }. */
function buildTrail(E, S, meta, now) {
  var tr = S.trail || {}, lim = E.CF.addDays(now.slice(0, 10), 1);
  var start = DATE_RE.test(tr.start || "") && tr.start >= MIN_DATE && tr.start <= lim ? tr.start : null;
  var lv = {}; Object.keys(tr.lv || {}).forEach(function (k) { if (/^\d{1,3}$/.test(k) && isInt(tr.lv[k], 0, 2)) lv[k] = tr.lv[k]; });
  var items = [], seen = {}, ex = meta.exState;
  Object.keys(tr.ex || {}).forEach(function (u) {
    if (!TRAIL_UNIT.test(u) || !tr.ex[u] || typeof tr.ex[u] !== "object") return;
    Object.keys(tr.ex[u]).forEach(function (id) {
      if (!EX_ID.test(id) || tr.ex[u][id] !== true) return;
      var key = u + "|" + id; seen[key] = 1;
      if (!ex[key] || ex[key].d !== true) items.push({ unit: u, ex: id, done: true, at: now, key: key });
    });
  });
  Object.keys(ex).forEach(function (key) {
    if (ex[key] && ex[key].d === true && !seen[key]) { var c = key.split("|"); items.push({ unit: c[0], ex: c[1], done: false, at: now, key: key }); }
  });
  var sendNow = items.slice(0, 500), rest = items.length - sendNow.length;
  var st = JSON.stringify({ start: start, lv: lv, ex: tr.ex || {} });
  return { start: start, levels: lv, items: sendNow, rest: rest, sig: hash(st),
    payload: { start: start, levels: lv, exercises: sendNow.map(function (x) { return { unit: x.unit, ex: x.ex, done: x.done, at: x.at }; }) } };
}
function adoptTrail(E, S, meta, res) {
  var ch = false, tr = S.trail; if (!tr || typeof tr !== "object") return false;
  if (!tr.start && res && DATE_RE.test(res.start || "")) { tr.start = res.start; ch = true; }
  if (res && res.levels && typeof res.levels === "object") Object.keys(res.levels).forEach(function (k) {
    if (/^\d{1,3}$/.test(k) && isInt(res.levels[k], 0, 2) && tr.lv[k] === undefined) { tr.lv[k] = res.levels[k]; ch = true; }
  });
  ((res && Array.isArray(res.exercises)) ? res.exercises : []).forEach(function (r) {
    if (!r || !TRAIL_UNIT.test(r.unit) || !EX_ID.test(r.ex) || typeof r.done !== "boolean" || typeof r.at !== "string") return;
    var key = r.unit + "|" + r.ex, loc = meta.exState[key];
    if (loc && loc.at >= r.at) return;            /* o local já é igual ou mais recente */
    meta.exState[key] = { d: r.done, at: r.at };
    if (r.done) { tr.ex[r.unit] = tr.ex[r.unit] || {}; if (tr.ex[r.unit][r.ex] !== true) { tr.ex[r.unit][r.ex] = true; ch = true; } }
    else if (tr.ex[r.unit] && tr.ex[r.unit][r.ex]) { delete tr.ex[r.unit][r.ex]; if (!Object.keys(tr.ex[r.unit]).length) delete tr.ex[r.unit]; ch = true; }
  });
  return ch;
}

/* Configurações sincronizáveis: experiência, dias, ajuste e sequência de feedback fácil. Nunca idade, peso ou altura. */
function buildSettings(E, S, meta) {
  var p = S.profile; if (!p || E.CF.EXP.indexOf(p.exp) < 0 || !isInt(p.dias, 3, 6)) return null;
  var adj = isInt(S.adjust, -1, 1) ? S.adjust : 0, easy = isInt(S.easyStreak, 0, 10) ? S.easyStreak : 0;
  var sig = hash(JSON.stringify([p.exp, p.dias, adj, easy]));
  if (meta.setSig && meta.setSig !== sig) meta.setAt = new Date().toISOString();   /* mudança local: marca o momento */
  meta.setSig = sig;
  return { exp: p.exp, dias: p.dias, adjust: adj, easy_streak: easy, at: meta.setAt || EPOCH, sig: sig };
}
function adoptSettings(E, S, meta, res) {
  if (!res || typeof res.at !== "string" || res.at <= (meta.setAt || EPOCH)) return false;
  var p = S.profile; if (!p || E.CF.EXP.indexOf(res.exp) < 0 || !isInt(res.dias, 3, 6)) return false;
  var adj = isInt(res.adjust, -1, 1) ? res.adjust : 0, easy = isInt(res.easy_streak, 0, 10) ? res.easy_streak : 0;
  var ch = p.exp !== res.exp || p.dias !== res.dias || S.adjust !== adj || S.easyStreak !== easy;
  p.exp = res.exp; p.dias = res.dias; S.adjust = adj; S.easyStreak = easy;
  meta.setAt = res.at; meta.setSig = hash(JSON.stringify([p.exp, p.dias, adj, easy]));
  return ch;
}

/* Nozes abertas: semanas (sábados) com XP. Só registro: o XP já vai em base_points pelo progresso. */
function buildNozes(E, S) {
  var n = S.nozes || {};
  var list = Object.keys(n).filter(function (k) {
    return DATE_RE.test(k) && k >= MIN_DATE && isInt(n[k], 1, 1e7) && E.CF.parseDate(k).getDay() === 6;
  }).sort().slice(-200).map(function (k) { return { week_start: k, xp: n[k] }; });
  return { list: list, sig: hash(JSON.stringify(list)) };
}
function adoptNozes(S, res) {
  var ch = false; S.nozes = S.nozes || {};
  (Array.isArray(res) ? res : []).forEach(function (r) {
    if (r && DATE_RE.test(r.week_start) && isInt(r.xp, 1, 1e7) && !isInt(S.nozes[r.week_start], 1, 1e7)) { S.nozes[r.week_start] = r.xp; ch = true; }
  });
  return ch;
}

/* ---------- instância (rede, fila, offline) ---------- */
function create(envIn) {
  var host = null, deb = 0, retryT = 0, retryN = 0, running = null, again = false, againFull = false, adopting = false, mutCount = 0, cache = null, bound = false;
  var info = { state: "idle", message: "", pending: false, last: "", skippedSessions: 0 }, remoteAch = [];
  function env() {
    if (envIn) return envIn;
    return { CF: root.CF, CFP: root.CFP, CFT: root.CFT, Auth: root.CrowfitAuth, LS: function () { try { return root.localStorage; } catch (e) { return null; } }, nav: root.navigator };
  }
  function emit(state, message) {
    info.state = state; info.message = message || "";
    if (host && typeof host.status === "function") { try { host.status({ state: state, message: info.message, pending: info.pending }); } catch (e) {} }
  }
  /* metadados por conta (cache em memória; o armazenamento só é escrito quando algo muda) */
  function loadMeta(uid) {
    if (cache && cache.uid === uid) return cache.meta;
    var m = null, ls = env().LS();
    try { var raw = ls && ls.getItem(META_NS + uid); if (raw) m = JSON.parse(raw); } catch (e) { m = null; }
    if (!m || typeof m !== "object" || m.v !== 1) m = { v: 1 };
    m.sig = typeof m.sig === "string" ? m.sig : ""; m.blocked = typeof m.blocked === "string" ? m.blocked : ""; m.pending = !!m.pending; m.seeded = !!m.seeded; m.last = typeof m.last === "string" ? m.last : "";
    if (!m.amounts || typeof m.amounts !== "object") m.amounts = {}; if (!m.sess || typeof m.sess !== "object") m.sess = {};
    if (!m.exState || typeof m.exState !== "object") m.exState = {};
    m.setSig = typeof m.setSig === "string" ? m.setSig : ""; m.setAt = typeof m.setAt === "string" ? m.setAt : "";
    m.v2sig = typeof m.v2sig === "string" ? m.v2sig : ""; m.v2blocked = typeof m.v2blocked === "string" ? m.v2blocked : "";
    cache = { uid: uid, meta: m }; return m;
  }
  function saveMeta(uid, m) { try { var ls = env().LS(); if (ls) ls.setItem(META_NS + uid, JSON.stringify(m)); } catch (e) { /* sem espaço: a sincronização continua, só perde o cache */ } }
  function classify(e) {
    var msg = String(e && (e.message || e) || ""), E = env();
    if ((e && e.name === "TypeError") || /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(msg) || (E.nav && E.nav.onLine === false)) return { kind: "net" };
    if ((e && (e.status === 401 || e.status === 403)) || /not_authenticated|jwt|invalid refresh/i.test(msg)) return { kind: "auth" };
    if (/^(invalid_|too_many_)/.test(msg) || (e && e.code === "22023")) return { kind: "data", code: msg };
    return { kind: "other", code: msg };
  }
  function scheduleRetry() {
    if (retryT || !host) return;
    var d = RETRY[Math.min(retryN, RETRY.length - 1)]; retryN++;
    retryT = setTimeout(function () { retryT = 0; kick("retry", false); }, d);
  }

  async function fetchRemote(client, uid) {
    var p = await client.from("user_progress").select("*").eq("user_id", uid).maybeSingle(); if (p.error) throw p.error;
    var s = await client.from("workout_sessions").select("session_id,session_date,type,status,extra,plan,started_at,ended_at,duration_seconds,points,feedback,exercises")
      .eq("user_id", uid).order("session_date", { ascending: false }).range(0, 999); if (s.error) throw s.error;
    var a = await client.from("achievements_unlocked").select("achievement_id,unlocked_at").eq("user_id", uid).limit(500); if (a.error) throw a.error;
    return { progress: p.data || null, sessions: s.data || [], achievements: a.data || [] };
  }

  async function run(reason, full) {
    var h = host, E = env(); if (!h || !E.CF || !E.Auth) return;
    var c0 = h.state(); if (!c0) return;
    var uid = c0.uid, g = c0.gen, S0 = c0.S, meta = loadMeta(uid), today = h.today(), sg = "", key = "";
    function alive() { var c = h.state(); return !!c && c.gen === g && c.uid === uid && c.S === S0; }
    function sameUser() { var a = E.Auth.getState && E.Auth.getState(); return !!(a && a.user && a.user.id === uid); }
    var client = E.Auth.getClient && E.Auth.getClient();
    if (!client || !sameUser()) { meta.pending = true; info.pending = true; saveMeta(uid, meta); emit("offline", ""); return; }
    if (E.nav && E.nav.onLine === false) { meta.pending = true; info.pending = true; saveMeta(uid, meta); emit("offline", ""); return; }
    emit("syncing", "");
    try {
      var remote = null, first = full || !meta.seeded, b, ps;
      function plan() { b = buildProgress(E, S0, meta.amounts, today); ps = pendingSessions(E, S0, meta, today); info.skippedSessions = ps.skipped;
        if (b.error) return; sg = hash(JSON.stringify(b.payload)); key = sg + "|" + hash(ps.items.map(function (i) { return i.id + (i.fb ? "f" : ""); }).join(",")); }
      function v2plan() { var now = new Date().toISOString(), t = buildTrail(E, S0, meta, now), st = buildSettings(E, S0, meta), nz = buildNozes(E, S0);
        return { trail: t, settings: st, nozes: nz, sig: hash([t.sig, st ? st.sig : "-", nz.sig].join("|")) }; }
      var v2 = v2plan();
      plan();
      /* conteúdo que o servidor já recusou: não repete sozinho (só no login ou quando o conteúdo mudar) */
      if (!full && !b.error && meta.blocked && meta.blocked === key) { emit("error", "O servidor recusou estes dados antes. Eles continuam salvos neste aparelho."); return; }
      if (first) {
        remote = await fetchRemote(client, uid); if (!alive()) return;
        remoteAch = remote.achievements;
        if (remote.progress && remote.progress.rewards && typeof remote.progress.rewards === "object") {
          Object.keys(remote.progress.rewards).forEach(function (k) { if (isInt(remote.progress.rewards[k], 1, 1000)) meta.amounts[k] = remote.progress.rewards[k]; });
        }
        plan();
      }
      if (b.error) { meta.pending = true; info.pending = true; saveMeta(uid, meta); emit("error", b.message); return; }
      var need = first || sg !== meta.sig;
      var v2need = first || v2.sig !== meta.v2sig;
      var mut0 = mutCount, points0 = S0.points, row = null;
      if (need) {
        if (!sameUser()) return;
        var r = await client.rpc("merge_my_progress", { p: b.payload }); if (!alive()) return;
        if (r.error) throw r.error;
        row = Array.isArray(r.data) ? r.data[0] : r.data; if (!row || typeof row !== "object") throw new Error("resposta_invalida");
      }
      for (var i = 0; i < ps.items.length; i += BATCH) {
        var part = ps.items.slice(i, i + BATCH);
        if (!sameUser()) return;
        var r2 = await client.rpc("upsert_my_sessions", { p: part.map(function (x) { return x.p; }) }); if (!alive()) return;
        if (r2.error) throw r2.error;
        part.forEach(function (x) { meta.sess[x.id] = x.fb ? 1 : 0; }); saveMeta(uid, meta);
      }
      var v2ch = false, v2ok = false;
      if (v2need && v2.trail.payload && meta.v2blocked !== v2.sig) {
        try {
          var rt = await client.rpc("merge_my_trail", { p: v2.trail.payload }); if (!alive()) return;
          if (rt.error) throw rt.error;
          v2.trail.items.forEach(function (x) { meta.exState[x.key] = { d: x.done, at: x.at }; });
          if (v2.trail.rest) meta.v2sig = "";            /* ainda restam diferenças: a próxima rodada envia */
          var trRes = rt.data && typeof rt.data === "object" ? rt.data : null;
          if (trRes) v2ch = adoptTrail(E, S0, meta, trRes) || v2ch;
          if (v2.settings && !v2.settings.error) {
            var rs = await client.rpc("merge_my_settings", { p: { exp: v2.settings.exp, dias: v2.settings.dias, adjust: v2.settings.adjust, easy_streak: v2.settings.easy_streak, at: v2.settings.at } }); if (!alive()) return;
            if (rs.error) throw rs.error;
            v2ch = adoptSettings(E, S0, meta, rs.data) || v2ch;
          }
          if (v2.nozes.list.length) {
            var rn = await client.rpc("merge_my_nozes", { p: v2.nozes.list }); if (!alive()) return;
            if (rn.error) throw rn.error;
            v2ch = adoptNozes(S0, rn.data) || v2ch;
          }
          meta.v2blocked = ""; v2ok = true;
        } catch (e2) {
          var k2 = classify(e2);
          if (k2.kind === "net" || k2.kind === "auth") throw e2;   /* sem rede / sem sessão: mesma tratativa do progresso */
          if (MISSING_RE.test(String(e2 && (e2.message || e2)))) meta.v2sig = "";   /* migração v2 ainda não aplicada: tenta de novo depois, sem bloquear o resto */
          else meta.v2blocked = v2.sig;                                              /* recusa de dados: não repete sozinho */
        }
      }
      if (!alive()) return;
      adopting = true;
      try {
        var ch = false;
        if (row) ch = adoptProgress(E, S0, row, points0, meta, today) || ch;
        if (remote) ch = adoptSessions(E, S0, remote.sessions, meta) || ch;
        ch = ch || v2ch;
        if (ch && !h.save()) throw new Error("falha_ao_salvar_localmente");
        if (ch && typeof h.changed === "function") { try { h.changed(); } catch (e) {} }
      } finally { adopting = false; }
      var after = buildProgress(E, S0, meta.amounts, today);
      meta.sig = (mutCount === mut0 && !after.error) ? hash(JSON.stringify(after.payload)) : sg; /* se o usuário mexeu durante a chamada, a próxima rodada reenvia */
      var v2after = v2plan();
      if (v2ok) meta.v2sig = (mutCount === mut0 && !v2after.trail.rest) ? v2after.sig : "";  /* enviado com sucesso: assinatura v2 atualizada (se ainda há mudança, a próxima rodada envia) */
      if (first) meta.seeded = true;
      meta.pending = mutCount !== mut0; meta.blocked = ""; meta.last = new Date().toISOString(); info.pending = meta.pending; info.last = meta.last; retryN = 0;
      saveMeta(uid, meta); emit("ok", "");
    } catch (e) {
      var k = classify(e); meta.pending = true; info.pending = true;
      if (k.kind === "net") { saveMeta(uid, meta); emit("offline", ""); scheduleRetry(); }
      else if (k.kind === "auth") { saveMeta(uid, meta); emit("offline", ""); }
      else { if (k.kind === "data") meta.blocked = key; saveMeta(uid, meta);
        emit("error", k.kind === "data" ? "O servidor recusou parte dos dados (" + k.code + "). Seu progresso continua salvo neste aparelho." : "Não foi possível sincronizar agora. Seu progresso continua salvo neste aparelho.");
        if (k.kind === "other") scheduleRetry(); }
    }
  }

  function kick(reason, full) {
    if (!host) return;
    if (running) { again = true; againFull = againFull || !!full; return; }
    running = run(reason, !!full).catch(function (e) { try { console.warn("Crowfit sync:", e && e.message); } catch (x) {} }).then(function () {
      running = null; if (again) { var f = againFull; again = false; againFull = false; kick("again", f); }
    });
  }
  function notify(reason, immediate) {
    if (adopting || !host) return;
    mutCount++;
    var c = host.state(); if (c) { var m = loadMeta(c.uid); if (!m.pending) { m.pending = true; info.pending = true; saveMeta(c.uid, m); } }
    clearTimeout(deb); deb = 0;
    if (immediate) { kick(reason, reason === "login"); return; }
    deb = setTimeout(function () { deb = 0; kick(reason, false); }, DEBOUNCE);
  }
  function reset() { clearTimeout(deb); deb = 0; clearTimeout(retryT); retryT = 0; retryN = 0; again = false; againFull = false; cache = null; remoteAch = []; info.pending = false; }
  function attach(h) {
    host = h;
    if (bound || typeof root.addEventListener !== "function") return; bound = true;
    root.addEventListener("online", function () { kick("online", false); });
    if (root.document && root.document.addEventListener) root.document.addEventListener("visibilitychange", function () {
      if (root.document.visibilityState === "visible" && host) { var c = host.state(); if (c && loadMeta(c.uid).pending) kick("visible", false); }
    });
  }

  /* Conquistas: o app ainda não tem catálogo nem estado local de conquistas, então nada chama isto hoje.
     Fica pronto para quando existirem; só envia ids no formato aceito pelo servidor. */
  async function unlockAchievements(list) {
    var E = env(), c = host && host.state(); if (!c) return { ok: false, reason: "no_state" };
    var items = (Array.isArray(list) ? list : []).filter(function (a) { return a && ACH_RE.test(a.id); }).map(function (a) { var o = { id: a.id }, t = isoOk(a.at); if (t) o.at = t; return o; });
    var client = E.Auth.getClient && E.Auth.getClient(), a0 = E.Auth.getState && E.Auth.getState();
    if (!items.length || !client || !a0 || !a0.user || a0.user.id !== c.uid) return { ok: false, reason: "unavailable" };
    for (var i = 0; i < items.length; i += BATCH) {
      var cc = host.state(); if (!cc || cc.gen !== c.gen || cc.uid !== c.uid) return { ok: false, reason: "account_changed" };
      var r = await client.rpc("unlock_my_achievements", { p: items.slice(i, i + BATCH) }); if (r.error) return { ok: false, reason: classify(r.error).kind };
    }
    return { ok: true };
  }

  return { attach: attach, notify: notify, reset: reset, status: function () { return { state: info.state, message: info.message, pending: info.pending, last: info.last, skippedSessions: info.skippedSessions }; },
    achievements: function () { return remoteAch.slice(); }, unlockAchievements: unlockAchievements, _run: function (full) { return run("test", !!full); }, _waitIdle: function () { return running || Promise.resolve(); } };
}

var instance = typeof root.document !== "undefined" || typeof root.CF !== "undefined" ? create(null) : null;
return { instance: instance, create: create, buildProgress: buildProgress, amountFor: amountFor, toRemoteSession: toRemoteSession, pendingSessions: pendingSessions,
  adoptProgress: adoptProgress, adoptSessions: adoptSessions, fromRemoteSession: fromRemoteSession,
  buildTrail: buildTrail, adoptTrail: adoptTrail, buildSettings: buildSettings, adoptSettings: adoptSettings, buildNozes: buildNozes, adoptNozes: adoptNozes };
});
