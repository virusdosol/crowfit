/* Crowfit: deslize lateral tipo "stories" entre páginas vizinhas.
   Arrasta com o dedo mostrando a página vizinha; solta e completa se passou de 25% da largura.
   Não é infinito: nas pontas da lista não arrasta. Usado pelo perfil (Perfil/Evolução) e por Amigos. */
(function (root) {
  "use strict";
  var ANIM = 240;

  function attach(vp, cfg) {
    var sx = null, sy = null, mode = null, dir = 0, dx = 0, saved = null, tr = null, base = 0, busy = false;

    function setX(px, animate) {
      tr.style.transition = animate ? "transform " + ANIM + "ms cubic-bezier(.2,.7,.2,1)" : "none";
      tr.style.transform = "translateX(calc(" + base + "% + " + px + "px))";
    }

    function begin(nextHtml, d) {
      saved = vp.innerHTML; dir = d;
      var first = d > 0 ? saved : nextHtml, second = d > 0 ? nextHtml : saved;
      vp.innerHTML = '<div class="cw-sl-vp"><div class="cw-sl-tr"><div class="cw-sl-pg">' + first +
        '</div><div class="cw-sl-pg">' + second + '</div></div></div>';
      tr = vp.querySelector(".cw-sl-tr");
      base = d > 0 ? 0 : -50;
      setX(0, false);
    }

    function finish(ok) {
      if (!tr) return;
      var w = vp.clientWidth || 1;
      busy = true;
      if (ok) {
        tr.style.transition = "transform " + ANIM + "ms cubic-bezier(.2,.7,.2,1)";
        tr.style.transform = "translateX(" + (dir > 0 ? "-50%" : "0px") + ")";
        setTimeout(function () { tr = null; busy = false; cfg.commit(dir); }, ANIM + 30);
      } else {
        base = base; setX(0, true);
        setTimeout(function () { vp.innerHTML = saved; tr = null; saved = null; busy = false; }, ANIM + 30);
      }
    }

    vp.addEventListener("touchstart", function (e) {
      if (busy || (cfg.busy && cfg.busy()) || !e.touches || e.touches.length !== 1) { sx = null; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; mode = null; dx = 0;
    }, { passive: true });

    vp.addEventListener("touchmove", function (e) {
      if (sx == null || !e.touches) return;
      var t = e.touches[0], ax = t.clientX - sx, ay = t.clientY - sy;
      if (mode === null) {
        if (Math.abs(ax) < 10 && Math.abs(ay) < 10) return;
        if (Math.abs(ay) > Math.abs(ax)) { mode = "v"; return; }
        var d = ax < 0 ? 1 : -1, nxt = cfg.neighbour(d);
        if (nxt == null) { mode = "x"; return; }
        mode = "h"; begin(nxt, d);
      }
      if (mode !== "h") return;
      if (e.cancelable) e.preventDefault();
      dx = ax;
      if (dir > 0 && dx > 0) dx = 0;
      if (dir < 0 && dx < 0) dx = 0;
      setX(dx, false);
    }, { passive: false });

    vp.addEventListener("touchend", function () {
      var was = mode; sx = null; mode = null;
      if (was === "h") finish(Math.abs(dx) > (vp.clientWidth || 1) * 0.25);
    }, { passive: true });

    vp.addEventListener("touchcancel", function () {
      var was = mode; sx = null; mode = null;
      if (was === "h") finish(false);
    }, { passive: true });
  }

  root.CrowSwipe = { attach: attach };
})(typeof self !== "undefined" ? self : this);
