/* Crowfit — módulo de autenticação (sem UI, sem relação com a lógica de treino).
   Expõe window.CrowfitAuth. Não lê nem escreve nenhuma chave de localStorage do app.
   Nunca registra tokens em log. */
(function (global) {
  'use strict';

  var CFG = global.CROWFIT_SUPABASE;
  var listeners = [];
  var state = { client: null, session: null, ready: false, recovery: false, offline: false, expired: false, urlError: '' };
  var userInitiatedSignOut = false;
  var hadSession = false;
  var initPromise = null;

  var MSG = {
    network: 'Sem conexão com a internet. Verifique a rede e tente de novo.',
    invalid: 'E-mail ou senha incorretos.',
    notConfirmed: 'Seu e-mail ainda não foi confirmado. Abra o link que enviamos para você.',
    exists: 'Este e-mail já tem cadastro. Entre ou recupere sua senha.',
    weak: 'Senha fraca. Use ao menos 8 caracteres, com letras e números.',
    rate: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    samePw: 'A nova senha precisa ser diferente da atual.',
    expired: 'Sua sessão expirou. Entre novamente.',
    generic: 'Algo deu errado. Tente novamente.'
  };

  function storageKey() {
    try { return 'sb-' + new URL(CFG.url).hostname.split('.')[0] + '-auth-token'; } catch (e) { return null; }
  }
  function hasStoredSession() {
    try { var k = storageKey(); return !!(k && global.localStorage.getItem(k)); } catch (e) { return false; }
  }

  function mapError(err) {
    if (!err) return MSG.generic;
    var msg = String(err.message || '').toLowerCase();
    var code = String(err.code || '');
    if (code === 'invalid_credentials' || msg.indexOf('invalid login credentials') !== -1) return MSG.invalid;
    if (code === 'email_not_confirmed' || msg.indexOf('email not confirmed') !== -1) return MSG.notConfirmed;
    if (code === 'user_already_exists' || code === 'email_exists' || msg.indexOf('already registered') !== -1) return MSG.exists;
    if (code === 'weak_password' || msg.indexOf('password should be') !== -1) return MSG.weak;
    if (code === 'same_password') return MSG.samePw;
    if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || err.status === 429 || msg.indexOf('rate limit') !== -1) return MSG.rate;
    if (code === 'session_expired' || code === 'refresh_token_not_found' || code === 'session_not_found') return MSG.expired;
    if (err.name === 'AuthRetryableFetchError' || msg.indexOf('failed to fetch') !== -1 || msg.indexOf('network') !== -1 ||
        (global.navigator && global.navigator.onLine === false)) return MSG.network;
    return MSG.generic;
  }
  function fail(err) {
    return { ok: false, error: { code: (err && (err.code || err.name)) || 'unknown', message: mapError(err) } };
  }

  function publicUser(session) {
    var u = session && session.user;
    if (!u) return null;
    var meta = u.user_metadata || {};
    var email = u.email || '';
    return { id: u.id, email: email, name: meta.full_name || meta.name || (email ? email.split('@')[0] : '') };
  }

  function snapshot(event) {
    return {
      event: event || '', ready: state.ready, user: publicUser(state.session), recovery: state.recovery,
      offline: state.offline, expired: state.expired, urlError: state.urlError
    };
  }

  function emit(event) {
    var snap = snapshot(event);
    listeners.slice().forEach(function (fn) { try { fn(snap); } catch (e) { /* ignora erro de listener */ } });
    try { global.dispatchEvent(new CustomEvent('crowfit:auth', { detail: snap })); } catch (e) {}
  }

  /* Callback do SDK: sem trabalho assíncrono aqui dentro (evita deadlock); delega com setTimeout. */
  function handle(event, session) {
    state.session = session || null;
    if (event === 'PASSWORD_RECOVERY') state.recovery = true;
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) { hadSession = true; state.expired = false; }
    if (event === 'SIGNED_OUT') {
      state.recovery = false;
      if (!userInitiatedSignOut && hadSession) state.expired = true;
      hadSession = false;
      userInitiatedSignOut = false;
    }
    if (state.ready) emit(event);
  }

  function readUrlError() {
    var q = new URLSearchParams(global.location.search || '');
    var h = new URLSearchParams((global.location.hash || '').replace(/^#/, ''));
    var err = q.get('error') || h.get('error');
    if (!err) return null;
    return { code: q.get('error_code') || h.get('error_code') || err };
  }
  function urlErrorMessage(e) {
    if (e.code === 'access_denied') return 'Login com o Google cancelado. Você pode tentar de novo.';
    if (e.code === 'otp_expired') return 'Esse link expirou ou já foi usado. Peça um novo.';
    return 'Não foi possível concluir o acesso. Tente novamente.';
  }

  function returnUrl() { return global.location.origin + global.location.pathname; }

  function waitForLoad(ms) {
    return new Promise(function (res) {
      if (global.document.readyState === 'complete') return res();
      var t = setTimeout(res, ms);
      global.addEventListener('load', function () { clearTimeout(t); res(); }, { once: true });
    });
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = (async function () {
      var urlErr = readUrlError();
      if (urlErr) {
        state.urlError = urlErrorMessage(urlErr);
        try { global.history.replaceState(null, '', global.location.pathname); } catch (e) {}
      }
      /* O SDK é carregado com async: espera ele terminar (ou falhar) antes de decidir. */
      if (CFG && !global.supabase) await waitForLoad(6000);
      if (!CFG || !global.supabase || typeof global.supabase.createClient !== 'function') {
        /* SDK indisponível (ex.: PWA offline sem a lib em cache): libera o app se já houve login neste aparelho. */
        state.offline = hasStoredSession();
        state.ready = true; emit('READY'); return snapshot('READY');
      }
      state.client = global.supabase.createClient(CFG.url, CFG.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
      });
      state.client.auth.onAuthStateChange(function (event, session) {
        setTimeout(function () { handle(event, session); }, 0);
      });
      try {
        var res = await state.client.auth.getSession();
        state.session = (res && res.data && res.data.session) || null;
        hadSession = !!state.session;
      } catch (e) {
        state.session = null;
        state.offline = hasStoredSession();
      }
      state.ready = true; emit('READY');
      return snapshot('READY');
    })();
    return initPromise;
  }

  function noClient() { return { ok: false, error: { code: 'no_client', message: MSG.network } }; }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validateEmail(v) { return EMAIL_RE.test(String(v || '').trim()); }
  function validatePassword(v) {
    v = String(v || '');
    return v.length >= 8 && /[A-Za-zÀ-ÿ]/.test(v) && /\d/.test(v);
  }

  async function signUp(p) {
    if (!state.client) return noClient();
    try {
      var r = await state.client.auth.signUp({
        email: p.email, password: p.password,
        options: { data: { full_name: p.name }, emailRedirectTo: returnUrl() }
      });
      if (r.error) return fail(r.error);
      /* Com confirmação de e-mail ligada, e-mail já cadastrado volta "sucesso" com identities vazio. */
      if (r.data && r.data.user && Array.isArray(r.data.user.identities) && r.data.user.identities.length === 0) {
        return { ok: false, error: { code: 'user_already_exists', message: MSG.exists } };
      }
      return { ok: true, needsConfirmation: !(r.data && r.data.session) };
    } catch (e) { return fail(e); }
  }

  async function signIn(email, password) {
    if (!state.client) return noClient();
    try {
      var r = await state.client.auth.signInWithPassword({ email: email, password: password });
      return r.error ? fail(r.error) : { ok: true };
    } catch (e) { return fail(e); }
  }

  async function signInWithGoogle() {
    if (!state.client) return noClient();
    try {
      var r = await state.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl() } });
      return r.error ? fail(r.error) : { ok: true };
    } catch (e) { return fail(e); }
  }

  async function sendPasswordReset(email) {
    if (!state.client) return noClient();
    try {
      var r = await state.client.auth.resetPasswordForEmail(email, { redirectTo: returnUrl() });
      return r.error ? fail(r.error) : { ok: true };
    } catch (e) { return fail(e); }
  }

  async function updatePassword(password) {
    if (!state.client) return noClient();
    try {
      var r = await state.client.auth.updateUser({ password: password });
      if (r.error) return fail(r.error);
      state.recovery = false;
      emit('USER_UPDATED');
      return { ok: true };
    } catch (e) { return fail(e); }
  }

  /* Encerra só a sessão deste aparelho. Não toca em nenhum dado local do app. */
  async function signOut() {
    if (!state.client) { state.offline = false; state.session = null; emit('SIGNED_OUT'); return { ok: true }; }
    userInitiatedSignOut = true;
    try {
      var r = await state.client.auth.signOut({ scope: 'local' });
      if (r.error) { userInitiatedSignOut = false; return fail(r.error); }
      return { ok: true };
    } catch (e) { userInitiatedSignOut = false; return fail(e); }
  }

  global.CrowfitAuth = {
    init: init,
    onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    getState: function () { return snapshot(''); },
    clearNotices: function () { state.expired = false; state.urlError = ''; },
    validateEmail: validateEmail, validatePassword: validatePassword,
    signUp: signUp, signIn: signIn, signInWithGoogle: signInWithGoogle,
    sendPasswordReset: sendPasswordReset, updatePassword: updatePassword, signOut: signOut
  };
})(window);
