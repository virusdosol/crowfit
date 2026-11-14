-- =====================================================================
-- Crowfit — Etapa 2: banco de dados para sincronização
-- Onde: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pré-requisito: supabase-profiles.sql (ou o -fix) já aplicado.
-- Idempotente: pode rodar mais de uma vez. Não apaga nem altera dados existentes.
--
-- Modelo de segurança:
--   * Tabelas novas: o app só LÊ (SELECT + RLS). Toda escrita passa por RPCs
--     security definer que usam SEMPRE auth.uid() (nunca um id vindo do cliente),
--     validam cada campo e fazem MESCLA ADITIVA sob trava de linha.
--   * Nada de peso, altura ou idade no servidor.
--   * Dados antigos nunca sobrescrevem dados novos: a mescla só soma/une/pega o máximo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Curva de XP (precisa existir ANTES da tabela, porque level é coluna gerada)
-- ---------------------------------------------------------------------
-- PARTE 1 — funções da curva (IMMUTABLE: resultado depende só do argumento)
-- ---------------------------------------------------------------------
-- XP do nível l: round(200 * 1.15^(l-1) / 5) * 5.
-- floor(x + 0.5) é igual ao Math.round do JS para valores positivos.
-- (round() do Postgres em double precision arredonda para par nos empates.)
create or replace function public.cf_xp_need(l integer)
returns integer
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select (pg_catalog.floor(200 * pg_catalog.power(1.15::double precision, l - 1) / 5 + 0.5))::integer * 5
$$;

-- Nível para p pontos: sobe enquanto o XP acumulado até o próximo nível couber em p.
-- Mesma lógica de xpLevelOf (limite de 100000 níveis, como no app).
create or replace function public.cf_level_for(points integer)
returns integer
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  l   integer := 1;
  acc bigint  := 0;
  n   integer;
begin
  loop
    n := public.cf_xp_need(l);
    exit when acc + n > points or l >= 100000;
    acc := acc + n;
    l := l + 1;
  end loop;
  return l;
end;
$$;

revoke all on function public.cf_xp_need(integer)  from public, anon, authenticated;
revoke all on function public.cf_level_for(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1) profiles: avatar (variações fixas do corvo; desbloqueio será regra futura)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_id text not null default 'corvo';

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.profiles'::regclass and conname = 'profiles_avatar_id_chk') then
    alter table public.profiles
      add constraint profiles_avatar_id_chk check (avatar_id ~ '^[a-z0-9_]{1,24}$');
  end if;
end
$$;

-- O cliente passa a poder atualizar display_name e avatar_id (nada além disso).
grant update (display_name, avatar_id) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 2) user_progress: 1 linha por usuário (XP, ofensiva, planos)
--    points = base_points + soma dos valores de rewards (calculado pelo servidor)
--    level  = derivado de points pela curva exponencial (public.cf_level_for, igual ao app)
-- ---------------------------------------------------------------------
create table if not exists public.user_progress (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  base_points       integer not null default 0 check (base_points between 0 and 10000000),
  points            integer not null default 0 check (points between 0 and 10000000),
  level             integer generated always as (public.cf_level_for(points)) stored,
  best_streak       integer not null default 0 check (best_streak between 0 and 100000),
  last_workout_date date,
  done_dates        date[] not null default '{}' check (cardinality(done_dates) <= 20000),
  plan_history      jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(plan_history) = 'array' and jsonb_array_length(plan_history) <= 200),
  rewards           jsonb not null default '{}'::jsonb check (jsonb_typeof(rewards) = 'object'),
  revision          bigint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.user_progress is
  'Progresso do usuário. Escrita só via merge_my_progress(); mescla aditiva, nunca regride.';

-- ---------------------------------------------------------------------
-- 3) workout_sessions: histórico (1 linha por sessão finalizada)
-- ---------------------------------------------------------------------
create table if not exists public.workout_sessions (
  user_id          uuid not null references auth.users (id) on delete cascade,
  session_id       text not null check (char_length(session_id) between 1 and 64),
  session_date     date not null,
  type             text not null check (type in ('P', 'L', 'C', 'F')),
  status           text not null check (status in ('completed', 'interrupted', 'abandoned')),
  extra            boolean not null default false,
  plan             smallint check (plan between 3 and 6),
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 86400),
  points           integer not null default 0 check (points between 0 and 100000),
  feedback         text check (feedback in ('hard', 'ok', 'easy')),
  exercises        jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) <= 40),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, session_id)
);
create index if not exists workout_sessions_user_date_idx
  on public.workout_sessions (user_id, session_date desc);

-- ---------------------------------------------------------------------
-- 4) achievements_unlocked: só o desbloqueio é persistido.
--    O catálogo vive no app; o servidor valida apenas o formato do id,
--    então novas conquistas não exigem novo SQL.
-- ---------------------------------------------------------------------
create table if not exists public.achievements_unlocked (
  user_id        uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null check (achievement_id ~ '^[a-z0-9_]{1,40}$'),
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ---------------------------------------------------------------------
-- 5) Permissões + RLS: cliente só LÊ as próprias linhas
-- ---------------------------------------------------------------------
revoke all on table public.user_progress        from public, anon, authenticated;
revoke all on table public.workout_sessions     from public, anon, authenticated;
revoke all on table public.achievements_unlocked from public, anon, authenticated;
grant select on table public.user_progress         to authenticated;
grant select on table public.workout_sessions      to authenticated;
grant select on table public.achievements_unlocked to authenticated;

alter table public.user_progress         enable row level security;
alter table public.workout_sessions      enable row level security;
alter table public.achievements_unlocked enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_progress' and policyname = 'user_progress_select_own') then
    create policy user_progress_select_own on public.user_progress
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workout_sessions' and policyname = 'workout_sessions_select_own') then
    create policy workout_sessions_select_own on public.workout_sessions
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'achievements_unlocked' and policyname = 'achievements_select_own') then
    create policy achievements_select_own on public.achievements_unlocked
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
end
$$;
-- Sem políticas de INSERT/UPDATE/DELETE e sem grants de escrita: só as RPCs abaixo escrevem.

-- ---------------------------------------------------------------------
-- 6) Auxiliares de validação (privados; nenhum acesso a tabelas)
-- ---------------------------------------------------------------------
create or replace function public.cf_int(j jsonb, lo bigint, hi bigint, field text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if j is null or jsonb_typeof(j) <> 'number' or (j #>> '{}') !~ '^[0-9]{1,10}$' then
    raise exception 'invalid_%', field using errcode = '22023';
  end if;
  if (j #>> '{}')::bigint < lo or (j #>> '{}')::bigint > hi then
    raise exception 'invalid_%', field using errcode = '22023';
  end if;
  return (j #>> '{}')::integer;
end;
$$;

create or replace function public.cf_date(j jsonb, field text, lo date)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  s text;
  d date;
begin
  if j is null or jsonb_typeof(j) <> 'string' then
    raise exception 'invalid_%', field using errcode = '22023';
  end if;
  s := j #>> '{}';
  if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'invalid_%', field using errcode = '22023';
  end if;
  begin
    d := s::date;
  exception when others then
    raise exception 'invalid_%', field using errcode = '22023';
  end;
  if d < lo or d > current_date + 2 then
    raise exception 'invalid_%', field using errcode = '22023';
  end if;
  return d;
end;
$$;

create or replace function public.cf_ts(j jsonb, field text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  s text;
  t timestamptz;
begin
  if j is null or jsonb_typeof(j) = 'null' then
    return null;
  end if;
  if jsonb_typeof(j) <> 'string' then
    raise exception 'invalid_%', field using errcode = '22023';
  end if;
  s := j #>> '{}';
  if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception 'invalid_%', field using errcode = '22023';
  end if;
  begin
    t := s::timestamptz;
  exception when others then
    raise exception 'invalid_%', field using errcode = '22023';
  end;
  if t < timestamptz '2020-01-01 00:00:00+00' or t > now() + interval '2 days' then
    raise exception 'invalid_%', field using errcode = '22023';
  end if;
  return t;
end;
$$;

revoke all on function public.cf_int(jsonb, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.cf_date(jsonb, text, date)          from public, anon, authenticated;
revoke all on function public.cf_ts(jsonb, text)                  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7) merge_my_progress(p jsonb): mescla o progresso enviado com o da conta.
--    Payload: { base_points, best_streak, last_workout_date|null,
--               done_dates:[ 'AAAA-MM-DD' ], plan_history:[ {from,dias} ],
--               rewards:{ id: valor } }
--    Regras (nunca regride):
--      base_points, best_streak, last_workout_date -> maior valor
--      done_dates -> união;  rewards -> união (valor já existente prevalece)
--      plan_history -> união por data "from" (na mesma data, o enviado prevalece)
--      points -> recalculado pelo servidor = base_points + soma(rewards)
--    Devolve a linha mesclada (o app adota o resultado).
-- ---------------------------------------------------------------------
create or replace function public.merge_my_progress(p jsonb)
returns public.user_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  cur     public.user_progress;
  res     public.user_progress;
  e       jsonb;
  v_base  integer;
  v_best  integer;
  v_last  date;
  v_done  date[];
  v_plan_in jsonb := '[]'::jsonb;
  v_plan  jsonb;
  v_rew_in jsonb;
  v_rew   jsonb;
  v_pts   bigint;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 2500000 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  v_base := public.cf_int(p -> 'base_points', 0, 10000000, 'base_points');
  v_best := public.cf_int(p -> 'best_streak', 0, 100000, 'best_streak');
  if p -> 'last_workout_date' is null or jsonb_typeof(p -> 'last_workout_date') = 'null' then
    v_last := null;
  else
    v_last := public.cf_date(p -> 'last_workout_date', 'last_workout_date', date '2020-01-01');
  end if;

  -- done_dates
  if jsonb_typeof(p -> 'done_dates') is distinct from 'array' or jsonb_array_length(p -> 'done_dates') > 20000 then
    raise exception 'invalid_done_dates' using errcode = '22023';
  end if;
  select coalesce(array_agg(d order by d), '{}'::date[]) into v_done
  from (select distinct public.cf_date(x, 'done_dates', date '2020-01-01') as d
        from jsonb_array_elements(p -> 'done_dates') x) s;

  -- plan_history (entrada validada)
  if jsonb_typeof(p -> 'plan_history') is distinct from 'array' or jsonb_array_length(p -> 'plan_history') > 200 then
    raise exception 'invalid_plan_history' using errcode = '22023';
  end if;
  for e in select value from jsonb_array_elements(p -> 'plan_history') loop
    if jsonb_typeof(e) <> 'object' then
      raise exception 'invalid_plan_history' using errcode = '22023';
    end if;
    v_plan_in := v_plan_in || jsonb_build_array(jsonb_build_object(
      'from', public.cf_date(e -> 'from', 'plan_history', date '1970-01-01')::text,
      'dias', public.cf_int(e -> 'dias', 3, 6, 'plan_history')));
  end loop;

  -- rewards (entrada validada)
  v_rew_in := p -> 'rewards';
  if jsonb_typeof(v_rew_in) is distinct from 'object' then
    raise exception 'invalid_rewards' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_each(v_rew_in)) > 20000 then
    raise exception 'invalid_rewards' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_each(v_rew_in)
    where char_length(key) > 80
       or key !~ '^[A-Za-z0-9:_.|-]+$'
       or jsonb_typeof(value) <> 'number'
       or case when (value #>> '{}') ~ '^[0-9]{1,4}$' then (value #>> '{}')::integer else -1 end not between 1 and 1000
  ) then
    raise exception 'invalid_rewards' using errcode = '22023';
  end if;

  -- trava a linha do próprio usuário (cria vazia se faltar)
  insert into public.user_progress (user_id) values (uid) on conflict (user_id) do nothing;
  select * into cur from public.user_progress where user_id = uid for update;

  -- mescla
  select coalesce(array_agg(d order by d), '{}'::date[]) into v_done
  from (select unnest(cur.done_dates) as d union select unnest(v_done)) s;

  v_rew := v_rew_in || cur.rewards;  -- em chave repetida, o valor já salvo prevalece

  select coalesce(sum((value #>> '{}')::integer), 0) into v_pts from jsonb_each(v_rew);
  v_pts := least(v_pts + greatest(cur.base_points, v_base), 10000000);

  select coalesce(jsonb_agg(x order by x ->> 'from'), '[]'::jsonb) into v_plan
  from (
    select x from (
      select distinct on (x ->> 'from') x
      from (
        select x, 1 as pri from jsonb_array_elements(cur.plan_history) x
        union all
        select x, 2 as pri from jsonb_array_elements(v_plan_in) x
      ) u
      order by x ->> 'from', pri desc
    ) m
    order by x ->> 'from' desc
    limit 200
  ) t;

  update public.user_progress set
    base_points       = greatest(cur.base_points, v_base),
    points            = v_pts::integer,
    best_streak       = greatest(cur.best_streak, v_best),
    last_workout_date = case when cur.last_workout_date is null then v_last
                             when v_last is null then cur.last_workout_date
                             else greatest(cur.last_workout_date, v_last) end,
    done_dates        = v_done,
    plan_history      = v_plan,
    rewards           = v_rew,
    revision          = cur.revision + 1,
    updated_at        = now()
  where user_id = uid
  returning * into res;

  return res;
end;
$$;

-- ---------------------------------------------------------------------
-- 8) upsert_my_sessions(p jsonb): grava até 100 sessões por chamada.
--    Elemento: { id, date, type, status, extra, plan, started_at, ended_at,
--                duration, points, feedback|null, exercises:[...] }
--    Sessão finalizada é imutável; só o feedback pode ser preenchido (uma vez).
--    Devolve quantas sessões foram recebidas.
-- ---------------------------------------------------------------------
create or replace function public.upsert_my_sessions(p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  el  jsonb;
  n   integer := 0;
  v_id text;
  v_type text;
  v_status text;
  v_fb text;
  v_ex jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 100 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  for el in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(el) <> 'object' then
      raise exception 'invalid_session' using errcode = '22023';
    end if;
    if jsonb_typeof(el -> 'id') is distinct from 'string' then
      raise exception 'invalid_session_id' using errcode = '22023';
    end if;
    v_id := el ->> 'id';
    if char_length(v_id) not between 1 and 64 then
      raise exception 'invalid_session_id' using errcode = '22023';
    end if;
    v_type := el ->> 'type';
    v_status := el ->> 'status';
    if v_type is null or v_type not in ('P', 'L', 'C', 'F') then
      raise exception 'invalid_session_type' using errcode = '22023';
    end if;
    if v_status is null or v_status not in ('completed', 'interrupted', 'abandoned') then
      raise exception 'invalid_session_status' using errcode = '22023';
    end if;
    if el -> 'feedback' is null or jsonb_typeof(el -> 'feedback') = 'null' then
      v_fb := null;
    else
      v_fb := el ->> 'feedback';
      if v_fb not in ('hard', 'ok', 'easy') then
        raise exception 'invalid_feedback' using errcode = '22023';
      end if;
    end if;
    v_ex := el -> 'exercises';
    if jsonb_typeof(v_ex) is distinct from 'array' or jsonb_array_length(v_ex) > 40 or octet_length(v_ex::text) > 60000 then
      raise exception 'invalid_exercises' using errcode = '22023';
    end if;
    if jsonb_typeof(el -> 'extra') is distinct from 'boolean' then
      raise exception 'invalid_session' using errcode = '22023';
    end if;

    insert into public.workout_sessions
      (user_id, session_id, session_date, type, status, extra, plan, started_at, ended_at,
       duration_seconds, points, feedback, exercises)
    values
      (uid, v_id, public.cf_date(el -> 'date', 'session_date', date '2020-01-01'), v_type, v_status,
       (el ->> 'extra')::boolean,
       case when jsonb_typeof(el -> 'plan') = 'number' then public.cf_int(el -> 'plan', 3, 6, 'plan')::smallint else null end,
       public.cf_ts(el -> 'started_at', 'started_at'), public.cf_ts(el -> 'ended_at', 'ended_at'),
       public.cf_int(el -> 'duration', 0, 86400, 'duration'),
       public.cf_int(el -> 'points', 0, 100000, 'points'),
       v_fb, v_ex)
    on conflict (user_id, session_id) do update set
      feedback   = coalesce(public.workout_sessions.feedback, excluded.feedback),
      updated_at = case when public.workout_sessions.feedback is null and excluded.feedback is not null
                        then now() else public.workout_sessions.updated_at end;
    n := n + 1;
  end loop;

  if (select count(*) from public.workout_sessions where user_id = uid) > 5000 then
    raise exception 'too_many_sessions' using errcode = '22023';
  end if;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- 9) unlock_my_achievements(p jsonb): registra desbloqueios (até 100 por chamada,
--    500 por usuário). Elemento: { id, at? }. Repetição nunca reabre: vale o mais antigo.
-- ---------------------------------------------------------------------
create or replace function public.unlock_my_achievements(p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  el  jsonb;
  n   integer := 0;
  v_id text;
  v_at timestamptz;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 100 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  for el in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(el) <> 'object' or jsonb_typeof(el -> 'id') is distinct from 'string' then
      raise exception 'invalid_achievement' using errcode = '22023';
    end if;
    v_id := el ->> 'id';
    if v_id !~ '^[a-z0-9_]{1,40}$' then
      raise exception 'invalid_achievement' using errcode = '22023';
    end if;
    v_at := coalesce(public.cf_ts(el -> 'at', 'at'), now());

    insert into public.achievements_unlocked (user_id, achievement_id, unlocked_at)
    values (uid, v_id, v_at)
    on conflict (user_id, achievement_id) do update
      set unlocked_at = least(public.achievements_unlocked.unlocked_at, excluded.unlocked_at);
    n := n + 1;
  end loop;

  if (select count(*) from public.achievements_unlocked where user_id = uid) > 500 then
    raise exception 'too_many_achievements' using errcode = '22023';
  end if;
  return n;
end;
$$;

revoke all on function public.merge_my_progress(jsonb)       from public, anon;
revoke all on function public.upsert_my_sessions(jsonb)      from public, anon;
revoke all on function public.unlock_my_achievements(jsonb)  from public, anon;
grant execute on function public.merge_my_progress(jsonb)      to authenticated;
grant execute on function public.upsert_my_sessions(jsonb)     to authenticated;
grant execute on function public.unlock_my_achievements(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 10) VERIFICAÇÃO (somente leitura). Esperado: todas as linhas com ok = true.
--     Observação: o antigo supabase-profiles-verify.sql, checagem 5, espera UPDATE
--     só em display_name e passará a acusar falha por causa de avatar_id (esperado).
-- ---------------------------------------------------------------------
select 'tabelas existem' as check_name,
  (to_regclass('public.user_progress') is not null
   and to_regclass('public.workout_sessions') is not null
   and to_regclass('public.achievements_unlocked') is not null) as ok
union all
select 'RLS ligado nas 3 tabelas',
  (select count(*) = 3 and bool_and(relrowsecurity) from pg_class
   where oid in ('public.user_progress'::regclass, 'public.workout_sessions'::regclass, 'public.achievements_unlocked'::regclass))
union all
select 'cada tabela tem só 1 política (SELECT, authenticated)',
  coalesce((select count(*) = 3 and bool_and(cmd = 'SELECT') and bool_and(roles = '{authenticated}')
            from pg_policies where schemaname = 'public'
              and tablename in ('user_progress', 'workout_sessions', 'achievements_unlocked')), false)
union all
select 'authenticated sem escrita direta nas 3 tabelas',
  not exists (select 1 from information_schema.role_table_grants
              where grantee in ('authenticated', 'anon', 'PUBLIC') and table_schema = 'public'
                and table_name in ('user_progress', 'workout_sessions', 'achievements_unlocked')
                and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))
union all
select 'anon sem acesso às 3 tabelas',
  not exists (select 1 from information_schema.role_table_grants
              where grantee in ('anon', 'PUBLIC') and table_schema = 'public'
                and table_name in ('user_progress', 'workout_sessions', 'achievements_unlocked'))
union all
select 'RPCs: só authenticated pode executar',
  (select count(*) = 3 from information_schema.routine_privileges
   where grantee = 'authenticated' and routine_schema = 'public'
     and routine_name in ('merge_my_progress', 'upsert_my_sessions', 'unlock_my_achievements'))
  and not exists (select 1 from information_schema.routine_privileges
   where grantee in ('anon', 'PUBLIC') and routine_schema = 'public'
     and routine_name in ('merge_my_progress', 'upsert_my_sessions', 'unlock_my_achievements'))
union all
select 'profiles.avatar_id existe',
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_id');
