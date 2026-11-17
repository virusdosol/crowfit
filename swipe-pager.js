/* Crowfit: deslize lateral tipo "stories" entre páginas vizinhas.
   Os elementos da página atual são MOVIDOS (não regravados), então nada é duplicado.
   Arrasta mostrando a vizinha; solta e completa se passou de 25% da largura; senão volta.
   Não é infinito: nas pontas não arrasta. Usado pelo perfil (Perfil/Evolução) e por Amigos. */
(function (root) {
  "use strict";
  var ANIM = 240;

  function attach(vp, cfg) {
    var sx = null, sy = null, mode = null, dir = 0, dx = 0;
    var wrap = null, tr = null, pa = null, base = 0, busy = false;

    function setX(px, animate) {
      tr.style.transition = animate ? "transform " + ANIM + "ms cubic-bezier(.2,.7,.2,1)" : "none";
      tr.style.transform = "translateX(calc(" + base + "% + " + px + "px))";
    }

    /* cfg.keep(no) -> true para elementos que ficam FIXOS fora do slide (ex.: cabeçalho). */
    function movable(no) { return !(cfg.keep && cfg.keep(no)); }

    function begin(nextHtml, d) {
      dir = d;
      wrap = document.createElement("div"); wrap.className = "cw-sl-vp";
      tr = document.createElement("div"); tr.className = "cw-sl-tr";
      pa = document.createElement("div"); pa.className = "cw-sl-pg";
      var pb = document.createElement("div"); pb.className = "cw-sl-pg"; pb.innerHTML = nextHtml;
      Array.prototype.slice.call(vp.childNodes).filter(movable).forEach(function (n) { pa.appendChild(n); });
      if (d > 0) { tr.appendChild(pa); tr.appendChild(pb); } else { tr.appendChild(pb); tr.appendChild(pa); }
      wrap.appendChild(tr); vp.appendChild(wrap);
      base = d > 0 ? 0 : -50;
      setX(0, false);
    }

    function restore() {
      if (wrap && wrap.parentNode === vp) vp.removeChild(wrap);
      if (pa) while (pa.firstChild) vp.appendChild(pa.firstChild);
      wrap = tr = pa = null; busy = false;
    }

    function finish(ok) {
      if (!tr) return;
      busy = true;
      if (ok) {
        tr.style.transition = "transform " + ANIM + "ms cubic-bezier(.2,.7,.2,1)";
        tr.style.transform = "translateX(" + (dir > 0 ? "-50%" : "0px") + ")";
        setTimeout(function () { wrap = tr = pa = null; busy = false; cfg.commit(dir); }, ANIM + 30);
      } else {
        setX(0, true);
        setTimeout(restore, ANIM + 30);
      }
    }

    vp.addEventListener("touchstart", function (e) {
      if (busy || tr || (cfg.busy && cfg.busy()) || !e.touches || e.touches.length !== 1) { sx = null; return; }
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
