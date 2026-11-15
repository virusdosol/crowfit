// Crowfit: escolhe quais eventos enviar por Web Push e monta o conteúdo da notificação.
// Usado por index.ts (push-dispatch). NÃO contém segredos.
// STATUS: escrito sem testes contra o original. Confirmar com um envio real antes de confiar.

// Regras:
//   * só envia para quem tem pelo menos uma inscrição de push (subUsers);
//   * nunca reenvia um evento já enviado (sentKeys, chave "user|key");
//   * no máximo `max` envios por pessoa por dia (counts, já contados nas últimas 24h);
//   * mantém a ordem cronológica dos eventos.
export function selectToSend({ events, sentKeys, subUsers, counts, max }) {
  const plan = [];
  const usedToday = new Map(counts || []);
  const sent = sentKeys || new Set();
  const subs = subUsers || new Set();

  for (const ev of events || []) {
    if (!ev || !ev.user_id || !ev.key) continue;
    if (!subs.has(ev.user_id)) continue;
    if (sent.has(ev.user_id + "|" + ev.key)) continue;

    const n = usedToday.get(ev.user_id) || 0;
    if (n >= max) continue;

    plan.push(ev);
    usedToday.set(ev.user_id, n + 1);
    sent.add(ev.user_id + "|" + ev.key); // evita duplicar dentro do mesmo lote
  }
  return plan;
}

// Conteúdo que o sw.js recebe no evento "push":
//   { title, body, tag, action }
// action diz para qual tela abrir ao tocar: "amigos", "desafios" ou "home".
export function pushPayload(ev) {
  const action = ev.action || "home";
  return JSON.stringify({
    title: ev.title || "Crowfit",
    body: ev.body || "",
    tag: "crowfit-" + (ev.type || "geral"),
    action: action,
  });
}
