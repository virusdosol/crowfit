// Crowfit: envio de Web Push a partir de notification_events.
// Segredos (Supabase > Edge Functions > Secrets), NUNCA no front-end:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:voce@exemplo.com),
//   PUSH_CRON_SECRET (valor aleatório longo, usado pelo agendador).
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são fornecidos pelo ambiente.
// STATUS: não testado aqui. Testar no projeto de TESTE antes da produção.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { selectToSend, pushPayload } from "./select.js";

const MAX_PER_DAY = 3;      /* mesmo limite da central */
const WINDOW_HOURS = 72;    /* só envia eventos recentes: nada de avisos antigos */

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" || req.headers.get("x-cron-secret") !== Deno.env.get("PUSH_CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();

  const { data: events, error: e1 } = await sb.from("notification_events")
    .select("user_id,key,type,title,body,action,created_at")
    .gt("created_at", since).order("created_at", { ascending: true }).limit(500);
  if (e1) return new Response(JSON.stringify({ error: "events" }), { status: 500 });

  const { data: sent } = await sb.from("push_sent").select("user_id,key,sent_at").gt("sent_at", day);
  const { data: subs } = await sb.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth_key");

  const sentKeys = new Set<string>((sent || []).map((s: any) => s.user_id + "|" + s.key));
  const counts = new Map<string, number>();
  (sent || []).forEach((s: any) => counts.set(s.user_id, (counts.get(s.user_id) || 0) + 1));
  const subUsers = new Set<string>((subs || []).map((s: any) => s.user_id));
  const { data: prefs } = await sb.from("notif_prefs").select("user_id,social");
  const offCats = new Map<string, Set<string>>();
  (prefs || []).forEach((r: any) => { if (r.social === false) offCats.set(r.user_id, new Set(["social"])); });

  const plan = selectToSend({ events: events || [], sentKeys, subUsers, counts, max: MAX_PER_DAY, offCats });
  let delivered = 0, removed = 0;

  for (const ev of plan) {
    const mine = (subs || []).filter((s: any) => s.user_id === ev.user_id);
    let any = false;
    for (const s of mine) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          pushPayload(ev),
          { TTL: 3600, urgency: "normal" },
        );
        any = true;
        await sb.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
      } catch (err: any) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);   /* inscrição expirada */
          removed++;
        }
      }
    }
    if (any) {
      await sb.from("push_sent").upsert({ user_id: ev.user_id, key: ev.key, sent_at: new Date().toISOString() },
        { onConflict: "user_id,key" });
      delivered++;
    }
  }

  return new Response(JSON.stringify({ delivered, removed, candidates: plan.length }),
    { headers: { "content-type": "application/json" } });
});
