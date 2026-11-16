/* Crowfit: central de notificações (núcleo puro).
   Princípios:
   - Eventos são detectados comparando o estado atual com um "snapshot" guardado. Só o que mudou gera notificação.
   - Cada notificação tem uma chave estável (key). Chave já vista nunca volta a ser gerada.
   - Nada disso altera treino, XP, histórico ou sincronização: a central só lê o estado.
   - Notificações do aparelho só são entregues com o app aberto (primeiro plano) e com permissão explícita.
   Uso: NOTIF.scanLocal(inbox, S, clock, deps) ; NOTIF.scanSocial(inbox, soc, challenges, clock) ; NOTIF.html(...)  */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.NOTIF = f(); })(typeof self !== "undefined" ? self : this, function () {
"use strict";

var CAT_OF = {
  reminder: "training", goal: "training", level: "training", achievement: "training", trophy: "training",
  friend_req: "social", friend_ok: "social", challenge_inv: "social", challenge_res: "social",
  noz_available: "rewards", noz_opened: "rewards", reward: "rewards"
};
var ACTION_OF = {
  reminder: "trilha", goal: "painel", level: "painel", achievement: "perfil", trophy: "perfil",
  friend_req: "amigos", friend_ok: "amigos", challenge_inv: "desafios", challenge_res: "desafios",
  noz_available: "ofensivas", noz_opened: "ofensivas", reward: "ofensivas"
};
var ICON_X = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
var TYPE_ICON = {
  reminder: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="7"/><path d="M12 9v4l2.5 2M9 3h6"/></svg>',
  friend_req: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M17 8v6M14 11h6"/></svg>',
  friend_ok: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M15 11l2 2 4-4"/></svg>',
  challenge_inv: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8"/></svg>',
  challenge_res: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0V4zM12 13v4M8 20h8"/></svg>'
};
var CAT_LABEL = { training: "Treino", social: "Amigos", rewards: "Recompensas" };
var TYPE_LABEL = {
  reminder: "Lembrete", goal: "Meta", level: "Nível", achievement: "Conquista", trophy: "Troféu",
  friend_req: "Amizade", friend_ok: "Amizade", challenge_inv: "Desafio", challenge_res: "Desafio",
  noz_available: "Noz", noz_opened: "Noz", reward: "Recompensa"
};
var MAX_DEVICE_PER_DAY = 3;   /* não incomodar: no máximo 3 avisos do aparelho por dia */
var KEEP_DAYS = 30;           /* notificações mais antigas são removidas da central */

function defaultPrefs() {
  return { cats: { training: true, social: true, rewards: true },
           reminder: { on: false, time: "19:00", days: [1, 2, 3, 4, 5] },
           deviceOn: false };
}
function emptyInbox() {
  return { v: 1, items: [], seen: {}, snap: null, social: null, prefs: defaultPrefs(), delivered: {} };
}

/* ---------- utilidades ---------- */
function addItem(inbox, type, key, title, body, clock, extra) {
  if (inbox.seen[key]) return false;
  inbox.seen[key] = clock.iso;
  inbox.items.push({ id: key, key: key, type: type, cat: CAT_OF[type], title: title, body: body || "",
    at: clock.iso, day: clock.today, read: false, action: ACTION_OF[type], extra: extra || null });
  inbox.items.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  return true;
}
function weekStart(CF, today) {
  var d = CF.parseDate(today), back = d.getDay();   /* domingo = início da semana */
  return CF.addDays(today, -back);
}

/* ---------- eventos locais (a partir do estado da trilha e das conquistas) ---------- */
/* Primeira execução só registra o estado de partida: não gera notificações antigas. */
function scanLocal(inbox, S, clock, deps) {
  var CF = deps.CF, n = 0;
  var lvl = CF.xpLevelInfo(S.points || 0).level;
  var ach = Object.keys(S.achievements || {});
  var trophies = (deps.trophies || 0);
  var nozOpened = Object.keys(S.nozes || {}).filter(function (k) { return typeof S.nozes[k] === "number"; });
  var rewards = Object.keys(S.rewards || {});
  var weekNozes = CF.nozWeeks ? CF.nozWeeks(S, clock.today) : [];
  var doneWeek = 0, ws = weekStart(CF, clock.today);
  for (var d = ws; d <= clock.today; d = CF.addDays(d, 1)) if (S.done && S.done[d] === true) doneWeek++;

  if (!inbox.snap) {
    inbox.snap = { level: lvl, ach: ach, trophies: trophies, nozOpened: nozOpened, rewards: rewards, goalWeek: null };
    return 0;
  }
  var snap = inbox.snap;

  if (lvl > snap.level) {
    n += addItem(inbox, "level", "level:" + lvl, "Novo nível: " + CF.xpLevelInfo(S.points || 0).title,
      "Você chegou ao nível " + lvl + ".", clock) ? 1 : 0;
  }
  ach.forEach(function (id) {
    if (snap.ach.indexOf(id) < 0) n += addItem(inbox, "achievement", "ach:" + id, "Conquista desbloqueada",
      (S.achievements[id] && S.achievements[id].reason) || id, clock) ? 1 : 0;
  });
  if (trophies > snap.trophies) {
    n += addItem(inbox, "trophy", "trophy:" + trophies, "Troféu obtido",
      "Você tem " + trophies + (trophies === 1 ? " troféu." : " troféus."), clock) ? 1 : 0;
  }
  /* Meta pessoal: atingir os dias por semana do perfil (uma vez por semana). */
  var goal = S.profile && S.profile.dias;
  if (goal && doneWeek >= goal) {
    n += addItem(inbox, "goal", "goal:" + ws, "Meta semanal concluída",
      "Você treinou " + doneWeek + " de " + goal + " dias planejados nesta semana.", clock) ? 1 : 0;
  }
  /* Nozes: disponível (semana ainda não aberta) e abertas. */
  var thisSat = CF.addDays(ws, 6);                 /* só a semana atual: nunca avisa noz de semana passada */
  if (weekNozes.indexOf(thisSat) >= 0 && typeof S.nozes[thisSat] !== "number") {
    n += addItem(inbox, "noz_available", "noz:" + thisSat,
      "Nova Noz Dourada disponível", "Abra sua noz desta semana na tela de ofensivas.", clock) ? 1 : 0;
  }
  nozOpened.forEach(function (sat) {
    if (snap.nozOpened.indexOf(sat) < 0) n += addItem(inbox, "noz_opened", "nozopen:" + sat,
      "Noz Dourada aberta", "Você abriu sua noz e recebeu XP.", clock) ? 1 : 0;
  });
  rewards.forEach(function (k) {
    if (snap.rewards.indexOf(k) < 0 && k.indexOf("box:") === 0) n += addItem(inbox, "reward", "reward:" + k,
      "Recompensa recebida", "Uma caixa rendeu XP.", clock) ? 1 : 0;
  });

  inbox.snap = { level: lvl, ach: ach, trophies: trophies, nozOpened: nozOpened, rewards: rewards, goalWeek: null };
  return n;
}

/* ---------- eventos sociais (vêm do servidor; só quando há rede) ---------- */
/* soc = get_my_social(); challenges = list_my_challenges(). Usa o último estado social guardado para detectar mudanças. */
function scanSocial(inbox, soc, challenges, clock) {
  var n = 0, first = !inbox.social;
  var prev = inbox.social || { incoming: [], outgoing: [], friends: [], invites: [], results: [] };
  var incoming = (soc.incoming || []).map(function (x) { return x.handle; });
  var outgoing = (soc.outgoing || []).map(function (x) { return x.handle; });
  var friends = (soc.friends || []).map(function (x) { return x.handle; });

  (soc.incoming || []).forEach(function (x) {
    if (prev.incoming.indexOf(x.handle) < 0) n += addItem(inbox, "friend_req", "freq:" + x.handle,
      "Novo pedido de amizade", (x.name || x.handle) + " quer ser seu amigo.", clock) ? 1 : 0;
  });
  prev.outgoing.forEach(function (h) {
    if (friends.indexOf(h) >= 0 && outgoing.indexOf(h) < 0) n += addItem(inbox, "friend_ok", "fok:" + h,
      "Pedido de amizade aceito", "@" + h + " aceitou seu pedido.", clock) ? 1 : 0;
  });

  var inv = [], res = [];
  if (challenges) {
    (challenges.received || []).forEach(function (c) {
      inv.push(c.id);
      n += addItem(inbox, "challenge_inv", "cinv:" + c.id, "Convite para desafio",
        "Você foi convidado para \u201C" + c.title + "\u201D.", clock) ? 1 : 0;
    });
    (challenges.finished || []).forEach(function (c) {
      res.push(c.id);
      if (first) { inbox.seen["cres:" + c.id] = clock.iso; return; }   /* já terminados antes: não avisa */
      n += addItem(inbox, "challenge_res", "cres:" + c.id, "Resultado de desafio",
        "O desafio \u201C" + c.title + "\u201D terminou. Veja o resultado.", clock) ? 1 : 0;
    });
  }
  inbox.social = { incoming: incoming, outgoing: outgoing, friends: friends, invites: inv, results: res };
  return n;
}

/* ---------- lembrete de treino (escolhido pela pessoa: horário e dias) ---------- */
function reminderDue(inbox, S, clock) {
  var r = inbox.prefs.reminder;
  if (!r.on || !inbox.prefs.cats.training) return false;
  if (r.days.indexOf(clock.weekday) < 0) return false;
  var parts = String(r.time || "19:00").split(":"), at = (+parts[0]) * 60 + (+parts[1]);
  if (!(clock.minutes >= at)) return false;
  if (S.done && S.done[clock.today] === true) return false;   /* já treinou hoje: não lembra */
  return true;
}
function addReminder(inbox, clock) {
  return addItem(inbox, "reminder", "reminder:" + clock.today, "Hora de treinar",
    "Sua trilha de hoje está esperando por você.", clock);
}

/* ---------- limpeza: remove da central o que é antigo; não toca no histórico de treino ---------- */
function clearOld(inbox, clock, days) {
  var limit = days || KEEP_DAYS, before = inbox.items.length;
  var cutoff = new Date(clock.iso); cutoff.setDate(cutoff.getDate() - limit);
  inbox.items = inbox.items.filter(function (it) { return new Date(it.at) >= cutoff; });
  return before - inbox.items.length;
}
function markRead(inbox, id) { inbox.items.forEach(function (it) { if (it.id === id) it.read = true; }); }
function markAllRead(inbox) { inbox.items.forEach(function (it) { it.read = true; }); }
function unread(inbox) { return inbox.items.filter(function (it) { return !it.read; }).length; }

/* ---------- aviso do aparelho: só com permissão, categoria ligada, sem repetição e com limite diário ---------- */
function shouldDeliver(inbox, item, perm, clock) {
  if (perm !== "granted" || !inbox.prefs.deviceOn) return false;
  if (inbox.prefs.cats[item.cat] === false) return false;
  if (inbox.delivered[item.key]) return false;
  var today = inbox.delivered["_day:" + clock.today] || 0;
  return today < MAX_DEVICE_PER_DAY;
}
function markDelivered(inbox, item, clock) {
  inbox.delivered[item.key] = clock.iso;
  inbox.delivered["_day:" + clock.today] = (inbox.delivered["_day:" + clock.today] || 0) + 1;
  Object.keys(inbox.delivered).forEach(function (k) {                  /* limpa contadores de dias antigos */
    if (k.indexOf("_day:") === 0 && k !== "_day:" + clock.today) delete inbox.delivered[k];
  });
}

/* ---------- apresentação (HTML puro) ---------- */
function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function groupByDay(items, CF, today) {
  var groups = [], map = {};
  items.forEach(function (it) {
    var d = (it.at || "").slice(0, 10);
    var label = d === today ? "Hoje" : d === CF.addDays(today, -1) ? "Ontem" : d;
    if (!map[label]) { map[label] = { label: label, items: [] }; groups.push(map[label]); }
    map[label].items.push(it);
  });
  return groups;
}
var DAYS_LBL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function html(inbox, CF, today, perm, opts) {
  opts = opts || {};
  var h = '<div class="nt-wrap"><div class="nt-top"><button type="button" class="cw-back-ico" id="nt-bk" aria-label="Voltar"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><h2>Notificações</h2></div>';
  if (opts.pending) h += '<p class="nt-note">Sem conexão: notificações sociais aparecem quando você voltar a ter sinal.</p>';
  h += '<div class="nt-bar" role="toolbar" aria-label="Ações">' +
       '<button type="button" class="nt-chip" id="nt-selall">Selecionar tudo</button>' +
       '<button type="button" class="nt-chip" id="nt-readsel">Marcar como lida</button>' +
       '<button type="button" class="nt-chip nt-trash" id="nt-delsel" aria-label="Excluir selecionados"><svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13\"/></svg> Excluir</button></div>';

  if (!inbox.items.length) h += '<div class="nt-empty"><p>Nada por aqui. Quando algo acontecer na sua trilha ou com seus amigos, aparece aqui.</p></div>';
  groupByDay(inbox.items, CF, today).forEach(function (g) {
    h += '<h3 class="nt-day">' + esc(g.label) + '</h3>';
    g.items.forEach(function (it) {
      var time = (it.at || "").slice(11, 16);
      var ico = TYPE_ICON[it.type] || TYPE_ICON.reminder;
      h += '<article class="nt-card' + (it.read ? '' : ' nt-unread') + '" data-nt="' + esc(it.id) + '">' +
        '<label class="nt-pick"><input type="checkbox" class="nt-sel" data-nt-sel="' + esc(it.id) + '" aria-label="Selecionar"><span></span></label>' +
        '<span class="nt-ico" aria-hidden="true">' + ico + '</span>' +
        '<div class="nt-body"><span class="nt-tag">' + esc(TYPE_LABEL[it.type] || "Aviso") + '</span><b>' + esc(it.title) + '</b><p>' + esc(it.body) + '</p>' +
        '<small>' + esc(time) + (it.read ? '' : ' · não lida') + '</small></div>' +
        '<button type="button" class="nt-x" data-nt-x="' + esc(it.id) + '" aria-label="Fechar aviso">' + ICON_X + '</button></article>';
    });
  });

  var p = inbox.prefs;
  
  return h + '</div>';
}

function removeItems(inbox, ids) { var set = {}; (ids || []).forEach(function (x) { set[x] = 1; }); inbox.items = inbox.items.filter(function (it) { return !set[it.id]; }); return inbox; }
return { removeItems: removeItems, defaultPrefs: defaultPrefs, emptyInbox: emptyInbox, addItem: addItem, scanLocal: scanLocal, scanSocial: scanSocial,
  reminderDue: reminderDue, addReminder: addReminder, clearOld: clearOld, markRead: markRead, markAllRead: markAllRead,
  unread: unread, shouldDeliver: shouldDeliver, markDelivered: markDelivered, groupByDay: groupByDay, html: html,
  CAT_LABEL: CAT_LABEL, TYPE_LABEL: TYPE_LABEL, MAX_DEVICE_PER_DAY: MAX_DEVICE_PER_DAY, KEEP_DAYS: KEEP_DAYS };
});
