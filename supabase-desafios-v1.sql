-- =====================================================================
-- Crowfit — Desafios entre amigos (v1).
-- STATUS: REVISÃO. NÃO APLICADA. Testar primeiro em projeto de TESTE.
--         Não executar na produção sem autorização expressa.
--
-- PRÉ-REQUISITOS (já aplicados em produção):
--   supabase-amigos-v8.sql (friendships, profiles.handle),
--   supabase-sync.sql (cf_lock_user, user_progress, xp_ledger),
--   supabase-xp-v7-fase2c.sql (cf_grant_xp; XP da trilha via 'tr:'),
--   supabase-xp-v10-trilha-dia-atual.sql e supabase-xp-v11-fuso-do-aparelho.sql
--   (cf_user_today).
--
-- PRINCÍPIOS:
--   * Não existe nova fonte de XP. Nada aqui concede pontos.
--   * O progresso competitivo vem SÓ de trail_grants: um espelho datado,
--     gravado por gatilho, de cada concessão de XP de unidade da trilha
--     ('tr:%') que o servidor já registrou no xp_ledger. O cliente nunca envia progresso.
--   * Só amigos aceitos podem ser convidados. Só membros veem o desafio.
--   * Sem acesso direto às tabelas: tudo passa por RPCs security definer.
--
-- REGRAS DE PROGRESSO (janela = starts_at até ends_at, pela hora do servidor):
--   xp      : soma das concessões de trilha na janela;
--   units   : quantidade de unidades concluídas (com XP) na janela;
--   days    : quantidade de dias distintos (dia da unidade, fuso da conta) na janela.
--
-- LIMITAÇÕES CONHECIDAS:
--   * Desafios só contam trilha concluída A PARTIR desta migração (não há
--     datas para o XP antigo, então ele não é retroagido).
--   * Quem aceita depois do início entra com janela menor (a tela avisa).
--     Convite vale por 2 dias ou até o término.
--
-- Idempotente. Não apaga nem altera dados existentes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Espelho datado das concessões de trilha
-- ---------------------------------------------------------------------
create table if not exists public.trail_grants (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  amount     integer not null,
  day        date not null,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);
alter table public.trail_grants enable row level security;
revoke all on public.trail_grants from anon, authenticated;

create or replace function public.cf_log_trail_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trail_grants (user_id, key, amount, day)
  values (new.user_id, new.key, new.amount, public.cf_user_today(new.user_id))
  on conflict (user_id, key) do nothing;
  return new;
end;
$$;
revoke all on function public.cf_log_trail_grant() from public, anon, authenticated;

drop trigger if exists cf_log_trail_grant on public.xp_ledger;
create trigger cf_log_trail_grant
  after insert on public.xp_ledger
  for each row when (new.key like 'tr:%')
  execute function public.cf_log_trail_grant();

-- ---------------------------------------------------------------------
-- 2) Desafios e participantes
-- ---------------------------------------------------------------------
create table if not exists public.challenges (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid not null references auth.users (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 40),
  metric        text not null check (metric in ('xp', 'units', 'days')),
  target        integer not null check (target between 1 and 100000),
  duration_days smallint not null check (duration_days in (3, 7, 14, 30)),
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz not null,
  created_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  status       text not null check (status in ('invited', 'accepted', 'declined')),
  responded_at timestamptz,
  primary key (challenge_id, user_id)
);
create index if not exists challenge_members_user_idx on public.challenge_members (user_id);

alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
revoke all on public.challenges from anon, authenticated;
revoke all on public.challenge_members from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Progresso de um participante (somente leitura, do espelho)
-- ---------------------------------------------------------------------
create or replace function public.cf_challenge_progress(p_ch uuid, p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case c.metric
      when 'xp'    then sum(g.amount)::integer
      when 'units' then count(g.id)::integer
      when 'days'  then count(distinct g.day)::integer
    end, 0)
  from public.challenges as c
  left join public.trail_grants as g
    on g.user_id = p_uid and g.created_at >= c.starts_at and g.created_at < c.ends_at
  where c.id = p_ch
  group by c.metric
$$;
revoke all on function public.cf_challenge_progress(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) create_challenge: cria o desafio e convida amigos aceitos
--    p = { title, metric, target, duration_days, handles: [ "id1", ... ] }
-- ---------------------------------------------------------------------
create or replace function public.create_challenge(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  v_title text;
  v_metric text;
  v_target integer;
  v_dur   integer;
  v_h     text;
  v_to    uuid;
  v_id    uuid;
  v_ends  timestamptz;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  v_title := btrim(p ->> 'title');
  if v_title is null or char_length(v_title) not between 1 and 40 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;

  v_metric := p ->> 'metric';
  if v_metric is null or v_metric not in ('xp', 'units', 'days') then
    raise exception 'invalid_metric' using errcode = '22023';
  end if;

  if jsonb_typeof(p -> 'duration_days') is distinct from 'number'
     or (p ->> 'duration_days')::numeric not in (3, 7, 14, 30) then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  v_dur := (p ->> 'duration_days')::integer;

  if jsonb_typeof(p -> 'target') is distinct from 'number' then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  v_target := floor((p ->> 'target')::numeric)::integer;
  if (v_metric = 'xp' and v_target not between 10 and 100000)
     or (v_metric = 'units' and v_target not between 1 and 500)
     or (v_metric = 'days' and v_target not between 1 and v_dur) then
    raise exception 'invalid_target' using errcode = '22023';
  end if;

  if jsonb_typeof(p -> 'handles') is distinct from 'array'
     or jsonb_array_length(p -> 'handles') not between 1 and 5 then
    raise exception 'invalid_handles' using errcode = '22023';
  end if;

  perform public.cf_lock_user(uid);

  if (select count(*) from public.challenges where creator_id = uid and ends_at > now()) >= 10 then
    raise exception 'too_many_challenges' using errcode = '22023';
  end if;

  v_ends := now() + make_interval(days => v_dur);
  insert into public.challenges (creator_id, title, metric, target, duration_days, starts_at, ends_at)
  values (uid, v_title, v_metric, v_target, v_dur, now(), v_ends)
  returning id into v_id;

  insert into public.challenge_members (challenge_id, user_id, status, responded_at)
  values (v_id, uid, 'accepted', now());

  for v_h in select lower(btrim(x #>> '{}')) from jsonb_array_elements(p -> 'handles') as x loop
    select pr.id into v_to from public.profiles as pr where pr.handle = v_h;
    if not found then
      raise exception 'user_not_found' using errcode = 'P0002';
    end if;
    if v_to = uid then
      raise exception 'invalid_invite' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.friendships as f
       where f.status = 'accepted'
         and ((f.requester_id = uid and f.addressee_id = v_to) or (f.requester_id = v_to and f.addressee_id = uid))
    ) then
      raise exception 'not_friends' using errcode = '42501';
    end if;
    insert into public.challenge_members (challenge_id, user_id, status)
    values (v_id, v_to, 'invited')
    on conflict (challenge_id, user_id) do nothing;
  end loop;

  return jsonb_build_object('id', v_id, 'ends_at', v_ends);
end;
$$;
revoke all on function public.create_challenge(jsonb) from public, anon;
grant execute on function public.create_challenge(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5) respond_challenge: convidado aceita ou recusa
--    p = { id, accept: true | false }
-- ---------------------------------------------------------------------
create or replace function public.respond_challenge(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_ch public.challenges;
  v_st text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'accept') is distinct from 'boolean' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  begin
    v_id := (p ->> 'id')::uuid;
  exception when others then
    raise exception 'invalid_payload' using errcode = '22023';
  end;

  select c.* into v_ch from public.challenges as c where c.id = v_id;
  if not found then
    raise exception 'not_invited' using errcode = 'P0002';
  end if;
  select m.status into v_st from public.challenge_members as m where m.challenge_id = v_id and m.user_id = uid;
  if v_st is distinct from 'invited' then
    raise exception 'not_invited' using errcode = 'P0002';
  end if;
  if v_ch.ends_at <= now() then
    raise exception 'challenge_ended' using errcode = '22023';
  end if;
  if v_ch.created_at + interval '2 days' < now() then
    raise exception 'invite_expired' using errcode = '22023';
  end if;

  perform public.cf_lock_user(uid);
  update public.challenge_members
     set status = case when (p ->> 'accept')::boolean then 'accepted' else 'declined' end,
         responded_at = now()
   where challenge_id = v_id and user_id = uid;

  return jsonb_build_object('status', case when (p ->> 'accept')::boolean then 'accepted' else 'declined' end);
end;
$$;
revoke all on function public.respond_challenge(jsonb) from public, anon;
grant execute on function public.respond_challenge(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 6) leave_challenge: participante (não o criador) sai do desafio
--    p = { id }
-- ---------------------------------------------------------------------
create or replace function public.leave_challenge(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_ch public.challenges;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  begin
    v_id := (p ->> 'id')::uuid;
  exception when others then
    raise exception 'invalid_payload' using errcode = '22023';
  end;

  select c.* into v_ch from public.challenges as c where c.id = v_id;
  if not found then
    raise exception 'not_member' using errcode = 'P0002';
  end if;
  if v_ch.creator_id = uid then
    raise exception 'creator_cannot_leave' using errcode = '22023';
  end if;
  if v_ch.ends_at <= now() then
    raise exception 'challenge_ended' using errcode = '22023';
  end if;
  if not exists (select 1 from public.challenge_members m
                  where m.challenge_id = v_id and m.user_id = uid and m.status = 'accepted') then
    raise exception 'not_member' using errcode = 'P0002';
  end if;

  update public.challenge_members set status = 'declined', responded_at = now()
   where challenge_id = v_id and user_id = uid;
  return jsonb_build_object('status', 'declined');
end;
$$;
revoke all on function public.leave_challenge(jsonb) from public, anon;
grant execute on function public.leave_challenge(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 7) list_my_challenges: tudo que o usuário participa, já separado por aba.
--    Progresso só aparece para participantes aceitos. Convidados sem resposta
--    aparecem sem progresso.
-- ---------------------------------------------------------------------
create or replace function public.list_my_challenges(p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_out jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  with mine as (
    select c.id, c.creator_id, c.title, c.metric, c.target, c.duration_days,
           c.starts_at, c.ends_at, c.created_at,
           m.status as my_status,
           (c.creator_id = uid) as is_creator
      from public.challenges as c
      join public.challenge_members as m on m.challenge_id = c.id and m.user_id = uid
     where m.status in ('invited', 'accepted')
        or c.creator_id = uid
     order by c.created_at desc
     limit 200
  ),
  rws as (
    select mine.*,
      (select jsonb_agg(jsonb_build_object(
                'handle', pr.handle,
                'name', pr.display_name,
                'status', cm.status,
                'me', cm.user_id = uid,
                'progress', case when cm.status = 'accepted'
                                 then public.cf_challenge_progress(mine.id, cm.user_id) end)
              order by cm.status, pr.handle)
         from public.challenge_members as cm
         join public.profiles as pr on pr.id = cm.user_id
        where cm.challenge_id = mine.id and cm.status in ('invited', 'accepted')) as members
    from mine
  )
  select jsonb_build_object(
    'server_now', now(),
    'received', coalesce((select jsonb_agg(to_jsonb(r)) from rws r
                           where r.my_status = 'invited' and r.ends_at > now()
                             and r.created_at + interval '2 days' >= now()), '[]'::jsonb),
    'sent',     coalesce((select jsonb_agg(to_jsonb(r)) from rws r where r.is_creator), '[]'::jsonb),
    'active',   coalesce((select jsonb_agg(to_jsonb(r)) from rws r
                           where r.my_status = 'accepted' and r.ends_at > now()), '[]'::jsonb),
    'finished', coalesce((select jsonb_agg(to_jsonb(r)) from rws r
                           where r.my_status = 'accepted' and r.ends_at <= now()), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;
revoke all on function public.list_my_challenges(jsonb) from public, anon;
grant execute on function public.list_my_challenges(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 8) Verificação (somente leitura): deve retornar true
-- ---------------------------------------------------------------------
select 'desafios v1 aplicados' as check_name,
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'challenges')
  and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'challenge_members')
  and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'trail_grants')
  and exists (select 1 from pg_trigger where tgname = 'cf_log_trail_grant')
  and (select count(*) from information_schema.routine_privileges
        where routine_schema = 'public' and grantee = 'authenticated'
          and routine_name in ('create_challenge', 'respond_challenge', 'leave_challenge', 'list_my_challenges')) = 4
  as ok;
