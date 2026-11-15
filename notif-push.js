/* Crowfit: inscrição no Web Push (cliente).
   Só a chave PÚBLICA VAPID vive no app. A privada fica no servidor (segredo).
   Enquanto VAPID_PUBLIC_KEY estiver vazia, o recurso fica desligado e o app não quebra. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.NOTIFPUSH = f(); })(typeof self !== "undefined" ? self : this, function () {
"use strict";

/* Preencher depois de gerar o par de chaves (ver instruções). Ex.: "BLx...". */
var VAPID_PUBLIC_KEY = "BMwQQLHIdA-5l5Pj79zecWSj9L5sDTX-6iGE1WQspLphiKL5QJjl66bD1VVHD9d6uOODRfjpOlPNhix5ifHkHtk";

function urlB64ToUint8Array(b64) {
  var pad = "=".repeat((4 - (b64.length % 4)) % 4);
  var base = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  var raw = atob(base), out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* Disponível só com navegador compatível, service worker, chave configurada e Notification. */
function supported() {
  return !!(VAPID_PUBLIC_KEY && typeof navigator !== "undefined" && "serviceWorker" in navigator &&
    typeof window !== "undefined" && "PushManager" in window && typeof Notification !== "undefined");
}

/* Ativa: pede permissão (só chamado após clique do usuário), inscreve e salva no servidor. */
async function enable(client) {
  if (!supported()) throw new Error("push_unsupported");
  if (!client) throw new Error("not_authenticated");
  if (Notification.permission !== "granted") {
    var p = await Notification.requestPermission();
    if (p !== "granted") throw new Error("permission_denied");
  }
  var reg = await navigator.serviceWorker.ready;
  var sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) });
  }
  var j = sub.toJSON();
  var r = await client.rpc("save_my_push_subscription", { p: { subscription: { endpoint: j.endpoint, keys: j.keys } } });
  if (r.error) throw r.error;
  return true;
}

/* Desativa neste aparelho: cancela a inscrição do navegador e remove do servidor. */
async function disable(client) {
  if (!supported()) return false;
  var reg = await navigator.serviceWorker.ready;
  var sub = await reg.pushManager.getSubscription();
  if (!sub) return true;
  var ep = sub.endpoint;
  await sub.unsubscribe();
  if (client) await client.rpc("delete_my_push_subscription", { p: { endpoint: ep } });
  return true;
}

return { VAPID_PUBLIC_KEY: VAPID_PUBLIC_KEY, supported: supported, enable: enable, disable: disable, urlB64ToUint8Array: urlB64ToUint8Array };
});
