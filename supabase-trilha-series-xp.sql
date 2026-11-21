-- =====================================================================
-- Crowfit — Trilha: XP por SÉRIE (migração nova, STATUS: NÃO APLICADA)
--
-- REGRA (aprovada pelo dono):
--   - Série concluída ....... 10 XP  (o maior valor)
--   - Grupo concluído ....... 5 XP   (bônus; grupo = séries de um exercício)
--   - Dia completo .......... 10 XP  (bônus; todos os grupos do dia)
--   - Só a trilha registra exercício. Sessões avulsas deixam de gravar e de pagar.
--   - Vale desde sempre: o XP passado é recalculado a partir do que já estava marcado.
--
-- O QUE FAZ:
--   1) trail_series_states: uma linha por série de cada exercício.
--   2) cf_trail_unit: lê o plano do dia (mesma lógica da v11, sem a trava de "só hoje").
--   3) cf_trail_recompute_unit: concede ser:/grp:/dia: por cf_grant_xp (idempotente).
--   4) cf_trail_amount passa a retornar null: o merge_my_progress não concede mais tr:.
--   5) upsert_my_sessions passa a retornar 0 e não grava nem concede nada.
--   6) set_my_trail_series: RPC para marcar uma série do dia de HOJE.
--   7) Remove as chaves antigas (tr:, ex:, set:, grp:, sess:) do ledger, após backup,
--      e recalcula rewards e points de user_progress. level é gerado a partir de points.
--   8) Backfill: converte exercícios já marcados em séries e recalcula o XP passado.
--
-- DEPENDÊNCIAS (no banco, não no repositório): plan_unit, cf_user_today, cf_grant_xp,
--   cf_lock_user, trail_state, training_settings, trail_exercise_states.
-- ATENÇÃO: o passo 7 apaga linhas de xp_ledger. Há backup em xp_ledger_backup_v12.
--   Se xp_ledger tiver trigger de imutabilidade (v6 não está no repositório), o passo falha:
--   nesse caso, nada é alterado (a migration roda numa transação).
-- =====================================================================

-- Verificação prévia: o plano precisa ter 'id' e 'sets' em cada exercício.
do $$
declare p jsonb; e jsonb; dow integer; lv integer;
begin
  for dow in 0..6 loop
    for lv in 0..2 loop
      p := public.plan_unit(1, 1, dow, lv);
      if p is not null then
        for e in select value from jsonb_array_elements(coalesce(p -> 'exercises', '[]'::jsonb)) loop
          if (e ->> 'id') is null or (e ->> 'sets') is null then
            raise exception 'plan_sem_sets: plan_unit precisa devolver id e sets';
          end if;
        end loop;
      end if;
    end loop;
  end loop;
end $$;

-- 1) Séries da trilha
create table if not exists public.trail_series_states (
  user_id     uuid not null references auth.users (id) on delete cascade,
  unit_key    text not null check (unit_key ~ '^s[0-9]{1,3}u[0-9]{1,3}$'),
  exercise_id text not null check (exercise_id ~ '^[a-z0-9_]{1,24}$'),
  set_index   smallint not null check (set_index between 1 and 20),
  done        boolean not null,
  changed_at  timestamptz not null default now(),
  primary key (user_id, unit_key, exercise_id, set_index)
);
alter table public.trail_series_states enable row level security;
revoke all on table public.trail_series_states from public, anon, authenticated;
grant select on table public.trail_series_states to authenticated;
drop policy if exists tss_select_proprio on public.trail_series_states;
create policy tss_select_proprio on public.trail_series_states
  for select to authenticated using (user_id = (select auth.uid()));

-- 2) Plano do dia (cópia da lógica da v11; sem exigir que seja hoje)
create or replace function public.cf_trail_unit(p_uid uuid, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  m := regexp_match(p_key, '^s([0-9]{1,3})u([0-9]{1,3})$');
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
  v_total := coalesce(jsonb_array_length(v_b -> 'exercises'), 0);
  return jsonb_build_object('k', k, 'n', n, 'date', v_date, 'total', v_total, 'plan', v_b);
end
$$;

revoke all on function public.cf_trail_unit(uuid, text) from public, anon, authenticated;

-- 3) Concessão por série, grupo e dia (idempotente: chaves únicas no ledger)
create or replace function public.cf_trail_recompute_unit(p_uid uuid, p_unit text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u jsonb; e jsonb; eid text; nsets integer; i integer;
  ex_done boolean; all_done boolean := true; n_ex integer;
begin
  u := public.cf_trail_unit(p_uid, p_unit);
  if u is null then return; end if;
  n_ex := coalesce(jsonb_array_length(u -> 'plan' -> 'exercises'), 0);
  if n_ex = 0 then return; end if;

  for e in select value from jsonb_array_elements(u -> 'plan' -> 'exercises') loop
    eid := e ->> 'id';
    nsets := coalesce((e ->> 'sets')::integer, 1);
    ex_done := true;
    for i in 1..nsets loop
      if exists (select 1 from public.trail_series_states s
                  where s.user_id = p_uid and s.unit_key = p_unit
                    and s.exercise_id = eid and s.set_index = i and s.done) then
        perform public.cf_grant_xp(p_uid, 'ser:' || p_unit || ':' || eid || ':' || i::text, 10, 'trail');
      else
        ex_done := false;
      end if;
    end loop;
    if ex_done then
      perform public.cf_grant_xp(p_uid, 'grp:' || p_unit || ':' || eid, 5, 'trail');
    else
      all_done := false;
    end if;
  end loop;

  if all_done then
    perform public.cf_grant_xp(p_uid, 'dia:' || p_unit, 10, 'trail');
  end if;
end
$$;

revoke all on function public.cf_trail_recompute_unit(uuid, text) from public, anon, authenticated;

-- 4) Desliga a concessão antiga de tr: (o merge_my_progress recebe null e não concede)
create or replace function public.cf_trail_amount(p_uid uuid, p_key text)
returns integer
language sql
security definer
set search_path = ''
as $$ select null::integer $$;

-- 5) Sessões avulsas: não gravam e não concedem XP (histórico antigo fica intacto)
create or replace function public.upsert_my_sessions(p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  return 0;
end
$$;

-- 6) RPC: marcar/desmarcar uma série do dia de HOJE
create or replace function public.set_my_trail_series(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  uk      text;
  eid     text;
  si      integer;
  dn      boolean;
  u       jsonb;
  e       jsonb;
  found   boolean := false;
  nsets   integer;
  feitas  integer;
  ex_done boolean;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_payload' using errcode = '22023'; end if;

  uk := p ->> 'unit_key';
  eid := p ->> 'exercise_id';
  if uk is null or uk !~ '^s[0-9]{1,3}u[0-9]{1,3}$' then raise exception 'invalid_unit' using errcode = '22023'; end if;
  if eid is null or eid !~ '^[a-z0-9_]{1,24}$' then raise exception 'invalid_exercise' using errcode = '22023'; end if;
  if jsonb_typeof(p -> 'set_index') is distinct from 'number' or jsonb_typeof(p -> 'done') is distinct from 'boolean' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  si := (p ->> 'set_index')::integer;
  dn := (p ->> 'done')::boolean;

  u := public.cf_trail_unit(uid, uk);
  if u is null then raise exception 'unit_unavailable' using errcode = 'P0001'; end if;
  if (u ->> 'date')::date <> public.cf_user_today(uid) then
    raise exception 'unit_not_today' using errcode = 'P0001';
  end if;

  for e in select value from jsonb_array_elements(u -> 'plan' -> 'exercises') loop
    if (e ->> 'id') = eid then found := true; exit; end if;
  end loop;
  if not found then raise exception 'exercise_not_in_unit' using errcode = 'P0001'; end if;
  nsets := coalesce((e ->> 'sets')::integer, 1);
  if si < 1 or si > nsets then raise exception 'invalid_set' using errcode = '22023'; end if;

  perform public.cf_lock_user(uid);

  insert into public.trail_series_states (user_id, unit_key, exercise_id, set_index, done, changed_at)
  values (uid, uk, eid, si, dn, now())
  on conflict (user_id, unit_key, exercise_id, set_index)
  do update set done = excluded.done, changed_at = excluded.changed_at;

  select count(*) into feitas from public.trail_series_states
   where user_id = uid and unit_key = uk and exercise_id = eid and done;
  ex_done := feitas = nsets;

  -- espelha no estado de exercício que a trilha já usa
  insert into public.trail_exercise_states (user_id, unit_key, exercise_id, done, changed_at)
  values (uid, uk, eid, ex_done, now())
  on conflict (user_id, unit_key, exercise_id)
  do update set done = excluded.done, changed_at = excluded.changed_at, updated_at = now();

  perform public.cf_trail_recompute_unit(uid, uk);

  return jsonb_build_object('unit_key', uk, 'exercise_id', eid, 'set_index', si,
                            'done', dn, 'exercise_done', ex_done);
end
$$;

revoke all on function public.set_my_trail_series(jsonb) from public, anon;
grant execute on function public.set_my_trail_series(jsonb) to authenticated;

-- 7) Backup e limpeza das chaves antigas de XP (tr:, ex:, set:, grp:, sess:)
create table if not exists public.xp_ledger_backup_v12 as select * from public.xp_ledger;

delete from public.xp_ledger
 where key like 'tr:%' or key like 'ex:%' or key like 'set:%' or key like 'grp:%' or key like 'sess:%';

-- rewards e points recalculados a partir do ledger (noz, box, idv: e as novas chaves permanecem)
update public.user_progress as up set
  rewards = coalesce((select jsonb_object_agg(x.key, x.amount) from public.xp_ledger as x where x.user_id = up.user_id), '{}'::jsonb),
  points  = least(up.base_points + coalesce((select sum(x.amount) from public.xp_ledger as x where x.user_id = up.user_id), 0), 10000000)::integer,
  revision = up.revision + 1,
  updated_at = now();

-- 8) Backfill: exercícios já marcados viram séries (todas as séries do exercício)
do $$
declare
  r record; u jsonb; e jsonb; nsets integer; i integer;
begin
  for r in select user_id, unit_key, exercise_id from public.trail_exercise_states where done loop
    u := public.cf_trail_unit(r.user_id, r.unit_key);
    if u is null then continue; end if;
    for e in select value from jsonb_array_elements(u -> 'plan' -> 'exercises') loop
      if (e ->> 'id') = r.exercise_id then
        nsets := coalesce((e ->> 'sets')::integer, 1);
        for i in 1..nsets loop
          insert into public.trail_series_states (user_id, unit_key, exercise_id, set_index, done)
          values (r.user_id, r.unit_key, r.exercise_id, i, true)
          on conflict (user_id, unit_key, exercise_id, set_index) do nothing;
        end loop;
      end if;
    end loop;
  end loop;

  for r in select distinct user_id, unit_key from public.trail_series_states loop
    perform public.cf_trail_recompute_unit(r.user_id, r.unit_key);
  end loop;
end $$;

-- Verificação (somente leitura). Esperado: sem chaves antigas; soma das chaves novas = points.
-- select key like 'tr:%' or key like 'sess:%' as antigas, count(*) from public.xp_ledger group by 1;
-- select sum(amount) = (select points from public.user_progress limit 1) as bate from public.xp_ledger;
