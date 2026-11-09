/* Crowfit — perfil remoto do usuário (Supabase, tabela public.profiles).
   Expõe window.CrowfitProfile. Não lê nem escreve nenhuma chave de localStorage (o progresso "corvofit-v1" não é tocado).
   O perfil fica só em memória: é descartado no logout / troca de conta e nunca é guardado no aparelho.
   O app só LÊ e ATUALIZA display_name; a criação do perfil é feita pelo banco (trigger). Tudo passa por RLS. */
(function (global, doc) {
  'use strict';
  var Auth = global.CrowfitAuth;
  if (!Auth) return;

  var NAME_MIN = 2, NAME_MAX = 40;
  var COLS = 'id, display_name, created_at, updated_at';
  var MSG = {
    network: 'Sem conexão com a internet. Seu treino continua funcionando; tente o perfil de novo quando a rede voltar.',
    session: 'Sua sessão expirou. Entre novamente.',
    missing: 'Seu perfil ainda não foi criado. Tente de novo em instantes.',
    generic: 'Algo deu errado. Tente novamente.',
    badData: 'Os dados do perfil estão em um formato inesperado. Tente novamente mais tarde.',
    notSaved: 'Não foi possível salvar. Tente novamente.',
    switched: 'A conta mudou durante o salvamento. Nada foi alterado.'
  };

  var state = { status: 'idle', userId: '', profile: null, error: '' }; /* status: idle | loading | ready | missing | error */
  var listeners = [];
  var seq = 0;          /* invalida respostas de consultas antigas (troca de conta / logout) */
  var saving = false;

  /* ---------- utilitários ---------- */
  function mapError(err) {
    var msg = String((err && err.message) || '').toLowerCase();
    var code = String((err && err.code) || '');
    if ((global.navigator && global.navigator.onLine === false) || msg.indexOf('failed to fetch') !== -1 ||
        msg.indexOf('network') !== -1 || msg.indexOf('load failed') !== -1) return MSG.network;
    if (code === 'PGRST301' || msg.indexOf('jwt') !== -1) return MSG.session;
    return MSG.generic;
  }

  /* Valida a linha recebida: precisa ser do usuário atual e ter display_name textual. */
  function toProfile(row, uid) {
    if (!row || row.id !== uid || typeof row.display_name !== 'string') return null;
    return { id: row.id, displayName: row.display_name, createdAt: row.created_at || '', updatedAt: row.updated_at || '' };
  }

  function validateName(raw) {
    var v = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (!v) return { ok: false, message: 'Digite um nome.' };
    if (/[\u0000-\u001F\u007F]/.test(v)) return { ok: false, message: 'O nome tem caracteres inválidos.' };
    var n = Array.from(v).length;
    if (n < NAME_MIN) return { ok: false, message: 'Use ao menos ' + NAME_MIN + ' caracteres.' };
    if (n > NAME_MAX) return { ok: false, message: 'Use no máximo ' + NAME_MAX + ' caracteres.' };
    return { ok: true, value: v };
  }

  function snapshot() {
    return {
      status: state.status, userId: state.userId, error: state.error,
      profile: state.profile ? { id: state.profile.id, displayName: state.profile.displayName, createdAt: state.profile.createdAt, updatedAt: state.profile.updatedAt } : null
    };
  }
  function emit() {
    var snap = snapshot();
    listeners.slice().forEach(function (fn) { try { fn(snap); } catch (e) { /* ignora erro de listener */ } });
  }
  function setState(next) { state = next; emit(); }

  /* ---------- acesso aos dados ---------- */
  async function load(uid) {
    var my = ++seq;
    setState({ status: 'loading', userId: uid, profile: null, error: '' });
    var client = Auth.getClient && Auth.getClient();
    if (!client) { setState({ status: 'error', userId: uid, profile: null, error: MSG.network }); return; }
    try {
      var r = await client.from('profiles').select(COLS).eq('id', uid).maybeSingle();
      if (my !== seq) return; /* sessão trocou/encerrou enquanto esperava: descarta */
      if (r.error) { setState({ status: 'error', userId: uid, profile: null, error: mapError(r.error) }); return; }
      if (!r.data) { setState({ status: 'missing', userId: uid, profile: null, error: MSG.missing }); return; }
      var p = toProfile(r.data, uid);
      if (!p) { setState({ status: 'error', userId: uid, profile: null, error: MSG.badData }); return; }
      setState({ status: 'ready', userId: uid, profile: p, error: '' });
    } catch (e) {
      if (my !== seq) return;
      setState({ status: 'error', userId: uid, profile: null, error: mapError(e) });
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
    var client = Auth.getClient && Auth.getClient();
    if (!client) return { ok: false, message: MSG.network };
    var my = seq;
    try {
      /* O filtro .eq('id', uid) é só conveniência: quem garante o isolamento é a RLS no banco. */
      var r = await client.from('profiles').update({ display_name: v.value }).eq('id', uid).select(COLS).maybeSingle();
      if (my !== seq || state.userId !== uid) return { ok: false, message: MSG.switched };
      if (r.error) return { ok: false, message: mapError(r.error) };
      var p = r.data && toProfile(r.data, uid);
      if (!p) return { ok: false, message: MSG.notSaved }; /* 0 linhas atualizadas: RLS bloqueou ou perfil sumiu */
      setState({ status: 'ready', userId: uid, profile: p, error: '' });
      return { ok: true };
    } catch (e) {
      if (my !== seq || state.userId !== uid) return { ok: false, message: MSG.switched };
      return { ok: false, message: mapError(e) };
    }
  }

  /* ---------- sincronização com a autenticação ---------- */
  function sync(snap) {
    if (!snap.ready) return;
    var uid = (snap.user && snap.user.id) || '';
    if (uid !== state.userId) {
      seq++;                       /* descarta qualquer consulta em andamento da conta anterior */
      if (!uid) { setState({ status: 'idle', userId: '', profile: null, error: '' }); }
      else { load(uid); }          /* troca de conta: estado antigo é apagado em load() antes de qualquer render */
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
    if (state.status === 'error' || state.status === 'missing') refresh(); /* reabrir tenta de novo */
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

  function renderPanel(focus) {
    if (!panel || !panelOpen || saving) return;
    var snap = Auth.getState();
    var st = state.status, h;
    if (st === 'ready') {
      h = HEAD + '<p class="cf-sub">Como você aparece no Crowfit. <span class="cf-acct" data-acct></span></p>' +
        '<p class="cf-msg" role="status" aria-live="polite" data-msg hidden></p>' +
        '<form class="cf-form" novalidate data-prof-form>' +
        '<div class="cf-field"><label for="cf-prof-name">Nome de exibição</label>' +
        '<input id="cf-prof-name" name="name" type="text" autocomplete="name" maxlength="' + (NAME_MAX * 2) + '" required>' +
        '<p class="cf-hint">De ' + NAME_MIN + ' a ' + NAME_MAX + ' caracteres.</p></div>' +
        '<button class="cf-btn cf-btn-main" type="submit" data-label="Salvar">Salvar</button></form>' + CLOSE + LOGOUT + '</div>';
    } else if (st === 'missing' || st === 'error') {
      h = HEAD + '<p class="cf-msg error" role="alert" data-err></p>' +
        '<button class="cf-btn cf-btn-main" type="button" data-prof-retry>Tentar de novo</button>' + CLOSE + LOGOUT + '</div>';
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
    } else if (st === 'missing' || st === 'error') {
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
    saving = true; setBusy(true); setMsg('');
    var r = await updateDisplayName(raw);
    saving = false;
    if (r.ok) { draft = null; uiMsg = { text: 'Nome atualizado.', kind: 'ok' }; }
    else { draft = raw; uiMsg = { text: r.message, kind: 'error' }; }
    renderPanel(false);
    var inp = panel && panel.querySelector('#cf-prof-name');
    if (inp && !r.ok) { try { inp.focus(); } catch (x) {} }
  }

  /* Mantém o painel em dia quando o estado do perfil muda (carregando -> pronto, erro, etc.). */
  listeners.push(function () { renderPanel(false); });

  /* Quando a rede volta, tenta de novo sem o usuário precisar fazer nada. */
  global.addEventListener('online', function () {
    if (state.userId && (state.status === 'error' || state.status === 'missing') && !saving) refresh();
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
