/* Crowfit: ID obrigatório. Quem entra com Google (sem ID) escolhe o ID antes de usar o app.
   Usa CrowfitAuth (cliente Supabase) e a RPC set_my_handle (supabase-id-v9.sql).
   Não guarda nada no aparelho. */
(function (global, doc) {
  var MSG = {
    handle_taken: 'Esse ID já está em uso. Escolha outro.',
    invalid_handle: 'Use de 3 a 20 letras minúsculas, números ou _.',
    handle_cooldown: 'Você só pode trocar o ID 30 dias após a última troca.',
    not_authenticated: 'Entre na sua conta para continuar.'
  };
  var RE = /^[a-z0-9_]{3,20}$/;
  var shownFor = null, busy = false;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function client() { return global.CrowfitAuth && CrowfitAuth.getClient ? CrowfitAuth.getClient() : null; }
  function authOpen() { var a = doc.getElementById('cf-auth'); return !!(a && !a.hidden); }

  function ensure() {
    var el = doc.getElementById('cf-idgate');
    if (el) return el;
    el = doc.createElement('div');
    el.id = 'cf-idgate';
    el.className = 'cf-auth';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Escolha seu ID');
    el.hidden = true;
    doc.body.appendChild(el);
    el.addEventListener('submit', onSubmit);
    return el;
  }

  function show(uid) {
    var el = ensure();
    shownFor = uid;
    el.innerHTML = '<div class="cf-wrap"><h1 class="cf-title" tabindex="-1">Escolha seu ID</h1>' +
      '<p class="cf-sub">Ele é como seus amigos te encontram. Você poderá trocar depois, uma vez a cada 30 dias.</p>' +
      '<p class="cf-msg" role="status" aria-live="polite" data-msg hidden></p>' +
      '<form class="cf-form" novalidate data-idgate-form>' +
      '<div class="cf-field"><label for="cf-idgate-h">ID</label>' +
      '<input id="cf-idgate-h" name="handle" type="text" maxlength="20" autocomplete="off" autocapitalize="off" required>' +
      '<p class="cf-hint">3 a 20 caracteres: letras minúsculas, números e _.</p></div>' +
      '<button class="cf-btn cf-btn-main" type="submit" data-label="Salvar ID">Salvar ID</button></form></div>';
    el.hidden = false;
    doc.documentElement.classList.add('cf-auth-open');
    var app = doc.getElementById('app'); if (app) app.setAttribute('inert', '');
    var t = el.querySelector('.cf-title'); if (t) try { t.focus(); } catch (e) {}
  }

  function hide() {
    var el = doc.getElementById('cf-idgate');
    shownFor = null;
    if (el) { el.hidden = true; el.innerHTML = ''; }
    if (!authOpen()) { doc.documentElement.classList.remove('cf-auth-open'); var app = doc.getElementById('app'); if (app) app.removeAttribute('inert'); }
  }

  function msg(text, kind) {
    var el = doc.querySelector('#cf-idgate [data-msg]');
    if (!el) return;
    el.textContent = text; el.className = 'cf-msg' + (kind === 'error' ? ' error' : ''); el.hidden = !text;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    var h = String((e.target.elements.handle && e.target.elements.handle.value) || '').trim().toLowerCase();
    if (!RE.test(h)) return msg(MSG.invalid_handle, 'error');
    var c = client();
    if (!c) return msg('Sem conexão. Tente de novo.', 'error');
    busy = true; msg('');
    var r = await c.rpc('set_my_handle', { p: { handle: h } });
    busy = false;
    if (r.error) {
      var m = (r.error.message || r.error.code || '');
      var key = Object.keys(MSG).filter(function (k) { return m.indexOf(k) >= 0; })[0];
      return msg(key ? MSG[key] : 'Não foi possível salvar agora. Tente de novo.', 'error');
    }
    hide();
  }

  /* Confere o ID do usuário logado. Sem ID -> mostra a tela de escolha. */
  async function check(snap) {
    var u = snap && snap.user;
    if (!u) { hide(); return; }
    if (shownFor === u.id) return;
    var c = client();
    if (!c) return;
    try {
      var r = await c.from('profiles').select('handle').eq('id', u.id).maybeSingle();
      if (r.error || !r.data) return; /* erro de rede: não bloqueia; a próxima mudança de estado confere de novo */
      if (!r.data.handle) show(u.id); else hide();
    } catch (err) { /* sem bloqueio por falha de rede */ }
  }

  function start() {
    if (!global.CrowfitAuth) return;
    CrowfitAuth.onChange(check);
    CrowfitAuth.init().then(function () { check(CrowfitAuth.getState()); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})(window, document);
