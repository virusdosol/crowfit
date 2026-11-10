/* Crowfit — telas de autenticação (overlay sobre o app existente).
   Não altera o HTML do app: cobre a tela enquanto não há sessão e some quando há.
   Opções (opcional, definir ANTES deste script):
     window.CROWFIT_AUTH_UI = { floatingLogout: false, chipPosition: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' }
   Qualquer elemento com o atributo data-crowfit-logout faz logout ao ser clicado. */
(function (global, doc) {
  'use strict';
  var Auth = global.CrowfitAuth;
  if (!Auth) return;

  var opts = Object.assign({ floatingLogout: false, chipPosition: 'bottom-left' }, global.CROWFIT_AUTH_UI || {});
  var root = null, chip = null, toastEl = null, toastTimer = 0, view = 'loading';

  var GOOGLE_SVG = '<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>';

  /* Somente HTML estático aqui. Dados do usuário entram sempre via textContent. */
  function field(id, label, type, auto, hint) {
    return '<div class="cf-field"><label for="cf-' + id + '">' + label + '</label>' +
      '<input id="cf-' + id + '" name="' + id + '" type="' + type + '" autocomplete="' + auto + '" required>' +
      (hint ? '<p class="cf-hint">' + hint + '</p>' : '') + '</div>';
  }
  function head(title, sub) { return '<h1 class="cf-title">' + title + '</h1>' + (sub ? '<p class="cf-sub">' + sub + '</p>' : ''); }
  var MSG = '<p class="cf-msg" role="status" aria-live="polite" data-msg hidden></p>';
  function submit(label) { return '<button class="cf-btn cf-btn-main" type="submit" data-label="' + label + '">' + label + '</button>'; }

  var VIEWS = {
    loading: function () { return '<div class="cf-spin" role="status" aria-label="Carregando"></div>'; },
    login: function () {
      return head('Entrar', 'Entre para continuar seu treino.') + MSG +
        '<form class="cf-form" novalidate data-form="login">' +
        field('email', 'E-mail', 'email', 'email') + field('password', 'Senha', 'password', 'current-password') +
        submit('Entrar') + '</form>' +
        '<div class="cf-or"><span>ou</span></div>' +
        '<button class="cf-btn cf-btn-google" type="button" data-google data-label="Continuar com Google">' + GOOGLE_SVG + '<span>Continuar com Google</span></button>' +
        '<div class="cf-links"><button class="cf-link" type="button" data-go="signup">Criar conta</button>' +
        '<button class="cf-link" type="button" data-go="forgot">Esqueci minha senha</button></div>';
    },
    signup: function () {
      return head('Criar conta', 'Leva menos de um minuto.') + MSG +
        '<form class="cf-form" novalidate data-form="signup">' +
        field('name', 'Nome', 'text', 'name') + field('email', 'E-mail', 'email', 'email') +
        field('password', 'Senha', 'password', 'new-password', 'Mínimo de 8 caracteres, com letras e números.') +
        field('confirm', 'Confirmar senha', 'password', 'new-password') + submit('Criar conta') + '</form>' +
        '<div class="cf-links"><button class="cf-link" type="button" data-go="login">Já tenho conta</button></div>';
    },
    forgot: function () {
      return head('Recuperar senha', 'Informe seu e-mail e enviaremos um link para criar uma nova senha.') + MSG +
        '<form class="cf-form" novalidate data-form="forgot">' + field('email', 'E-mail', 'email', 'email') + submit('Enviar link') + '</form>' +
        '<div class="cf-links"><button class="cf-link" type="button" data-go="login">Voltar para entrar</button></div>';
    },
    reset: function () {
      return head('Nova senha', 'Escolha a senha que você vai usar daqui para frente.') + MSG +
        '<form class="cf-form" novalidate data-form="reset">' +
        field('password', 'Nova senha', 'password', 'new-password', 'Mínimo de 8 caracteres, com letras e números.') +
        field('confirm', 'Confirmar nova senha', 'password', 'new-password') + submit('Salvar senha') + '</form>';
    },
    sent: function (d) {
      var t = d.kind === 'signup' ? 'Confirme seu e-mail' : 'Link enviado';
      var s = d.kind === 'signup'
        ? 'Enviamos um link de confirmação para <strong data-email></strong>. Depois de confirmar, volte aqui e entre.'
        : 'Se <strong data-email></strong> tiver cadastro, o link chega em instantes. Olhe também o spam.';
      return head(t, '') + '<p class="cf-sub">' + s + '</p>' +
        '<button class="cf-btn cf-btn-main" type="button" data-go="login">Ir para entrar</button>';
    }
  };

  function el(tag, cls) { var n = doc.createElement(tag); if (cls) n.className = cls; return n; }

  function ensureRoot() {
    if (root) return;
    root = el('div', 'cf-auth');
    root.id = 'cf-auth';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Acesso ao Crowfit');
    doc.body.appendChild(root);
    root.addEventListener('click', function (e) {
      var go = e.target.closest && e.target.closest('[data-go]');
      if (go) renderView(go.getAttribute('data-go'));
    });
  }

  function setMsg(text, kind) {
    var n = root && root.querySelector('[data-msg]');
    if (!n) return;
    n.textContent = text || '';
    n.className = 'cf-msg ' + (kind || 'error');
    n.hidden = !text;
  }

  function setBusy(scope, on) {
    root.setAttribute('aria-busy', on ? 'true' : 'false');
    root.dataset.busy = on ? '1' : '';
    Array.prototype.forEach.call(root.querySelectorAll('button, input'), function (n) {
      n.disabled = !!on;
      if (n.matches('.cf-btn-main[data-label]')) n.textContent = on ? 'Aguarde…' : n.getAttribute('data-label');
    });
  }

  function renderView(name, data) {
    ensureRoot();
    data = data || {};
    view = name;
    root.innerHTML = '<div class="cf-wrap' + (name === 'loading' ? ' cf-center' : '') + '">' + VIEWS[name](data) + '</div>';
    var em = root.querySelector('[data-email]');
    if (em) em.textContent = data.email || '';
    bind(name);
    if (data.message) setMsg(data.message, data.kind || 'error');
  }

  function val(form, n) { return (form.elements[n] && form.elements[n].value) || ''; }

  function bind(name) {
    var form = root.querySelector('[data-form]');
    var g = root.querySelector('[data-google]');
    if (g) g.addEventListener('click', async function () {
      if (root.dataset.busy) return;
      setBusy(root, true); setMsg('');
      var r = await Auth.signInWithGoogle();
      if (!r.ok) { setBusy(root, false); setMsg(r.error.message); }
    });
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (root.dataset.busy) return;
      var email = val(form, 'email').trim(), pw = val(form, 'password'), r;
      if (name === 'login') {
        if (!Auth.validateEmail(email)) return setMsg('Digite um e-mail válido.');
        if (!pw) return setMsg('Digite sua senha.');
        setBusy(root, true); setMsg('');
        r = await Auth.signIn(email, pw);
        setBusy(root, false);
        if (!r.ok) setMsg(r.error.message);
      } else if (name === 'signup') {
        var nm = val(form, 'name').trim();
        if (nm.length < 2) return setMsg('Digite seu nome.');
        if (!Auth.validateEmail(email)) return setMsg('Digite um e-mail válido.');
        if (!Auth.validatePassword(pw)) return setMsg('A senha precisa ter ao menos 8 caracteres, com letras e números.');
        if (pw !== val(form, 'confirm')) return setMsg('As senhas não são iguais.');
        setBusy(root, true); setMsg('');
        r = await Auth.signUp({ name: nm, email: email, password: pw });
        setBusy(root, false);
        if (!r.ok) setMsg(r.error.message);
        else if (r.needsConfirmation) renderView('sent', { kind: 'signup', email: email });
      } else if (name === 'forgot') {
        if (!Auth.validateEmail(email)) return setMsg('Digite um e-mail válido.');
        setBusy(root, true); setMsg('');
        r = await Auth.sendPasswordReset(email);
        setBusy(root, false);
        if (!r.ok) setMsg(r.error.message);
        else renderView('sent', { kind: 'reset', email: email });
      } else if (name === 'reset') {
        if (!Auth.validatePassword(pw)) return setMsg('A senha precisa ter ao menos 8 caracteres, com letras e números.');
        if (pw !== val(form, 'confirm')) return setMsg('As senhas não são iguais.');
        setBusy(root, true); setMsg('');
        r = await Auth.updatePassword(pw);
        setBusy(root, false);
        if (!r.ok) setMsg(r.error.message);
        else toast('Senha atualizada.');
      }
    });
  }

  /* Enquanto a tela de acesso está aberta, o app embaixo fica inerte (sem foco, sem leitor de tela). */
  function setAppInert(on) { var a = doc.getElementById('app'); if (a) { if (on) a.setAttribute('inert', ''); else a.removeAttribute('inert'); } }
  function open() {
    ensureRoot(); root.hidden = false; doc.documentElement.classList.add('cf-auth-open'); setAppInert(true);
    var f = doc.activeElement; if (f && f !== doc.body && !root.contains(f) && f.blur) f.blur();
  }
  function close() { if (root) { root.hidden = true; root.innerHTML = ''; view = 'closed'; } doc.documentElement.classList.remove('cf-auth-open'); setAppInert(false); }

  function toast(text) {
    if (!toastEl) { toastEl = el('div', 'cf-toast'); toastEl.setAttribute('role', 'status'); doc.body.appendChild(toastEl); }
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 3200);
  }

  function updateChip(snap) {
    if (!opts.floatingLogout) return;
    if (!chip) {
      chip = el('button', 'cf-chip cf-pos-' + opts.chipPosition);
      chip.type = 'button';
      chip.setAttribute('data-crowfit-logout', '');
      chip.textContent = 'Sair';
      doc.body.appendChild(chip);
    }
    chip.hidden = !snap.user;
    if (snap.user) chip.setAttribute('aria-label', 'Sair da conta ' + (snap.user.email || ''));
  }

  var UNAUTH = { login: 1, signup: 1, forgot: 1, sent: 1 };

  function sync(snap) {
    if (!doc.body) return;
    if (!snap.ready) { if (view === 'loading') { renderView('loading'); open(); } return; }
    if (snap.recovery) { if (view !== 'reset') renderView('reset'); open(); return; }
    if (snap.user || snap.offline) { close(); updateChip(snap); return; }
    updateChip(snap);
    var notice = snap.urlError || (snap.expired ? 'Sua sessão expirou. Entre novamente.' : '');
    if (!UNAUTH[view] || notice) {
      renderView('login', notice ? { message: notice, kind: 'error' } : {});
      Auth.clearNotices();
    }
    open();
  }

  doc.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-crowfit-logout]');
    if (!t) return;
    e.preventDefault();
    Auth.signOut().then(function (r) { if (!r.ok) toast(r.error.message); });
  });

  /* Voltar do Google pelo botão "voltar" (bfcache) não pode deixar a tela travada em "Aguarde". */
  global.addEventListener('pageshow', function (ev) { if (ev.persisted && root) { var s = Auth.getState(); if (!s.user) { renderView(UNAUTH[view] ? view : 'login'); } } });

  function start() {
    ensureRoot(); renderView('loading'); open();
    Auth.onChange(sync);
    Auth.init().then(function () { sync(Auth.getState()); });
  }
  if (doc.body) start(); else doc.addEventListener('DOMContentLoaded', start);
})(window, document);
