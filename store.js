/* Crowfit: armazenamento local separado por conta. Sem DOM; recebe o storage como parâmetro (testável em Node).
   - Cada conta usa a chave "corvofit-v2:u:<UID do Supabase>". O e-mail nunca é usado como identificador.
   - A chave histórica "corvofit-v1" (dados anteriores às contas) NUNCA é apagada nem reescrita por este módulo.
   - Adoção do legado: uma única conta pode adotá-lo (marcador "corvofit-v2:legacy-owner"), por decisão explícita do usuário.
   - Nunca sobrescreve uma partição que já existe. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.CFStore = f(); })(typeof self !== "undefined" ? self : this, function () {
"use strict";
var LEGACY = "corvofit-v1", NS = "corvofit-v2:u:", OWNER = "corvofit-v2:legacy-owner", DECL = "corvofit-v2:legacy-declined:", UID_RE = /^[0-9a-fA-F-]{16,64}$/;

function uidOk(u) { return typeof u === "string" && UID_RE.test(u); }
function key(u) { if (!uidOk(u)) throw new Error("UID inválido"); return NS + u; }
function get(ls, k) { try { return ls.getItem(k); } catch (e) { return null; } }
function put(ls, k, v) { ls.setItem(k, v); if (ls.getItem(k) !== v) throw new Error("a verificação da gravação falhou"); }

/* none: não há dados legados | owned-other: já pertencem a outra conta | declined: esta conta recusou
   invalid: legado ilegível (fica guardado, não é oferecido) | offer: pode ser oferecido a esta conta */
function legacyStatus(ls, uid, validFn) {
  var raw = get(ls, LEGACY); if (raw == null) return "none";
  var ow = get(ls, OWNER);
  if (ow && ow !== uid) return "owned-other";
  if (!ow && get(ls, DECL + uid)) return "declined";
  if (typeof validFn === "function" && !validFn(raw)) return "invalid";
  return "offer";
}

function adopt(ls, uid) {
  var raw = get(ls, LEGACY); if (raw == null) return { ok: false, reason: "none" };
  var ow = get(ls, OWNER); if (ow && ow !== uid) return { ok: false, reason: "owned-other" };
  var k = key(uid);
  if (get(ls, k) != null) return { ok: false, reason: "exists" }; /* nunca sobrescreve dados da conta */
  try { put(ls, k, raw); } catch (e) { try { ls.removeItem(k); } catch (x) {} return { ok: false, reason: "write" }; }
  try { put(ls, OWNER, uid); } catch (e2) { try { ls.removeItem(k); } catch (x2) {} return { ok: false, reason: "write" }; }
  if (get(ls, OWNER) !== uid) return { ok: false, reason: "race" };
  return { ok: true };
}

function decline(ls, uid) { try { put(ls, DECL + uid, "1"); return true; } catch (e) { return false; } }

return { LEGACY: LEGACY, NS: NS, OWNER: OWNER, uidOk: uidOk, key: key, legacyStatus: legacyStatus, adopt: adopt, decline: decline };
});
