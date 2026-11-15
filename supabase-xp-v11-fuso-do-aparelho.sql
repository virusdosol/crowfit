-- =====================================================================
-- Crowfit — Migração v11: "hoje" da pessoa segue o fuso do aparelho.
-- STATUS: RASCUNHO. NÃO APLICADA. Testar primeiro em projeto de TESTE.
--         Não executar na produção sem autorização expressa.
--
-- O QUE MUDA:
--   1) Tabela user_clock: 1 linha por conta com o fuso do aparelho.
--      Leitura só da própria linha (RLS). Escrita só pela RPC abaixo.
--   2) set_my_time_zone(p jsonb): grava o fuso informado pelo app, validado
--      contra a lista oficial do banco (pg_timezone_names).
--   3) cf_user_today(uid): data "hoje" no fuso da conta. Sem fuso gravado,
--      usa America/Sao_Paulo (comportamento anterior, sem perda).
--   4) cf_trail_amount passa a usar cf_user_today(p_uid) em vez de
--      cf_sp_today(). A regra "só o dia atual paga XP" continua igual.
--
-- O QUE NÃO MUDA:
--   - fórmula do XP, nível congelado, conclusão, idempotência (xp_ledger);
--   - dados existentes (datas gravadas continuam válidas);
--   - boxes, dias, social e sessões: ainda usam cf_sp_today (ver PENDÊNCIA).
--
-- PENDÊNCIA: outras funções ainda usam America/Sao_Paulo (boxes, dias, social
--   e a janela da ofensiva). Serão migradas para cf_user_today numa v12,
--   depois de ler cada função completa.
--
-- Idempotente. Não apaga nem altera dados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabela do fuso por conta
-- ---------------------------------------------------------------------
create table if not exists public.user_clock (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  time_zone  text not null check (char_length(time_zone) between 3 and 64),
  updated_at timestamptz not null default now()
);
alter table public.user_clock enable row level security;

drop policy if exists user_clock_select_own on public.user_clock;
create policy user_clock_select_own on public.user_clock
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.user_clock from anon, authenticated;
grant select on public.user_clock to authenticated;

-- ---------------------------------------------------------------------
-- 2) Gravação do fuso (única escrita permitida)
-- ---------------------------------------------------------------------
create or replace function public.set_my_time_zone(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tz  text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'time_zone') is distinct from 'string' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  tz := p ->> 'time_zone';
  if not exists (select 1 from pg_timezone_names as z where z.name = tz) then
    raise exception 'invalid_time_zone' using errcode = '22023';
  end if;

  insert into public.user_clock (user_id, time_zone) values (uid, tz)
  on conflict (user_id) do update
    set time_zone = excluded.time_zone, updated_at = now()
    where public.user_clock.time_zone is distinct from excluded.time_zone;

  return jsonb_build_object('time_zone', tz);
end;
$$;

revoke all on function public.set_my_time_zone(jsonb) from public, anon;
grant execute on function public.set_my_time_zone(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3) "Hoje" da pessoa, no fuso dela
-- ---------------------------------------------------------------------
create or replace function public.cf_user_today(p_uid uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce(
            (select uc.time_zone from public.user_clock as uc where uc.user_id = p_uid),
            'America/Sao_Paulo'))::date
$$;

revoke all on function public.cf_user_today(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) cf_trail_amount: mesmo corpo da v10, trocando só o "hoje".
--    Recriada inteira porque o corpo muda numa linha.
-- ---------------------------------------------------------------------
create or replace function public.cf_trail_amount(p_uid uuid, p_key text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  m        text[];
  k        integer;
  n        integer;
  v_start  date;
  v_levels jsonb;
  v_exp    text;
  v_adj    smallint;
  v_first  date;
  v_dim    integer;
  v_sec    date;
  v_next   date;
  v_date   date;
  v_lv     integer;
  v_b      jsonb;
  v_total  integer;
  v_done   integer;
  v_unit   text;
  v_amt    integer;
  v_today  date;
begin
  if p_uid is null or p_key is null then return null; end if;
  m := regexp_match(p_key, '^tr:s([0-9]{1,3})u([0-9]{1,3})$');
  if m is null then return null; end if;
  k := m[1]::integer; n := m[2]::integer;
  if k < 1 or n < 1 then return null; end if;

  select ts.start, ts.levels into v_start, v_levels from public.trail_state as ts where ts.user_id = p_uid;
  if v_start is null then return null; end if;

  v_first := (date_trunc('month', v_start::timestamp) + make_interval(months => 3 * (k - 1)))::date;
  v_dim   := extract(day from (v_first + interval '1 month' - interval '1 day'))::integer;
  v_sec   := v_first + (least(extract(day from v_start)::integer, v_dim) - 1);
  v_first := (date_trunc('month', v_start::timestamp) + make_interval(months => 3 * k))::date;
  v_dim   := extract(day from (v_first + interval '1 month' - interval '1 day'))::integer;
  v_next  := v_first + (least(extract(day from v_start)::integer, v_dim) - 1);

  v_date := v_sec + (n - 1);
  if v_date >= v_next then return null; end if;

  -- só unidades do dia atual DA PESSOA (fuso do aparelho) geram XP
  v_today := public.cf_user_today(p_uid);
  if v_date <> v_today then return null; end if;

  if v_levels ? k::text and jsonb_typeof(v_levels -> k::text) = 'number' then
    v_lv := (v_levels ->> k::text)::integer;
  else
    select ts.exp, ts.adjust into v_exp, v_adj from public.training_settings as ts where ts.user_id = p_uid;
    if v_exp is null then return null; end if;
    v_lv := greatest(0, least(2,
      (case v_exp when 'Nunca treinei' then 0 when 'Treino às vezes' then 1 when 'Treino sempre' then 2 else 0 end)
      + coalesce(v_adj, 0)));
  end if;

  v_b := public.plan_unit(k, n, extract(dow from v_date)::integer, v_lv);
  v_total := jsonb_array_length(v_b -> 'exercises');
  if v_total = 0 then return null; end if;

  v_unit := 's' || k || 'u' || n;
  select count(*) into v_done
    from jsonb_array_elements(v_b -> 'exercises') as e
   where exists (select 1 from public.trail_exercise_states as tes
                  where tes.user_id = p_uid and tes.unit_key = v_unit
                    and tes.exercise_id = e ->> 'id' and tes.done = true);
  if v_done < v_total then return null; end if;

  v_amt := 10 * v_total + 20;
  return case when v_amt between 1 and 1000 then v_amt else null end;
end;
$function$;

-- ---------------------------------------------------------------------
-- 5) Verificação (somente leitura): deve retornar true
-- ---------------------------------------------------------------------
select 'v11 aplicada: fuso do aparelho' as check_name,
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_clock')
  and position('cf_user_today' in pg_get_functiondef('public.cf_trail_amount(uuid,text)'::regprocedure)) > 0
  and position('set_my_time_zone' in pg_get_functiondef('public.set_my_time_zone(jsonb)'::regprocedure)) > 0 as ok;
