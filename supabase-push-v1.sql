-- =====================================================================
-- Crowfit — Web Push (v1): inscrições, eventos e deduplicação.
-- STATUS: REVISÃO. NÃO APLICADA. Testar primeiro em projeto de TESTE.
--         Não executar na produção sem autorização expressa.
--
-- PRÉ-REQUISITOS: supabase-amigos-v8.sql (friendships, profiles.handle),
--   supabase-desafios-v1.sql (challenges, challenge_members).
--
-- PRINCÍPIOS:
--   * Mesma chave de deduplicação da central do app (notif.js): "freq:HANDLE",
--     "fok:HANDLE", "cinv:ID", "cres:ID". Assim o aviso do sistema e o item da
--     central usam a mesma identidade, e a tag do aviso não duplica.
--   * Evento só é criado por fato real do banco (gatilho ou emissão por prazo).
--   * Sem acesso direto às tabelas. Inscrições: RPC própria. Envio: função de
--     servidor com a chave de serviço (que nunca vai ao front-end).
--   * Chaves VAPID: a pública pode estar no app; a PRIVADA só em segredo do servidor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Inscrições de push (um dispositivo = um endpoint)
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id           bigserial primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  endpoint     text not null unique check (endpoint like 'https://%' and char_length(endpoint) between 20 and 2000),
  p256dh       text not null check (char_length(p256dh) between 20 and 200),
  auth_key     text not null check (char_length(auth_key) between 10 and 100),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Eventos para a central e para o envio (uma linha por chave e conta)
-- ---------------------------------------------------------------------
create table if not exists public.notification_events (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  type       text not null,
  title      text not null check (char_length(title) between 1 and 80),
  body       text not null default '' check (char_length(body) <= 200),
  action     text not null default 'home',
  created_at timestamptz not null default now(),
  unique (user_id, key)
);
alter table public.notification_events enable row level security;
revoke all on public.notification_events from anon, authenticated;

-- Registro do que já foi enviado por push (evita reenvio).
create table if not exists public.push_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  key     text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_sent enable row level security;
revoke all on public.push_sent from anon, authenticated;

create or replace function public.cf_emit_event(p_user uuid, p_key text, p_type text,
                                                p_title text, p_body text, p_action text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_events (user_id, key, type, title, body, action)
  values (p_user, p_key, p_type, p_title, coalesce(p_body, ''), coalesce(p_action, 'home'))
  on conflict (user_id, key) do nothing
$$;
revoke all on function public.cf_emit_event(uuid, text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Gatilhos nos fatos reais (mesmas chaves da central)
-- ---------------------------------------------------------------------
-- Pedido de amizade recebido (quem recebe = addressee).
create or replace function public.cf_trg_friend_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_h text;
begin
  if new.status = 'pending' then
    select p.handle into v_h from public.profiles as p where p.id = new.requester_id;
    if v_h is not null then
      perform public.cf_emit_event(new.addressee_id, 'freq:' || v_h, 'friend_req',
        'Novo pedido de amizade', '@' || v_h || ' quer ser seu amigo.', 'amigos');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists cf_trg_friend_request on public.friendships;
create trigger cf_trg_friend_request after insert on public.friendships
  for each row execute function public.cf_trg_friend_request();

-- Pedido aceito (quem recebe = requester; a chave usa o handle de quem aceitou).
create or replace function public.cf_trg_friend_accepted()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_h text;
begin
  if old.status = 'pending' and new.status = 'accepted' then
    select p.handle into v_h from public.profiles as p where p.id = new.addressee_id;
    if v_h is not null then
      perform public.cf_emit_event(new.requester_id, 'fok:' || v_h, 'friend_ok',
        'Pedido de amizade aceito', '@' || v_h || ' aceitou seu pedido.', 'amigos');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists cf_trg_friend_accepted on public.friendships;
create trigger cf_trg_friend_accepted after update on public.friendships
  for each row execute function public.cf_trg_friend_accepted();

-- Convite para desafio (quem recebe = convidado).
create or replace function public.cf_trg_challenge_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_t text;
begin
  if new.status = 'invited' then
    select c.title into v_t from public.challenges as c where c.id = new.challenge_id;
    perform public.cf_emit_event(new.user_id, 'cinv:' || new.challenge_id::text, 'challenge_inv',
      'Convite para desafio', 'Você foi convidado para “' || coalesce(v_t, 'um desafio') || '”.', 'desafios');
  end if;
  return new;
end $$;
drop trigger if exists cf_trg_challenge_invite on public.challenge_members;
create trigger cf_trg_challenge_invite after insert on public.challenge_members
  for each row execute function public.cf_trg_challenge_invite();

-- Resultado de desafio: emitido quando o prazo termina (por função agendada).
-- Só desafios que terminaram nas últimas 6 horas, para não avisar histórico antigo.
create or replace function public.cf_emit_challenge_results()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_n integer := 0;
begin
  for r in
    select c.id, c.title, m.user_id
      from public.challenges as c
      join public.challenge_members as m on m.challenge_id = c.id and m.status = 'accepted'
     where c.ends_at <= now() and c.ends_at > now() - interval '6 hours'
  loop
    perform public.cf_emit_event(r.user_id, 'cres:' || r.id::text, 'challenge_res',
      'Resultado de desafio', 'O desafio “' || r.title || '” terminou. Veja o resultado.', 'desafios');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.cf_emit_challenge_results() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) RPCs de inscrição (o próprio usuário)
-- ---------------------------------------------------------------------
create or replace function public.save_my_push_subscription(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_ep text;
  v_p256 text;
  v_auth text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p -> 'subscription') is distinct from 'object'
     or jsonb_typeof(p -> 'subscription' -> 'keys') is distinct from 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  v_ep   := p -> 'subscription' ->> 'endpoint';
  v_p256 := p -> 'subscription' -> 'keys' ->> 'p256dh';
  v_auth := p -> 'subscription' -> 'keys' ->> 'auth';
  if v_ep is null or v_p256 is null or v_auth is null then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key)
  values (uid, v_ep, v_p256, v_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh,
        auth_key = excluded.auth_key, last_used_at = now();
  return jsonb_build_object('status', 'saved');
end $$;
revoke all on function public.save_my_push_subscription(jsonb) from public, anon;
grant execute on function public.save_my_push_subscription(jsonb) to authenticated;

create or replace function public.delete_my_push_subscription(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p -> 'endpoint') is distinct from 'string' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  delete from public.push_subscriptions
   where user_id = auth.uid() and endpoint = p ->> 'endpoint';
  return jsonb_build_object('status', 'removed');
end $$;
revoke all on function public.delete_my_push_subscription(jsonb) from public, anon;
grant execute on function public.delete_my_push_subscription(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Verificação (somente leitura): deve retornar true
-- ---------------------------------------------------------------------
select 'push v1 aplicado' as check_name,
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'push_subscriptions')
  and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'notification_events')
  and exists (select 1 from pg_trigger where tgname = 'cf_trg_friend_request')
  and exists (select 1 from pg_trigger where tgname = 'cf_trg_challenge_invite')
  and (select count(*) from information_schema.routine_privileges
        where routine_schema = 'public' and grantee = 'authenticated'
          and routine_name in ('save_my_push_subscription', 'delete_my_push_subscription')) = 2
  as ok;
