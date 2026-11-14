-- =====================================================================
-- Crowfit — Migração incremental v2 da sincronização
-- Onde: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pré-requisito: supabase-profiles.sql e supabase-sync.sql já aplicados.
--
-- O que acrescenta (NADA é removido, alterado ou reescrito):
--   1) trail_state                 : data de início da trilha e níveis congelados por seção
--   2) trail_exercise_states       : 1 linha por exercício marcado/desmarcado, com timestamp próprio
--   3) training_settings           : experiência, dias por semana, ajuste e sequência de feedback fácil
--   4) user_nozes                  : nozes abertas (1 por semana, com XP) — chave única impede XP repetido
--   5) RPCs novas: merge_my_trail, merge_my_settings, open_my_noz, merge_my_nozes
--   As RPCs antigas (merge_my_progress, upsert_my_sessions, unlock_my_achievements)
--   não são tocadas.
--
-- Modelo de segurança (igual ao existente):
--   * Leitura direta só das próprias linhas (RLS select own). Nenhuma escrita direta.
--   * Escrita só por funções SECURITY DEFINER que usam auth.uid() e validam cada campo.
--   * Cada escrita de usuário roda sob trava de advisory por usuário (sem corrida entre dispositivos).
--
-- Regras de mesclagem (nunca apagam progresso):
--   * trail start      : o primeiro valor gravado é mantido (início da trilha não muda).
--   * trail levels     : níveis congelados. Chave já gravada prevalece; chaves novas são adicionadas.
--   * exercício        : last-write-wins por exercício (changed_at). Desmarcar é um estado
--                        como qualquer outro, então a desmarcação sincroniza. Empate: "desmarcado" vence.
--   * settings         : last-write-wins pelo settings_at do cliente (inteiro, não por campo).
--   * noz              : chave (user_id, week_start). Uma única concessão de XP por semana,
--                        mesmo que dois dispositivos tentem abrir a mesma noz ao mesmo tempo.
--   * XP da noz        : o servidor sorteia o valor (open_my_noz). O import (merge_my_nozes) só
--                        grava semanas ainda inexistentes, então não concede XP duas vezes.
--
-- Idempotente: pode rodar mais de uma vez. Usa IF NOT EXISTS, CREATE OR REPLACE e checagens em pg_policies.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Auxiliares novos (privados)
-- ---------------------------------------------------------------------
-- Valida um sábado de semana já encerrada (ou que termina hoje), no formato AAAA-MM-DD.
create or replace function public.cf_week_sat(j jsonb, field text)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  d date;
begin
  d := public.cf_date(j, field, date '2020-01-01');
  if extract(dow from d) <> 6 then
    raise exception 'invalid_%', field using errcode = '22023';
  end if;
  if d > current_date then
    raise exception 'invalid_%', field using errcode = '22023';
  end if;
  return d;
end;
$$;

-- Serializa as escritas de um mesmo usuário (trilha, configurações e nozes).
create or replace function public.cf_lock_user(uid uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cf-sync:' || uid::text, 0));
end;
$$;

revoke all on function public.cf_week_sat(jsonb, text) from public, anon, authenticated;
revoke all on function public.cf_lock_user(uuid)       from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1) trail_state: início da trilha e níveis congelados (1 linha por usuário)
-- ---------------------------------------------------------------------
create table if not exists public.trail_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  start      date,
  levels     jsonb not null default '{}'::jsonb
             check (jsonb_typeof(levels) = 'object' and octet_length(levels::text) <= 2000),
  updated_at timestamptz not null default now()
);
comment on table public.trail_state is
  'Trilha: data de início e níveis congelados por seção. Escrita só via merge_my_trail().';

-- ---------------------------------------------------------------------
-- 2) trail_exercise_states: 1 linha por (unidade, exercício), com timestamp próprio
--    unit_key = "s<seção>u<unidade>", exercise_id = id do exercício.
--    done = true (marcado) ou false (desmarcado). Ambos são registrados.
-- ---------------------------------------------------------------------
create table if not exists public.trail_exercise_states (
  user_id     uuid not null references auth.users (id) on delete cascade,
  unit_key    text not null check (unit_key ~ '^s[0-9]{1,3}u[0-9]{1,3}$'),
  exercise_id text not null check (exercise_id ~ '^[a-z0-9_]{1,24}$'),
  done        boolean not null,
  changed_at  timestamptz not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, unit_key, exercise_id)
);
create index if not exists trail_exercise_states_user_idx
  on public.trail_exercise_states (user_id);
comment on table public.trail_exercise_states is
  'Estado de cada exercício da trilha. Last-write-wins por changed_at. Escrita só via merge_my_trail().';

-- ---------------------------------------------------------------------
-- 3) training_settings: configurações de treino (1 linha por usuário)
-- ---------------------------------------------------------------------
create table if not exists public.training_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  exp         text not null check (exp in ('Nunca treinei', 'Treino às vezes', 'Treino sempre')),
  dias        smallint not null check (dias between 3 and 6),
  adjust      smallint not null default 0 check (adjust between -1 and 1),
  easy_streak smallint not null default 0 check (easy_streak between 0 and 10),
  settings_at timestamptz not null,
  updated_at  timestamptz not null default now()
);
comment on table public.training_settings is
  'Configurações de treino. Last-write-wins por settings_at. Escrita só via merge_my_settings().';

-- ---------------------------------------------------------------------
-- 4) user_nozes: nozes abertas. Chave (user_id, week_start) = no máximo 1 XP por semana.
--    week_start é sempre um sábado (fim da semana de calendário).
-- ---------------------------------------------------------------------
create table if not exists public.user_nozes (
  user_id    uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  xp         integer not null check (xp between 1 and 10000000),
  source     text not null default 'server' check (source in ('server', 'import')),
  opened_at  timestamptz not null default now(),
  primary key (user_id, week_start)
);
comment on table public.user_nozes is
  'Nozes abertas (uma por semana). Escrita só via open_my_noz() e merge_my_nozes().';

-- ---------------------------------------------------------------------
-- 5) Permissões + RLS (mesmo padrão das tabelas existentes)
-- ---------------------------------------------------------------------
revoke all on table public.trail_state            from public, anon, authenticated;
revoke all on table public.trail_exercise_states  from public, anon, authenticated;
revoke all on table public.training_settings      from public, anon, authenticated;
revoke all on table public.user_nozes             from public, anon, authenticated;
grant select on table public.trail_state           to authenticated;
grant select on table public.trail_exercise_states to authenticated;
grant select on table public.training_settings     to authenticated;
grant select on table public.user_nozes            to authenticated;

alter table public.trail_state           enable row level security;
alter table public.trail_exercise_states enable row level security;
alter table public.training_settings     enable row level security;
alter table public.user_nozes            enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trail_state' and policyname = 'trail_state_select_own') then
    create policy trail_state_select_own on public.trail_state
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trail_exercise_states' and policyname = 'trail_exercise_states_select_own') then
    create policy trail_exercise_states_select_own on public.trail_exercise_states
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'training_settings' and policyname = 'training_settings_select_own') then
    create policy training_settings_select_own on public.training_settings
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_nozes' and policyname = 'user_nozes_select_own') then
    create policy user_nozes_select_own on public.user_nozes
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
end
$$;
-- Sem políticas de escrita e sem grants de escrita: só as RPCs abaixo escrevem.

-- ---------------------------------------------------------------------
-- 6) merge_my_trail(p jsonb)
--    Payload: { start: "AAAA-MM-DD" | null,
--               levels: { "1": 0..2, ... },
--               exercises: [ { unit: "s1u3", ex: "flexao", done: true|false, at: "ISO" } ] }   (até 500)
--    Devolve o estado completo da trilha do usuário (o app adota o resultado).
-- ---------------------------------------------------------------------
create or replace function public.merge_my_trail(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := auth.uid();
  v_start  date;
  v_lv_in  jsonb;
  v_el     jsonb;
  v_unit   text;
  v_ex     text;
  v_done   boolean;
  v_at     timestamptz;
  k        text;
  out      jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 1000000 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  -- início: valor de data ou null
  if p -> 'start' is not null and jsonb_typeof(p -> 'start') <> 'null' then
    v_start := public.cf_date(p -> 'start', 'trail_start', date '2020-01-01');
  end if;

  -- níveis: objeto { "1": 0..2 }, no máximo 50 chaves
  v_lv_in := coalesce(p -> 'levels', '{}'::jsonb);
  if jsonb_typeof(v_lv_in) <> 'object' or (select count(*) from jsonb_each(v_lv_in)) > 50 then
    raise exception 'invalid_levels' using errcode = '22023';
  end if;
  for k in select key from jsonb_each(v_lv_in) loop
    if k !~ '^[0-9]{1,3}$' then
      raise exception 'invalid_levels' using errcode = '22023';
    end if;
  end loop;
  if exists (select 1 from jsonb_each(v_lv_in)
             where jsonb_typeof(value) <> 'number' or (value #>> '{}') !~ '^[0-2]$') then
    raise exception 'invalid_levels' using errcode = '22023';
  end if;

  -- exercícios: array de até 500 itens
  if jsonb_typeof(coalesce(p -> 'exercises', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p -> 'exercises', '[]'::jsonb)) > 500 then
    raise exception 'invalid_exercises' using errcode = '22023';
  end if;

  perform public.cf_lock_user(uid);
  insert into public.trail_state (user_id) values (uid) on conflict (user_id) do nothing;

  -- início: grava só se ainda não existe (não muda depois)
  if v_start is not null then
    update public.trail_state set start = v_start, updated_at = now()
    where user_id = uid and start is null;
  end if;

  -- níveis: o que já foi gravado prevalece; chaves novas entram
  update public.trail_state set
    levels = (coalesce(v_lv_in, '{}'::jsonb) || levels),
    updated_at = now()
  where user_id = uid;
  if octet_length((select levels::text from public.trail_state where user_id = uid)) > 2000 then
    raise exception 'too_many_levels' using errcode = '22023';
  end if;

  -- exercícios: último a mudar vence; empate favorece "desmarcado"
  for v_el in select value from jsonb_array_elements(coalesce(p -> 'exercises', '[]'::jsonb)) loop
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'invalid_exercise' using errcode = '22023';
    end if;
    if jsonb_typeof(v_el -> 'unit') is distinct from 'string' or jsonb_typeof(v_el -> 'ex') is distinct from 'string' then
      raise exception 'invalid_exercise' using errcode = '22023';
    end if;
    v_unit := v_el ->> 'unit';
    v_ex   := v_el ->> 'ex';
    if v_unit !~ '^s[0-9]{1,3}u[0-9]{1,3}$' or v_ex !~ '^[a-z0-9_]{1,24}$' then
      raise exception 'invalid_exercise' using errcode = '22023';
    end if;
    if jsonb_typeof(v_el -> 'done') is distinct from 'boolean' then
      raise exception 'invalid_exercise' using errcode = '22023';
    end if;
    v_done := (v_el -> 'done')::text = 'true';
    v_at   := public.cf_ts(v_el -> 'at', 'exercise_at');
    if v_at is null then
      raise exception 'invalid_exercise' using errcode = '22023';
    end if;

    insert into public.trail_exercise_states (user_id, unit_key, exercise_id, done, changed_at)
    values (uid, v_unit, v_ex, v_done, v_at)
    on conflict (user_id, unit_key, exercise_id) do update set
      done       = excluded.done,
      changed_at = excluded.changed_at,
      updated_at = now()
    where excluded.changed_at > public.trail_exercise_states.changed_at
       or (excluded.changed_at = public.trail_exercise_states.changed_at
           and public.trail_exercise_states.done and not excluded.done);
  end loop;

  if (select count(*) from public.trail_exercise_states where user_id = uid) > 20000 then
    raise exception 'too_many_exercises' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'start', (select start from public.trail_state where user_id = uid),
    'levels', (select levels from public.trail_state where user_id = uid),
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object('unit', unit_key, 'ex', exercise_id, 'done', done,
                                          'at', to_char(changed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                       order by unit_key, exercise_id)
      from public.trail_exercise_states where user_id = uid), '[]'::jsonb))
  into out;
  return out;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) merge_my_settings(p jsonb)
--    Payload: { exp, dias, adjust, easy_streak, at }
--    Last-write-wins por "at". Devolve a linha que ficou gravada.
-- ---------------------------------------------------------------------
create or replace function public.merge_my_settings(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  v_exp text;
  v_at  timestamptz;
  v_dias integer;
  v_adj  integer;
  v_easy integer;
  out   jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 2000 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  if jsonb_typeof(p -> 'exp') is distinct from 'string' then
    raise exception 'invalid_exp' using errcode = '22023';
  end if;
  v_exp := p ->> 'exp';
  if v_exp not in ('Nunca treinei', 'Treino às vezes', 'Treino sempre') then
    raise exception 'invalid_exp' using errcode = '22023';
  end if;
  v_dias := public.cf_int(p -> 'dias', 3, 6, 'dias');
  if jsonb_typeof(p -> 'adjust') is distinct from 'number' or (p ->> 'adjust') not in ('-1', '0', '1') then
    raise exception 'invalid_adjust' using errcode = '22023';
  end if;
  v_adj  := (p ->> 'adjust')::integer;
  v_easy := public.cf_int(p -> 'easy_streak', 0, 10, 'easy_streak');
  v_at   := public.cf_ts(p -> 'at', 'settings_at');
  if v_at is null then
    raise exception 'invalid_settings_at' using errcode = '22023';
  end if;

  perform public.cf_lock_user(uid);
  insert into public.training_settings (user_id, exp, dias, adjust, easy_streak, settings_at)
  values (uid, v_exp, v_dias, v_adj, v_easy, v_at)
  on conflict (user_id) do update set
    exp         = excluded.exp,
    dias        = excluded.dias,
    adjust      = excluded.adjust,
    easy_streak = excluded.easy_streak,
    settings_at = excluded.settings_at,
    updated_at  = now()
  where excluded.settings_at > public.training_settings.settings_at;

  select jsonb_build_object('exp', exp, 'dias', dias, 'adjust', adjust,
                            'easy_streak', easy_streak,
                            'at', to_char(settings_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  into out from public.training_settings where user_id = uid;
  return out;
end;
$$;

-- ---------------------------------------------------------------------
-- 8) open_my_noz(p jsonb)
--    Payload: { week_start: "AAAA-MM-DD" (sábado) }
--    O SERVIDOR sorteia o XP: 20 a 50 vezes o nível atual (mesma regra do app).
--    Se a noz já foi aberta (em qualquer aparelho), devolve o XP já gravado e não concede nada.
--    Concede no máximo uma vez: chave (user_id, week_start) + trava por usuário.
-- ---------------------------------------------------------------------
create or replace function public.open_my_noz(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  v_sat   date;
  v_start date;
  cur     public.user_progress;
  v_level integer;
  v_xp    integer;
  v_now   timestamptz;
  v_sum   bigint;
  v_already boolean := false;
  row_n   public.user_nozes;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  perform public.cf_lock_user(uid);
  v_sat := public.cf_week_sat(p -> 'week_start', 'week_start');

  select start into v_start from public.trail_state where user_id = uid;
  if v_start is null then
    raise exception 'no_trail' using errcode = '22023';
  end if;
  -- a semana precisa estar dentro da trilha (o sábado não pode ser anterior ao início)
  if v_sat < v_start then
    raise exception 'invalid_week_start' using errcode = '22023';
  end if;

  insert into public.user_progress (user_id) values (uid) on conflict (user_id) do nothing;
  select * into cur from public.user_progress where user_id = uid for update;

  select * into row_n from public.user_nozes where user_id = uid and week_start = v_sat;
  if found then
    return jsonb_build_object('week_start', v_sat::text, 'xp', row_n.xp, 'already', true);
  end if;

  v_level := cur.points / 200 + 1;
  v_xp := 20 * v_level + floor(random() * (30 * v_level + 1))::integer;
  v_now := now();

  insert into public.user_nozes (user_id, week_start, xp, source, opened_at)
  values (uid, v_sat, v_xp, 'server', v_now);

  select coalesce(sum((value #>> '{}')::integer), 0) into v_sum from jsonb_each(cur.rewards);
  update public.user_progress set
    base_points = least(cur.base_points + v_xp, 10000000),
    points      = least(cur.base_points + v_xp + v_sum, 10000000)::integer,
    revision    = cur.revision + 1,
    updated_at  = now()
  where user_id = uid;

  return jsonb_build_object('week_start', v_sat::text, 'xp', v_xp, 'already', v_already);
end;
$$;

-- ---------------------------------------------------------------------
-- 9) merge_my_nozes(p jsonb)
--    Import de nozes já abertas antes desta migração (ou em outro aparelho).
--    Payload: [ { week_start: "AAAA-MM-DD", xp: 1..10000000 } ]  (até 200)
--    Só grava semanas que ainda não existem. NÃO altera base_points/points (evita XP em dobro).
--    Devolve a lista completa de nozes do usuário.
-- ---------------------------------------------------------------------
create or replace function public.merge_my_nozes(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  el    jsonb;
  v_sat date;
  v_xp  integer;
  v_start date;
  v_ins   integer;
  out     jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 200 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  perform public.cf_lock_user(uid);
  select start into v_start from public.trail_state where user_id = uid;
  if v_start is null then
    raise exception 'no_trail' using errcode = '22023';
  end if;

  for el in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(el) <> 'object' then
      raise exception 'invalid_noz' using errcode = '22023';
    end if;
    v_sat := public.cf_week_sat(el -> 'week_start', 'week_start');
    if v_sat < v_start then
      raise exception 'invalid_week_start' using errcode = '22023';
    end if;
    v_xp := public.cf_int(el -> 'xp', 1, 10000000, 'xp');

    insert into public.user_nozes (user_id, week_start, xp, source)
    values (uid, v_sat, v_xp, 'import')
    on conflict (user_id, week_start) do nothing;
  end loop;

  -- Import só REGISTRA as nozes. O XP já entra nos pontos pelo base_points enviado por
  -- merge_my_progress (o app inclui o XP local na base). Somar aqui dobraria o XP.

  select coalesce(jsonb_agg(jsonb_build_object('week_start', week_start::text, 'xp', xp) order by week_start), '[]'::jsonb)
  into out from public.user_nozes where user_id = uid;
  return out;
end;
$$;

-- ---------------------------------------------------------------------
-- 10) Permissões das RPCs novas: só authenticated executa
-- ---------------------------------------------------------------------
revoke all on function public.merge_my_trail(jsonb)     from public, anon;
revoke all on function public.merge_my_settings(jsonb)  from public, anon;
revoke all on function public.open_my_noz(jsonb)        from public, anon;
revoke all on function public.merge_my_nozes(jsonb)     from public, anon;
grant execute on function public.merge_my_trail(jsonb)    to authenticated;
grant execute on function public.merge_my_settings(jsonb) to authenticated;
grant execute on function public.open_my_noz(jsonb)       to authenticated;
grant execute on function public.merge_my_nozes(jsonb)    to authenticated;

-- ---------------------------------------------------------------------
-- 11) VERIFICAÇÃO (somente leitura). Esperado: todas as linhas com ok = true.
-- ---------------------------------------------------------------------
select 'tabelas v2 existem' as check_name,
  (to_regclass('public.trail_state') is not null
   and to_regclass('public.trail_exercise_states') is not null
   and to_regclass('public.training_settings') is not null
   and to_regclass('public.user_nozes') is not null) as ok
union all
select 'RLS ligado nas 4 tabelas v2',
  (select count(*) = 4 and bool_and(relrowsecurity) from pg_class
   where oid in ('public.trail_state'::regclass, 'public.trail_exercise_states'::regclass,
                 'public.training_settings'::regclass, 'public.user_nozes'::regclass))
union all
select 'cada tabela v2 tem só 1 política (SELECT, authenticated)',
  coalesce((select count(*) = 4 and bool_and(cmd = 'SELECT') and bool_and(roles = '{authenticated}')
            from pg_policies where schemaname = 'public'
              and tablename in ('trail_state', 'trail_exercise_states', 'training_settings', 'user_nozes')), false)
union all
select 'sem escrita direta nas tabelas v2 (authenticated/anon/PUBLIC)',
  not exists (select 1 from information_schema.role_table_grants
              where grantee in ('authenticated', 'anon', 'PUBLIC') and table_schema = 'public'
                and table_name in ('trail_state', 'trail_exercise_states', 'training_settings', 'user_nozes')
                and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))
union all
select 'anon sem acesso às tabelas v2',
  not exists (select 1 from information_schema.role_table_grants
              where grantee in ('anon', 'PUBLIC') and table_schema = 'public'
                and table_name in ('trail_state', 'trail_exercise_states', 'training_settings', 'user_nozes'))
union all
select 'RPCs v2 são SECURITY DEFINER com search_path fixo',
  (select count(*) = 4 and bool_and(prosecdef) and bool_and(proconfig is not null)
   from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('merge_my_trail', 'merge_my_settings', 'open_my_noz', 'merge_my_nozes'))
union all
select 'RPCs v2: só authenticated executa',
  (select count(*) = 4 from information_schema.routine_privileges
   where grantee = 'authenticated' and routine_schema = 'public'
     and routine_name in ('merge_my_trail', 'merge_my_settings', 'open_my_noz', 'merge_my_nozes'))
  and not exists (select 1 from information_schema.routine_privileges
   where grantee in ('anon', 'PUBLIC') and routine_schema = 'public'
     and routine_name in ('merge_my_trail', 'merge_my_settings', 'open_my_noz', 'merge_my_nozes'))
union all
select 'RPCs antigas continuam existindo (compatibilidade)',
  (select count(*) = 3 from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('merge_my_progress', 'upsert_my_sessions', 'unlock_my_achievements'))
union all
select 'chave (user_id, week_start) impede 2 XP por semana',
  exists (select 1 from pg_constraint
          where conrelid = 'public.user_nozes'::regclass and contype = 'p');
