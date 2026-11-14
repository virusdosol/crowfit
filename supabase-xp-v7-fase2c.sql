-- =====================================================================
-- Crowfit — Migração v7 (FASE 2c): TODO o XP é concedido e registrado pelo servidor
-- STATUS: REVISÃO. NÃO APLICADA. Produção = projeto gqhcknwuqwudctanigyf.
--         NÃO executar sem autorização expressa. Sintaxe NÃO executada em PostgreSQL aqui.
--
-- Pré-requisito: supabase-xp-v6-fase2b.sql APLICADA (xp_ledger, cf_trail_amount, cf_xp_reconcile).
--
-- Modelo único:
--   points = base_points (saldo inicial, congelado nesta migração) + soma de xp_ledger.
--   Toda concessão passa por cf_grant_xp(), que grava uma linha por chave (idempotente) e atualiza o total.
--
-- Fontes de XP (todas no servidor, no momento do evento):
--   trail   "tr:sKuN"        : trilha concluída (cf_trail_amount). Chega pelo merge_my_progress.
--   sessão  "ex:DATA:ID", "sess:DATA" : sessões livres, ao serem salvas (upsert_my_sessions). 10 e 20.
--   noz     "noz:SÁBADO"     : ao abrir a noz (open_my_noz).
--   caixa   "box:mensal:AAAA-MM": ao abrir a caixa pela primeira vez (open_my_box).
--
-- O que muda para o app: NADA é aceito como valor de XP. base_points e os valores de rewards enviados
--   pelo app são ignorados. O total volta do servidor (o app já adota o total devolvido).
--
-- Migração dos totais atuais: base_points passa a ser points - soma do ledger, para que points NÃO mude.
--   Feita UMA vez (marcador em xp_migration). Não recalcula nada, não zera nada.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Ajustes: valores de caixa passam de 1000 (limite da v6); marcador de migração
-- ---------------------------------------------------------------------
alter table public.xp_ledger drop constraint if exists xp_ledger_amount_check;
alter table public.xp_ledger add constraint xp_ledger_amount_check check (amount between 1 and 10000000);

create table if not exists public.xp_migration (
  name    text primary key,
  done_at timestamptz not null default now()
);
revoke all on table public.xp_migration from public, anon, authenticated;
alter table public.xp_migration enable row level security;

-- ---------------------------------------------------------------------
-- 1) cf_grant_xp: única porta de entrada de XP (interna)
-- ---------------------------------------------------------------------
create or replace function public.cf_grant_xp(p_uid uuid, p_key text, p_amount integer, p_source text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ins integer;
begin
  if p_uid is null or p_key is null or char_length(p_key) not between 1 and 80
     or p_amount is null or p_amount not between 1 and 10000000
     or p_source not in ('trail', 'app', 'legacy') then
    raise exception 'invalid_xp' using errcode = '22023';
  end if;

  insert into public.user_progress (user_id) values (p_uid) on conflict (user_id) do nothing;

  insert into public.xp_ledger (user_id, key, amount, source)
  values (p_uid, p_key, p_amount, p_source)
  on conflict (user_id, key) do nothing;
  get diagnostics v_ins = row_count;
  if v_ins = 0 then
    return false;   -- já concedido: nada muda
  end if;

  update public.user_progress as up set
    rewards    = up.rewards || jsonb_build_object(p_key, p_amount),
    points     = least(up.base_points + (select coalesce(sum(x.amount), 0) from public.xp_ledger as x where x.user_id = p_uid), 10000000)::integer,
    revision   = up.revision + 1,
    updated_at = now()
  where up.user_id = p_uid;
  return true;
end;
$$;

revoke all on function public.cf_grant_xp(uuid, text, integer, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Congelamento do saldo inicial (uma vez): base_points = points - soma do ledger. points não muda.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.xp_migration where name = 'v7_base_freeze') then
    update public.user_progress as up set
      base_points = up.points - coalesce((select sum(x.amount) from public.xp_ledger as x where x.user_id = up.user_id), 0)
    where up.points - coalesce((select sum(x.amount) from public.xp_ledger as x where x.user_id = up.user_id), 0) >= 0;
    insert into public.xp_migration (name) values ('v7_base_freeze');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3) merge_my_progress v7: sincroniza progresso e concede XP de TRILHA pelo servidor.
--    base_points e valores de rewards enviados pelo app NÃO são usados como XP.
-- ---------------------------------------------------------------------
create or replace function public.merge_my_progress(p jsonb)
returns public.user_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid       uuid := auth.uid();
  cur       public.user_progress;
  res       public.user_progress;
  e         jsonb;
  r         record;
  v_best    integer;
  v_last    date;
  v_done    date[];
  v_plan_in jsonb := '[]'::jsonb;
  v_plan    jsonb;
  v_rew_in  jsonb;
  v_amt     integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 2500000 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  -- validações de forma (mantidas): base_points continua validado, mas é ignorado
  perform public.cf_int(p -> 'base_points', 0, 10000000, 'base_points');
  v_best := public.cf_int(p -> 'best_streak', 0, 100000, 'best_streak');
  if p -> 'last_workout_date' is null or jsonb_typeof(p -> 'last_workout_date') = 'null' then
    v_last := null;
  else
    v_last := public.cf_date(p -> 'last_workout_date', 'last_workout_date', date '2020-01-01');
  end if;

  if jsonb_typeof(p -> 'done_dates') is distinct from 'array' or jsonb_array_length(p -> 'done_dates') > 20000 then
    raise exception 'invalid_done_dates' using errcode = '22023';
  end if;
  select coalesce(array_agg(d order by d), '{}'::date[]) into v_done
  from (select distinct public.cf_date(x, 'done_dates', date '2020-01-01') as d
        from jsonb_array_elements(p -> 'done_dates') x) s;

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

  v_rew_in := p -> 'rewards';
  if jsonb_typeof(v_rew_in) is distinct from 'object' or (select count(*) from jsonb_each(v_rew_in)) > 20000 then
    raise exception 'invalid_rewards' using errcode = '22023';
  end if;

  insert into public.user_progress (user_id) values (uid) on conflict (user_id) do nothing;
  select * into cur from public.user_progress where user_id = uid for update;

  -- progresso (sem XP): dias, ofensiva, plano
  select coalesce(array_agg(d order by d), '{}'::date[]) into v_done
  from (select unnest(cur.done_dates) as d union select unnest(v_done)) s;

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
    best_streak       = greatest(cur.best_streak, v_best),
    last_workout_date = case when cur.last_workout_date is null then v_last
                             when v_last is null then cur.last_workout_date
                             else greatest(cur.last_workout_date, v_last) end,
    done_dates        = v_done,
    plan_history      = v_plan,
    updated_at        = now()
  where user_id = uid;

  -- XP de trilha: o servidor calcula; só concede unidade concluída e já chegada
  for r in select key from jsonb_each(v_rew_in) loop
    if left(r.key, 3) = 'tr:' then
      v_amt := public.cf_trail_amount(uid, r.key);
      if v_amt is not null then
        perform public.cf_grant_xp(uid, r.key, v_amt, 'trail');
      end if;
    end if;
  end loop;

  select * into res from public.user_progress where user_id = uid;
  return res;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Sessões livres, noz e caixa: XP pelo servidor (ver fontes no cabeçalho)
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
  v_date date;
  ex_el jsonb;
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
    -- XP de sessão livre (servidor): 10 por exercício concluído; 20 de bônus se a sessão foi concluída. Idempotente por chave.
    v_date := public.cf_date(el -> 'date', 'session_date', date '2020-01-01');
    for ex_el in select value from jsonb_array_elements(v_ex) loop
      if jsonb_typeof(ex_el) = 'object' and (ex_el ->> 'status') = 'completed'
         and jsonb_typeof(ex_el -> 'exerciseId') = 'string'
         and (ex_el ->> 'exerciseId') ~ '^[A-Za-z0-9_.|-]{1,40}$' then
        perform public.cf_grant_xp(uid, 'ex:' || to_char(v_date, 'YYYY-MM-DD') || ':' || (ex_el ->> 'exerciseId'), 10, 'app');
      end if;
    end loop;
    if v_status = 'completed' then
      perform public.cf_grant_xp(uid, 'sess:' || to_char(v_date, 'YYYY-MM-DD'), 20, 'app');
    end if;
    n := n + 1;
  end loop;

  if (select count(*) from public.workout_sessions where user_id = uid) > 5000 then
    raise exception 'too_many_sessions' using errcode = '22023';
  end if;
  return n;
end;
$$;

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

  v_level := public.cf_level_for(cur.points);
  v_xp := 20 * v_level + floor(random() * (30 * v_level + 1))::integer;
  v_now := now();

  insert into public.user_nozes (user_id, week_start, xp, source, opened_at)
  values (uid, v_sat, v_xp, 'server', v_now);

  perform public.cf_grant_xp(uid, 'noz:' || v_sat::text, v_xp, 'app');

  return jsonb_build_object('week_start', v_sat::text, 'xp', v_xp, 'already', v_already);
end;
$$;

create or replace function public.open_my_box(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  v_id  text;
  row_b public.user_boxes;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'id') is distinct from 'string' or (p ->> 'id') !~ '^mensal:[0-9]{4}-[0-9]{2}$' then
    raise exception 'invalid_box' using errcode = '22023';
  end if;
  v_id := p ->> 'id';

  perform public.cf_lock_user(uid);

  select * into row_b from public.user_boxes where user_id = uid and box_id = v_id for update;
  if not found then
    raise exception 'box_not_granted' using errcode = '22023';
  end if;
  if row_b.opened_at is null then
    update public.user_boxes set opened_at = now() where user_id = uid and box_id = v_id
    returning * into row_b;
    if row_b.xp >= 1 then
      perform public.cf_grant_xp(uid, 'box:' || v_id, row_b.xp, 'app');
    end if;
    return jsonb_build_object('id', v_id, 'already', false, 'opened_at', row_b.opened_at);
  end if;
  return jsonb_build_object('id', v_id, 'already', true, 'opened_at', row_b.opened_at);
end;
$$;

-- ---------------------------------------------------------------------
-- 5) cf_xp_reconcile v7: points = base + ledger, e recompensas espelham o ledger
-- ---------------------------------------------------------------------
create or replace function public.cf_xp_reconcile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid    uuid := auth.uid();
  v_pts  integer;
  v_base integer;
  v_rew  bigint;
  v_led  bigint;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select up.points, up.base_points into v_pts, v_base from public.user_progress as up where up.user_id = uid;
  select coalesce(sum((r.value #>> '{}')::bigint), 0) into v_rew
    from public.user_progress as up cross join lateral jsonb_each(up.rewards) as r where up.user_id = uid;
  select coalesce(sum(x.amount), 0) into v_led from public.xp_ledger as x where x.user_id = uid;
  return jsonb_build_object(
    'points', coalesce(v_pts, 0), 'base_points', coalesce(v_base, 0),
    'ledger_sum', v_led, 'rewards_sum', v_rew,
    'consistent', (coalesce(v_pts, 0) = coalesce(v_base, 0) + v_led) and (v_rew = v_led));
end;
$$;

revoke all on function public.cf_xp_reconcile() from public, anon;
grant execute on function public.cf_xp_reconcile() to authenticated;

-- ---------------------------------------------------------------------
-- 6) Verificação (somente leitura): todas as linhas devem vir true
-- ---------------------------------------------------------------------
select 'points = base + ledger (todos os usuários)' as check_name,
  not exists (select 1 from public.user_progress as up
              where up.points <> up.base_points + coalesce((select sum(x.amount) from public.xp_ledger as x where x.user_id = up.user_id), 0)) as ok
union all
select 'recompensas espelham o ledger (todos os usuários)',
  not exists (select 1 from public.user_progress as up
              where (select coalesce(sum((r.value #>> '{}')::bigint), 0) from jsonb_each(up.rewards) as r)
                 <> (select coalesce(sum(x.amount), 0) from public.xp_ledger as x where x.user_id = up.user_id))
union all
select 'base_points nunca negativo', not exists (select 1 from public.user_progress where base_points < 0)
union all
select 'marcador do congelamento existe', exists (select 1 from public.xp_migration where name = 'v7_base_freeze')
union all
select 'cf_grant_xp nao executavel por authenticated/anon',
  not exists (select 1 from information_schema.routine_privileges
              where grantee in ('authenticated', 'anon', 'PUBLIC') and routine_schema = 'public'
                and routine_name = 'cf_grant_xp')
union all
select 'criterio_ativo continua 0',
  coalesce((select value = 0 from public.box_config where key = 'criterio_ativo'), false);
