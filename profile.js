/* Crowfit — perfil remoto do usuário (Supabase, tabela public.profiles).
   Expõe window.CrowfitProfile. Não lê nem escreve nenhuma chave de localStorage (o progresso "corvofit-v1" não é tocado).
   O perfil fica só em memória: é descartado no logout / troca de conta e nunca é guardado no aparelho.
   O app LÊ e ATUALIZA display_name. A criação normal é feita pelo banco (trigger). Se o perfil não existir,
   o app pede ao banco a recuperação via RPC ensure_my_profile(), que usa auth.uid() (nunca um id vindo daqui).
   Tudo passa por RLS. */
(function (global, doc) {
  'use strict';
  var Auth = global.CrowfitAuth;
  if (!Auth) return;

  var NAME_MIN = 2, NAME_MAX = 40, TIMEOUT_MS = 15000;
  var COLS = 'id, display_name, created_at, updated_at';
  var MSG = {
    network: 'Sem conexão com a internet. Seu treino continua funcionando; tente o perfil de novo quando a rede voltar.',
    unavailable: 'O servidor não respondeu agora. Tente novamente em instantes.',
    session: 'Sua sessão expirou. Entre novamente.',
    forbidden: 'Você não tem permissão para acessar este perfil.',
    internal: 'Algo deu errado no servidor. Tente novamente em instantes.',
    createFail: 'Não foi possível preparar o seu perfil agora. Tente novamente em instantes.',
    generic: 'Algo deu errado. Tente novamente.',
    badData: 'Os dados do perfil estão em um formato inesperado. Tente novamente mais tarde.',
    notSaved: 'Não foi possível salvar. Tente novamente.',
    switched: 'A conta mudou durante o salvamento. Nada foi alterado.',
    busy: 'Aguarde o salvamento em andamento.'
  };

  /* status: idle | loading | ready | error.
     errorKind (só em status "error"): network | unavailable | session | forbidden | internal | data */
  var state = { status: 'idle', userId: '', profile: null, error: '', errorKind: '' };
  var listeners = [];
  var acct = 0;      /* época da conta: muda só quando o usuário muda (troca de conta / logout) */
  var loadSeq = 0;   /* invalida respostas de carregamentos antigos da mesma conta */
  var saving = false;   /* trava da interface */
  var inflight = false; /* trava da API pública */

  /* ---------- utilitários ---------- */

  /* Classifica uma falha. Só "network"/"unavailable" são temporárias; nenhuma delas significa "perfil inexistente". */
  function classify(err, status) {
    var msg = String((err && err.message) || '').toLowerCase();
    var code = String((err && err.code) || '');
    var name = String((err && err.name) || '');
    var st = Number(status || (err && err.status) || 0);
    if ((global.navigator && global.navigator.onLine === false) || name === 'TimeoutError' || name === 'AbortError' ||
        msg.indexOf('failed to fetch') !== -1 || msg.indexOf('network') !== -1 || msg.indexOf('load failed') !== -1) return 'network';
    if (code === 'PGRST301' || code === 'PGRST302' || code === '28000' || st === 401 || msg.indexOf('jwt') !== -1) return 'session';
    if (code === '42501' || st === 403) return 'forbidden';
    if (st === 408 || st === 429 || st === 502 || st === 503 || st === 504) return 'unavailable';
    return 'internal';
  }

  function withTimeout(p) {
    var t;
    var timer = new Promise(function (_, reject) {
      t = setTimeout(function () { reject({ name: 'TimeoutError', message: 'network timeout' }); }, TIMEOUT_MS);
    });
    return Promise.race([Promise.resolve(p), timer]).then(
      function (v) { clearTimeout(t); return v; },
      function (e) { clearTimeout(t); throw e; }
    );
  }

  /* Valida a linha recebida: precisa ser do usuário atual e ter display_name textual. */
  function toProfile(row, uid) {
    if (!row || row.id !== uid || typeof row.display_name !== 'string') return null;
    return { id: row.id, displayName: row.display_name, createdAt: row.created_at || '', updatedAt: row.updated_at || '' };
  }

  function validateName(raw) {
    var v = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (!v) return { ok: false, message: 'Digite um nome.' };
    if (/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(v)) return { ok: false, message: 'O nome tem caracteres inválidos.' };
    var n = Array.from(v).length;
    if (n < NAME_MIN) return { ok: false, message: 'Use ao menos ' + NAME_MIN + ' caracteres.' };
    if (n > NAME_MAX) return { ok: false, message: 'Use no máximo ' + NAME_MAX + ' caracteres.' };
    return { ok: true, value: v };
  }

  function snapshot() {
    return {
      status: state.status, userId: state.userId, error: state.error, errorKind: state.errorKind,
      profile: state.profile ? { id: state.profile.id, displayName: state.profile.displayName, createdAt: state.profile.createdAt, updatedAt: state.profile.updatedAt } : null
    };
  }
  function emit() {
    var snap = snapshot();
    listeners.slice().forEach(function (fn) { try { fn(snap); } catch (e) { /* ignora erro de listener */ } });
  }
  function setState(next) { state = next; emit(); }
  function setError(uid, kind, message) {
    setState({ status: 'error', userId: uid, profile: null, error: message, errorKind: kind });
  }
  function failFrom(uid, err, status, creating) {
    var kind = classify(err, status);
    /* Só o código vai para o console (nunca tokens nem dados do usuário). */
    try { if (global.console && console.warn) console.warn('[Crowfit] perfil:', kind, (err && err.code) || ''); } catch (e) {}
    setError(uid, kind, (creating && kind === 'internal') ? MSG.createFail : MSG[kind]);
  }

  /* ---------- acesso aos dados ---------- */
  async function load(uid) {
    var my = ++loadSeq, ep = acct;
    function stale() { return my !== loadSeq || ep !== acct || state.userId !== uid; }
    setState({ status: 'loading', userId: uid, profile: null, error: '', errorKind: '' });
    var client = Auth.getClient && Auth.getClient();
    if (!client) { setError(uid, 'network', MSG.network); return; }
    if (global.navigator && global.navigator.onLine === false) { setError(uid, 'network', MSG.network); return; }
    try {
      var r = await withTimeout(client.from('profiles').select(COLS).eq('id', uid).maybeSingle());
      if (stale()) return; /* conta trocou/encerrou, ou há um carregamento mais novo: descarta */
      if (r.error) { failFrom(uid, r.error, r.status, false); return; }
      if (!r.data) { await recover(uid, client, stale); return; } /* consulta OK e sem linha: perfil realmente ausente */
      var p = toProfile(r.data, uid);
      if (!p) { setError(uid, 'data', MSG.badData); return; }
      setState({ status: 'ready', userId: uid, profile: p, error: '', errorKind: '' });
    } catch (e) {
      if (stale()) return;
      failFrom(uid, e, 0, false);
    }
  }

  /* Recuperação do perfil ausente. O banco decide o id com auth.uid(); aqui não se envia id algum.
     A função é idempotente: se o perfil já existir, devolve o existente sem alterar nada. */
  async function recover(uid, client, stale) {
    try {
      var r = await withTimeout(client.rpc('ensure_my_profile'));
      if (stale()) return;
      if (r.error) { failFrom(uid, r.error, r.status, true); return; }
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      var p = toProfile(row, uid); /* rejeita qualquer linha que não seja do usuário atual */
      if (!p) { setError(uid, 'internal', MSG.createFail); return; }
      setState({ status: 'ready', userId: uid, profile: p, error: '', errorKind: '' });
    } catch (e) {
      if (stale()) return;
      failFrom(uid, e, 0, true);
    }
  }

  function refresh() {
    var uid = state.userId;
    if (!uid) return Promise.resolve();
    return load(uid);
  }

  async function updateDisplayName(raw) {
    var v = validateName(raw);
    if (!v.ok) return { ok: false, message: v.message };
    var uid = state.userId;
    if (!uid || state.status !== 'ready') return { ok: false, message: MSG.generic };
    if (inflight) return { ok: false, message: MSG.busy };
    var client = Auth.getClient && Auth.getClient();
    if (!client) return { ok: false, message: MSG.network };
    if (global.navigator && global.navigator.onLine === false) return { ok: false, message: MSG.network };
    var ep = acct;
    inflight = true;
    try {
      /* O filtro .eq('id', uid) é só conveniência: quem garante o isolamento é a RLS no banco. */
      var r = await withTimeout(client.from('profiles').update({ display_name: v.value }).eq('id', uid).select(COLS).maybeSingle());
      if (ep !== acct || state.userId !== uid) return { ok: false, message: MSG.switched };
      if (r.error) return { ok: false, message: MSG[classify(r.error, r.status)] };
      var p = r.data && toProfile(r.data, uid);
      /* 0 linhas: o perfil sumiu (ou a RLS bloqueou). Sinaliza para recarregar/recuperar. */
      if (!p) return { ok: false, message: MSG.notSaved, missing: true };
      setState({ status: 'ready', userId: uid, profile: p, error: '', errorKind: '' });
      return { ok: true };
    } catch (e) {
      if (ep !== acct || state.userId !== uid) return { ok: false, message: MSG.switched };
      return { ok: false, message: MSG[classify(e, 0)] };
    } finally {
      inflight = false;
    }
  }

  /* ---------- sincronização com a autenticação ---------- */
  function sync(snap) {
    if (!snap.ready) return;
    var uid = (snap.user && snap.user.id) || '';
    if (uid !== state.userId) {
      acct++; loadSeq++;           /* descarta qualquer consulta/salvamento em andamento da conta anterior */
      draft = null; uiMsg = null;  /* rascunho e mensagens da conta anterior nunca passam para a próxima */
      if (panelOpen) closePanel(false); /* o painel nunca atravessa uma troca de conta */
      if (!uid) setState({ status: 'idle', userId: '', profile: null, error: '', errorKind: '' });
      else load(uid);              /* o estado antigo é apagado em load() antes de qualquer render */
    }
    updateChip(snap);
    if (panelOpen && (!uid || snap.recovery)) closePanel(false);
    else if (panelOpen) reapplyInert();
  }

  /* ---------- interface (reaproveita as classes cf-* de auth.css) ---------- */
  var opts = global.CROWFIT_AUTH_UI || {};
  var chip = null, panel = null, panelOpen = false, draft = null, uiMsg = null;

  function el(tag, cls) { var n = doc.createElement(tag); if (cls) n.className = cls; return n; }

  function chipSide() { return /left$/.test(String(opts.chipPosition || 'bottom-left')) ? 'right' : 'left'; }
  function chipVert() { return /^top/.test(String(opts.chipPosition || 'bottom-left')) ? 'top' : 'bottom'; }

  function updateChip(snap) {
    if (!chip) {
      chip = el('button', 'cf-chip cf-pos-' + chipVert() + '-' + chipSide());
      chip.type = 'button';
      chip.textContent = 'Perfil';
      chip.setAttribute('aria-label', 'Abrir meu perfil');
      chip.hidden = true;
      chip.addEventListener('click', openPanel);
      doc.body.appendChild(chip);
    }
    chip.hidden = !(snap.user && !snap.recovery);
  }

  function ensurePanel() {
    if (panel) return;
    panel = el('div', 'cf-auth cf-prof');
    panel.id = 'cf-prof';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Meu perfil');
    doc.body.appendChild(panel);
    panel.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-prof-close]');
      if (t) { closePanel(true); return; }
      var rt = e.target.closest && e.target.closest('[data-prof-retry]');
      if (rt && !saving) { uiMsg = null; refresh(); }
    });
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !saving) closePanel(true); });
  }

  function authOverlayOpen() { var a = doc.getElementById('cf-auth'); return !!(a && !a.hidden); }
  function setAppInert(on) { var a = doc.getElementById('app'); if (a) { if (on) a.setAttribute('inert', ''); else a.removeAttribute('inert'); } }
  function reapplyInert() { doc.documentElement.classList.add('cf-auth-open'); setAppInert(true); }

  function openPanel() {
    ensurePanel();
    panelOpen = true; draft = null; uiMsg = null;
    panel.hidden = false;
    reapplyInert();
    var f = doc.activeElement; if (f && f !== doc.body && !panel.contains(f) && f.blur) f.blur();
    renderPanel(true);
    if (state.status === 'error') refresh(); /* reabrir tenta de novo */
  }

  function closePanel(restoreFocus) {
    if (!panel) return;
    panelOpen = false; draft = null; uiMsg = null;
    panel.hidden = true; panel.innerHTML = '';
    if (!authOverlayOpen()) { doc.documentElement.classList.remove('cf-auth-open'); setAppInert(false); }
    if (restoreFocus && chip && !chip.hidden && chip.focus) chip.focus();
  }

  function setMsg(text, kind) {
    var n = panel && panel.querySelector('[data-msg]');
    if (!n) return;
    n.textContent = text || '';
    n.className = 'cf-msg ' + (kind || 'error');
    n.hidden = !text;
  }

  function setBusy(on) {
    if (!panel) return;
    panel.setAttribute('aria-busy', on ? 'true' : 'false');
    Array.prototype.forEach.call(panel.querySelectorAll('button, input'), function (n) {
      n.disabled = !!on;
      if (n.matches('.cf-btn-main[data-label]')) n.textContent = on ? 'Salvando…' : n.getAttribute('data-label');
    });
  }

  var HEAD = '<div class="cf-wrap"><img class="cf-mascot" src="mascot.png" alt="" data-mascot><div class="cf-brand">Crowfit</div><h1 class="cf-title" tabindex="-1">Seu perfil</h1>';
  var CLOSE = '<button class="cf-btn cf-btn-ghost" type="button" data-prof-close>Fechar</button>';
  var LOGOUT = '<div class="cf-links"><button class="cf-link" type="button" data-crowfit-logout>Sair da conta</button></div>';

  /* keepTyped: re-render disparado por mudança de estado (não pelo usuário): preserva o que está sendo digitado. */
  function renderPanel(focus, keepTyped) {
    if (!panel || !panelOpen || saving) return;
    var snap = Auth.getState();
    var st = state.status, h;
    if (keepTyped && st === 'ready') {
      var cur = panel.querySelector('#cf-prof-name');
      if (cur) draft = cur.value;
    }
    if (st === 'ready') {
      h = HEAD + '<p class="cf-sub">Como você aparece no Crowfit. <span class="cf-acct" data-acct></span></p>' +
        '<p class="cf-msg" role="status" aria-live="polite" data-msg hidden></p>' +
        '<form class="cf-form" novalidate data-prof-form>' +
        '<div class="cf-field"><label for="cf-prof-name">Nome de exibição</label>' +
        '<input id="cf-prof-name" name="name" type="text" autocomplete="name" maxlength="' + (NAME_MAX * 2) + '" required>' +
        '<p class="cf-hint">De ' + NAME_MIN + ' a ' + NAME_MAX + ' caracteres.</p></div>' +
        '<button class="cf-btn cf-btn-main" type="submit" data-label="Salvar">Salvar</button></form>' + CLOSE + LOGOUT + '</div>';
    } else if (st === 'error') {
      var retry = state.errorKind === 'session' ? '' : '<button class="cf-btn cf-btn-main" type="button" data-prof-retry>Tentar de novo</button>';
      h = HEAD + '<p class="cf-msg error" role="alert" data-err></p>' + retry + CLOSE + LOGOUT + '</div>';
    } else {
      h = HEAD + '<div class="cf-spin" role="status" aria-label="Carregando"></div>' + CLOSE + '</div>';
    }
    panel.innerHTML = h;
    var mc = panel.querySelector('[data-mascot]');
    if (mc) mc.addEventListener('error', function () { mc.remove(); });

    if (st === 'ready') {
      var ac = panel.querySelector('[data-acct]');
      if (ac) ac.textContent = snap.user && snap.user.email ? 'Conta: ' + snap.user.email : '';
      var input = panel.querySelector('#cf-prof-name');
      input.value = draft != null ? draft : state.profile.displayName;
      if (uiMsg) setMsg(uiMsg.text, uiMsg.kind);
      panel.querySelector('[data-prof-form]').addEventListener('submit', onSubmit);
      if (focus) { try { input.focus(); input.select(); } catch (e) {} }
    } else if (st === 'error') {
      var er = panel.querySelector('[data-err]');
      if (er) er.textContent = state.error || MSG.generic;
      if (focus) { var t = panel.querySelector('.cf-title'); if (t) t.focus(); }
    } else if (focus) {
      var t2 = panel.querySelector('.cf-title'); if (t2) t2.focus();
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (saving) return;
    var form = e.currentTarget;
    var raw = (form.elements.name && form.elements.name.value) || '';
    var v = validateName(raw);
    if (!v.ok) { setMsg(v.message, 'error'); return; }
    if (state.profile && v.value === state.profile.displayName) { draft = null; uiMsg = { text: 'Seu nome já está assim.', kind: 'ok' }; setMsg(uiMsg.text, 'ok'); return; }
    var uid = state.userId;
    saving = true; setBusy(true); setMsg('');
    var r = await updateDisplayName(raw);
    saving = false;
    if (state.userId !== uid) return; /* a conta mudou: o painel já foi fechado e nada da conta antiga é reaproveitado */
    if (r.ok) { draft = null; uiMsg = { text: 'Nome atualizado.', kind: 'ok' }; }
    else { draft = raw; uiMsg = { text: r.message, kind: 'error' }; }
    renderPanel(false);
    var inp = panel && panel.querySelector('#cf-prof-name');
    if (inp && !r.ok) { try { inp.focus(); } catch (x) {} }
    if (!r.ok && r.missing) refresh(); /* perfil sumiu: recarrega e tenta a recuperação segura */
  }

  /* Mantém o painel em dia quando o estado do perfil muda (carregando -> pronto, erro, etc.). */
  listeners.push(function () { renderPanel(false, true); });

  /* Quando a rede volta, tenta de novo só se o erro foi temporário (rede/servidor). */
  global.addEventListener('online', function () {
    if (state.userId && state.status === 'error' && (state.errorKind === 'network' || state.errorKind === 'unavailable') && !saving) refresh();
  });

  global.CrowfitProfile = {
    getState: snapshot,
    onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    refresh: refresh,
    updateDisplayName: updateDisplayName,
    validateName: validateName
  };

  function start() {
    Auth.onChange(sync);
    Auth.init().then(function () { sync(Auth.getState()); });
  }
  if (doc.body) start(); else doc.addEventListener('DOMContentLoaded', start);
})(window, document);
