/* Service worker do Crowfit.
   Versionamento: aumente CACHE_VERSION a cada publicação que mude arquivos.
   Só mexemos em caches que começam com o prefixo "crowfit-cache-"; caches de outros apps da mesma origem são preservados. */
var PREFIX = "crowfit-cache-";
var CACHE_VERSION = 2;
var CACHE = PREFIX + "v" + CACHE_VERSION;
var CORE = ["./", "./index.html", "./core.js", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-180.png", "./icon-maskable-512.png", "./mascot.png", "./logo.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function put(req, res) {
  if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
  return res;
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url), same = url.origin === self.location.origin;
  var isCode = same && (req.mode === "navigate" || /\.(html|js|json)$/.test(url.pathname) || url.pathname.slice(-1) === "/");
  if (isCode) {
    /* rede primeiro: o app novo chega assim que houver conexão; offline usa o cache */
    e.respondWith(fetch(req).then(function (res) { return put(req, res); }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match("./index.html"); });
    }));
  } else {
    /* imagens e fontes: cache primeiro, atualiza em segundo plano */
    e.respondWith(caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { return put(req, res); }).catch(function () { return hit; });
      return hit || net;
    }));
  }
});
