-- =====================================================================
-- Crowfit — Migração v8: SESSÕES LIVRES validadas no servidor (XP protegido)
-- STATUS: REVISÃO. NÃO APLICADA. Produção = projeto gqhcknwuqwudctanigyf.
--         NÃO executar sem autorização expressa. Sintaxe NÃO executada em PostgreSQL aqui.
--         Testar primeiro em projeto de TESTE.
--
-- Pré-requisitos, NESTA ORDEM (já aplicados):
--   1) supabase-sync.sql, supabase-sync-v2.sql (cf_lock_user, upsert/merge originais)
--   2) supabase-xp-v6-fase2b.sql e supabase-xp-v7-fase2c.sql (cf_grant_xp, xp_ledger)
--   3) supabase-boxes-v3.sql (cf_sp_today não é usado aqui; independente)
--
-- O QUE MUDA (e por quê):
--   A) Catálogo oficial de exercícios no servidor (exercise_catalog, 98 ids do program.js).
--      Exercício fora do catálogo NÃO gera XP. A sessão é guardada para o histórico.
--   B) XP de sessão só é concedido na PRIMEIRA gravação do session_id. Reenviar a mesma
--      sessão (repetição, reconexão, segundo aparelho) não concede XP de novo.
--      A chave de XP continua por data (ex:DATA:ID e sess:DATA), então o mesmo exercício
--      no mesmo dia rende uma vez só, mesmo vindo de sessões diferentes.
--   C) Limites coerentes: data da sessão numa janela de 30 dias para trás e 1 dia para
--      frente (sessões offline antigas são guardadas, sem XP); duração até 4 h;
--      término não pode estar mais de 10 min no futuro. Fora disso, sem XP.
--   D) Exercício concluído precisa de pelo menos uma série marcada como completed.
--      Bônus de sessão (20 XP) só se a sessão teve ao menos um exercício pago.
--   E) Estatísticas competitivas são DERIVADAS no servidor, por trigger em user_progress:
--      - best_streak = max(valor anterior, maior sequência real em done_dates).
--        O valor enviado pelo cliente nunca sobe além da sequência comprovada.
--      - done_dates: datas futuras (além de amanhã) são descartadas.
--      - last_workout_date não pode passar da última data de treino registrada.
--      O histórico antigo é preservado: o trigger só aumenta ou corrige, nunca apaga.
--   F) Todos os caminhos de escrita em user_progress passam pelo trigger (merge, grant, etc.).
--
-- Compatibilidade: sessões já gravadas não são alteradas. Quem já tinha o XP recebido
-- continua com ele (chaves no ledger preservadas). Sessões antigas reenviadas não ganham
-- XP novo (a primeira gravação já aconteceu).
--
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Catálogo oficial de exercícios (espelha LIB do program.js)
--    Se o catálogo do app mudar, esta tabela deve mudar junto.
-- ---------------------------------------------------------------------
create table if not exists public.exercise_catalog (
  id text primary key check (id ~ '^[a-z0-9_]{1,40}$')
);
insert into public.exercise_catalog (id) values
  ('marcha'),
  ('po'),
  ('corrida_l'),
  ('joelho_a'),
  ('bu'),
  ('al'),
  ('fl_inc'),
  ('fl_j'),
  ('fl'),
  ('fl_dec'),
  ('fl_arq'),
  ('fl_lar'),
  ('fl_pau'),
  ('fl_exp'),
  ('fl_iso'),
  ('pr_alta'),
  ('pr_toque'),
  ('pr_flx'),
  ('fl_fec_j'),
  ('fl_fec'),
  ('fl_dia'),
  ('fl_dia_dec'),
  ('bi_toalha'),
  ('bi_mochila'),
  ('bi_mochila_l'),
  ('bi_mochila_u'),
  ('chin_mesa'),
  ('tri_par'),
  ('mg'),
  ('mg_ret'),
  ('mg_1'),
  ('pk_par'),
  ('pk'),
  ('pk_lent'),
  ('pk_ele'),
  ('pk_ele_l'),
  ('cir_br'),
  ('elev_lat'),
  ('urso_t'),
  ('ytw'),
  ('ytw_seg'),
  ('desl_par'),
  ('parada'),
  ('sup'),
  ('sup_alt'),
  ('nadad'),
  ('sup_seg'),
  ('rem_mesa'),
  ('bird'),
  ('pr_rev_j'),
  ('pr_rev'),
  ('pr_rev_p'),
  ('bomdia'),
  ('bomdia_l'),
  ('stiff_u'),
  ('stiff_mo'),
  ('esc_ret'),
  ('rem_toalha'),
  ('ab_cur'),
  ('ab'),
  ('ab_cruz'),
  ('ab_v'),
  ('ab_hol'),
  ('pr_j'),
  ('pr'),
  ('pr_c'),
  ('pr_ant'),
  ('pe_j'),
  ('pe'),
  ('bi'),
  ('tes'),
  ('pr_lat_j'),
  ('pr_lat'),
  ('pr_lat_el'),
  ('mc'),
  ('ag_ap'),
  ('ag'),
  ('ag_pau'),
  ('ag_bul'),
  ('ag_pist'),
  ('af_est'),
  ('af'),
  ('af_rev'),
  ('af_cam'),
  ('af_salto'),
  ('pg'),
  ('pg_pau'),
  ('pg_u'),
  ('pg_el'),
  ('pa'),
  ('ag_s'),
  ('pa_u'),
  ('ag_salto'),
  ('cam_lev'),
  ('mob_quad'),
  ('gato_vaca'),
  ('cri'),
  ('resp')on conflict (id) do nothing;
revoke all on table public.exercise_catalog from public, anon, authenticated;
alter table public.exercise_catalog enable row level security;   -- sem políticas

-- ---------------------------------------------------------------------
-- 2) Trigger de integridade de user_progress (protege best_streak e datas)
--    Roda em todo INSERT/UPDATE, inclusive os que passam por merge_my_progress e cf_grant_xp.
-- ---------------------------------------------------------------------
create or replace function public.cf_guard_progress()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lim  date := (now() at time zone 'America/Sao_Paulo')::date + 1;
  v_run  integer := 0;
  v_max  date;
  v_old_best integer := 0;
begin
  -- Sem mudança nas datas nem na sequência: nada a recalcular (evita custo em cada grant de XP).
  if TG_OP = 'UPDATE'
     and NEW.done_dates is not distinct from OLD.done_dates
     and NEW.best_streak is not distinct from OLD.best_streak
     and NEW.last_workout_date is not distinct from OLD.last_workout_date then
    return NEW;
  end if;

  -- Datas futuras (além de amanhã) não contam como treino.
  NEW.done_dates := array(
    select d from (select distinct x as d from unnest(NEW.done_dates) x) s
     where d <= v_lim order by d);

  -- Maior sequência real de dias consecutivos (gaps-and-islands).
  select coalesce(max(len), 0) into v_run from (
    select count(*) as len from (
      select d, row_number() over (order by d) as rn from unnest(NEW.done_dates) d
    ) r group by (d - rn::integer)
  ) g;

  v_max := case when cardinality(NEW.done_dates) > 0 then NEW.done_dates[cardinality(NEW.done_dates)] else null end;

  if TG_OP = 'UPDATE' then v_old_best := coalesce(OLD.best_streak, 0); end if;
  -- Nunca diminui o histórico; nunca sobe além do que as datas comprovam.
  NEW.best_streak := greatest(v_old_best, v_run);

  -- Só limita quando há datas comprovadas. Sem datas, o valor anterior é mantido (histórico).
  if v_max is not null and (NEW.last_workout_date is null or NEW.last_workout_date > v_max) then
    NEW.last_workout_date := v_max;
  end if;
  return NEW;
end;
$$;
revoke all on function public.cf_guard_progress() from public, anon, authenticated;

drop trigger if exists cf_guard_progress on public.user_progress;
create trigger cf_guard_progress
  before insert or update on public.user_progress
  for each row execute function public.cf_guard_progress();

-- ---------------------------------------------------------------------
-- 3) upsert_my_sessions v8: validação completa + XP só na primeira gravação
-- ---------------------------------------------------------------------
create or replace function public.upsert_my_sessions(p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  el         jsonb;
  n          integer := 0;
  v_id       text;
  v_type     text;
  v_status   text;
  v_fb       text;
  v_ex       jsonb;
  v_date     date;
  v_dur      integer;
  v_end      timestamptz;
  v_existed  boolean;
  v_ok       boolean;
  v_lim      date := (now() at time zone 'America/Sao_Paulo')::date + 1;
  v_min      date := (now() at time zone 'America/Sao_Paulo')::date - 30;
  v_paid     integer;
  ex_el      jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 100 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  -- Serializa por usuário: sem corrida entre duas gravações da mesma sessão.
  perform public.cf_lock_user(uid);

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

    v_date := public.cf_date(el -> 'date', 'session_date', date '2020-01-01');
    v_dur  := public.cf_int(el -> 'duration', 0, 86400, 'duration');
    v_end  := public.cf_ts(el -> 'ended_at', 'ended_at');

    -- Já gravada? Então a primeira gravação já foi feita: não concede XP de novo.
    select exists (select 1 from public.workout_sessions ws where ws.user_id = uid and ws.session_id = v_id) into v_existed;

    insert into public.workout_sessions
      (user_id, session_id, session_date, type, status, extra, plan, started_at, ended_at,
       duration_seconds, points, feedback, exercises)
    values
      (uid, v_id, v_date, v_type, v_status,
       (el ->> 'extra')::boolean,
       case when jsonb_typeof(el -> 'plan') = 'number' then public.cf_int(el -> 'plan', 3, 6, 'plan')::smallint else null end,
       public.cf_ts(el -> 'started_at', 'started_at'), v_end,
       v_dur,
       public.cf_int(el -> 'points', 0, 100000, 'points'),
       v_fb, v_ex)
    on conflict (user_id, session_id) do update set
      feedback   = coalesce(public.workout_sessions.feedback, excluded.feedback),
      updated_at = case when public.workout_sessions.feedback is null and excluded.feedback is not null
                        then now() else public.workout_sessions.updated_at end;

    -- XP só na primeira gravação e só se a sessão estiver dentro dos limites.
    v_ok := (not v_existed)
            and v_date between v_min and v_lim
            and v_dur <= 14400
            and (v_end is null or v_end <= now() + interval '10 minutes');

    v_paid := 0;
    if v_ok then
      for ex_el in select value from jsonb_array_elements(v_ex) loop
        if jsonb_typeof(ex_el) = 'object'
           and (ex_el ->> 'status') = 'completed'
           and jsonb_typeof(ex_el -> 'exerciseId') = 'string'
           and (ex_el ->> 'exerciseId') in (select c.id from public.exercise_catalog c)
           and jsonb_typeof(ex_el -> 'sets') = 'array'
           and exists (select 1 from jsonb_array_elements(ex_el -> 'sets') s
                        where jsonb_typeof(s.value) = 'object' and (s.value ->> 'completed') = 'true') then
          perform public.cf_grant_xp(uid, 'ex:' || to_char(v_date, 'YYYY-MM-DD') || ':' || (ex_el ->> 'exerciseId'), 10, 'app');
          v_paid := v_paid + 1;
        end if;
      end loop;
      if v_status = 'completed' and v_paid > 0 then
        perform public.cf_grant_xp(uid, 'sess:' || to_char(v_date, 'YYYY-MM-DD'), 20, 'app');
      end if;
    end if;
    n := n + 1;
  end loop;

  if (select count(*) from public.workout_sessions where user_id = uid) > 5000 then
    raise exception 'too_many_sessions' using errcode = '22023';
  end if;
  return n;
end;
$$;

revoke all on function public.upsert_my_sessions(jsonb) from public, anon;
grant execute on function public.upsert_my_sessions(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Verificação (deve retornar true)
-- ---------------------------------------------------------------------
select
  (select count(*) from public.exercise_catalog) = 98
  and exists (select 1 from pg_trigger where tgname = 'cf_guard_progress' and tgrelid = 'public.user_progress'::regclass)
  and position('exercise_catalog' in pg_get_functiondef('public.upsert_my_sessions(jsonb)'::regprocedure)) > 0
  and position('v_existed' in pg_get_functiondef('public.upsert_my_sessions(jsonb)'::regprocedure)) > 0
  as v8_aplicada;
