/* Ambiente de teste: carrega os módulos do app (scripts de navegador) em um contexto isolado
   e oferece um servidor simulado com as mesmas regras das RPCs (supabase-sync.sql e supabase-sync-v2.sql). */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = __dirname; /* repositório é plano: app e testes na mesma pasta */

function loadScript(file) {
  const ctx = { module: { exports: {} }, console, Date, Math, JSON, Object, Array, Number, String, Set, Map, Promise, setTimeout, clearTimeout, Error };
  ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx);
  return ctx.module.exports;
}
const CF = loadScript("core.js");
const CFP = loadScript("program.js");
const SYNC = loadScript("supabase-sync.js");

const UID = "user-a", TODAY = "2026-11-13";
const plain = (x) => JSON.parse(JSON.stringify(x));
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

/* Servidor simulado. Regras: progresso e trilha como no SQL; import de nozes não altera pontos. */
function makeServer(init) {
  return Object.assign({
    progress: { base_points: 0, points: 0, rewards: {}, done_dates: [], best_streak: 0, last_workout_date: null, plan_history: [], revision: 0 },
    trail: { start: null, levels: {}, ex: {} }, settings: null, nozes: {}, boxes: {}, sessions: 0,
  }, init || {});
}
function serverClient(db, hooks) {
  hooks = hooks || {};
  const calls = [];
  function rows(t) {
    if (t === "training_settings") return db.settings ? [{ exp: db.settings.exp, dias: db.settings.dias, adjust: db.settings.adjust, easy_streak: db.settings.easy_streak, settings_at: db.settings.at }] : [];
    if (t === "user_nozes") return Object.keys(db.nozes).map((k) => ({ week_start: k, xp: db.nozes[k] }));
    if (t === "user_boxes") return Object.keys(db.boxes).map((k) => Object.assign({ box_id: k }, db.boxes[k]));
    return [];
  }
  function builder(t) {
    const b = { select() { return b; }, eq() { return b; }, limit() { return b; }, order() { return b; }, range() { return b; },
      maybeSingle() { return Promise.resolve({ data: rows(t)[0] || null, error: null }); },
      then(res) { return Promise.resolve({ data: rows(t), error: null }).then(res); } };
    return b;
  }
  return {
    calls,
    from: builder,
    rpc: async function (name, args) {
      calls.push(name);
      if (hooks.beforeRpc) await hooks.beforeRpc(name, args);
      const p = args.p;
      if (name === "merge_my_progress") {
        const pr = db.progress;
        pr.base_points = Math.max(pr.base_points, p.base_points);
        pr.best_streak = Math.max(pr.best_streak, p.best_streak);
        if (p.last_workout_date && (!pr.last_workout_date || p.last_workout_date > pr.last_workout_date)) pr.last_workout_date = p.last_workout_date;
        pr.rewards = Object.assign({}, p.rewards, pr.rewards);
        pr.points = Math.min(10000000, pr.base_points + sum(pr.rewards));
        pr.done_dates = [...new Set([...pr.done_dates, ...p.done_dates])].sort();
        const pm = {}; pr.plan_history.forEach((x) => { pm[x.from] = x; }); p.plan_history.forEach((x) => { if (!pm[x.from]) pm[x.from] = x; });
        pr.plan_history = Object.keys(pm).sort().map((k) => pm[k]).slice(-200);
        return { data: [Object.assign({}, pr)], error: null };
      }
      if (name === "upsert_my_sessions") { db.sessions += p.length; return { data: p.length, error: null }; }
      if (name === "merge_my_trail") {
        const t = db.trail;
        if (!t.start && p.start) t.start = p.start;
        Object.keys(p.levels || {}).forEach((k) => { if (t.levels[k] === undefined) t.levels[k] = p.levels[k]; });
        p.exercises.forEach((e) => {
          const key = e.unit + "|" + e.ex, cur = t.ex[key];
          if (!cur || e.at > cur.at || (e.at === cur.at && cur.done && !e.done)) t.ex[key] = { done: e.done, at: e.at };
        });
        return { data: { start: t.start, levels: t.levels, exercises: Object.keys(t.ex).map((k) => { const [u, x] = k.split("|"); return { unit: u, ex: x, done: t.ex[k].done, at: t.ex[k].at }; }) }, error: null };
      }
      if (name === "merge_my_settings") {
        if (!db.settings || p.at > db.settings.at) db.settings = { exp: p.exp, dias: p.dias, adjust: p.adjust, easy_streak: p.easy_streak, at: p.at };
        const d = db.settings;
        return { data: { exp: d.exp, dias: d.dias, adjust: d.adjust, easy_streak: d.easy_streak, at: d.at }, error: null };
      }
      if (name === "merge_my_nozes") {
        p.forEach((r) => { if (db.nozes[r.week_start] === undefined) db.nozes[r.week_start] = r.xp; });
        return { data: Object.keys(db.nozes).sort().map((k) => ({ week_start: k, xp: db.nozes[k] })), error: null };
      }
      if (name === "grant_my_box") {
        const id = p.id, cur = db.boxes[id];
        if (cur) return { data: { id, xp: cur.xp, items: cur.items, granted: cur.granted, opened: cur.opened_at !== null, opened_at: cur.opened_at }, error: null };
        const L = CF.levelOf(db.progress.points), lo = 30 * L, hi = 90 * L;
        if (!Number.isInteger(p.xp) || p.xp < lo || p.xp > hi) return { data: null, error: { message: "invalid_xp" } };
        db.boxes[id] = { month: p.month, xp: p.xp, items: p.items.slice(), granted: p.granted, opened_at: null };
        return { data: { id, xp: p.xp, items: p.items, granted: p.granted, opened: false, opened_at: null }, error: null };
      }
      if (name === "open_my_box") {
        const cur = db.boxes[p.id];
        if (!cur) return { data: null, error: { message: "box_not_granted" } };
        if (cur.opened_at === null) { cur.opened_at = new Date().toISOString(); return { data: { id: p.id, already: false, opened_at: cur.opened_at }, error: null }; }
        return { data: { id: p.id, already: true, opened_at: cur.opened_at }, error: null };
      }
      if (name === "merge_my_items") return { data: { items: [], equipped: null }, error: null }; /* formato real: { items, equipped } (supabase-items.sql) */
      return { data: null, error: { message: "function " + name + " does not exist" } };
    },
  };
}

/* Um "aparelho": estado local S, armazenamento local (Map) e a instância de sincronização. */
function makeDevice(opts) {
  opts = opts || {};
  const store = opts.store || new Map();
  const LS = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const nav = { onLine: opts.online !== false };
  const host = { gen: opts.gen || 1, uid: opts.uid || UID, saves: 0, changes: 0 };
  const client = opts.client;
  const env = { CF, CFP, CFT: null, Auth: { getClient: () => client, getState: () => ({ user: { id: host.uid } }) }, LS: () => LS, nav: nav };
  const inst = SYNC.create(env);
  const S = opts.S;
  inst.attach({ state: () => ({ S: S, uid: host.uid, gen: host.gen }), save: () => { host.saves++; return true; }, today: () => TODAY,
    changed: () => { host.changes++; }, status: () => {} });
  return { S, store, nav, host, inst, run: (full) => inst._run(full), idle: () => inst._waitIdle() };
}
function freshState(over) {
  return Object.assign({ points: 0, best: 0, last: "", done: {}, rewards: {}, history: [], planHistory: [], adjust: 0, easyStreak: 0,
    profile: null, trail: { start: TODAY, ex: {}, lv: {} }, nozes: {} }, over || {});
}
function profile(over) { return Object.assign({ nome: "Ana", idade: 30, peso: 60, altura: 165, exp: "Treino às vezes", dias: 4 }, over || {}); }

module.exports = { plain, tick: () => new Promise((r) => setTimeout(r, 3)), CF, CFP, SYNC, UID, TODAY, makeServer, serverClient, makeDevice, freshState, profile, loadScript };
