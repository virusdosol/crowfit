-- =====================================================================
-- Crowfit — Migração v9: sessões registram histórico, sem conceder XP.
-- STATUS: RASCUNHO. NÃO APLICADA. Testar primeiro em projeto de TESTE.
--         Não executar no projeto de produção sem autorização expressa.
--
-- O QUE MUDA:
--   1) upsert_my_sessions deixa de chamar cf_grant_xp. Continua gravando e
--      validando cada sessão em workout_sessions, com a mesma forma de
--      resposta (número de sessões gravadas).
--   2) Sessões já gravadas NÃO são alteradas. Créditos já existentes em
--      xp_ledger (chaves set:, grp:, sess:) permanecem e continuam no saldo.
--      Nenhum saldo é recalculado, zerado ou removido.
--
-- O QUE NÃO MUDA:
--   - trilha (tr:), cf_grant_xp, merge_my_progress, cf_trail_amount;
--   - tabelas, colunas, políticas, triggers e demais RPCs;
--   - executor legado e sincronização de sessões no app.
--
-- PENDÊNCIA CONHECIDA: cf_trail_amount ainda não foi auditada (migração v6
--   não disponível). Esta v9 não altera essa função.
--
-- DEPENDÊNCIAS: cf_lock_user, cf_date, cf_int, cf_ts (supabase-sync*.sql) e
--   a tabela workout_sessions (supabase-xp-v8-sessoes.sql ou anterior).
-- Idempotente. Não apaga dados.
-- =====================================================================

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
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 100 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  -- Serializa por usuário (mesma trava das demais escritas).
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

    v_type   := el ->> 'type';
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
    if jsonb_typeof(v_ex) is distinct from 'array' or jsonb_array_length(v_ex) > 40
       or octet_length(v_ex::text) > 60000 then
      raise exception 'invalid_exercises' using errcode = '22023';
    end if;
    if jsonb_typeof(el -> 'extra') is distinct from 'boolean' then
      raise exception 'invalid_session' using errcode = '22023';
    end if;

    v_date := public.cf_date(el -> 'date', 'session_date', date '2020-01-01');
    v_dur  := public.cf_int(el -> 'duration', 0, 86400, 'duration');
    v_end  := public.cf_ts(el -> 'ended_at', 'ended_at');

    -- Só grava o histórico. Nenhum XP é concedido aqui.
    insert into public.workout_sessions
      (user_id, session_id, session_date, type, status, extra, plan, started_at, ended_at,
       duration_seconds, points, feedback, exercises)
    values
      (uid, v_id, v_date, v_type, v_status,
       (el ->> 'extra')::boolean,
       case when jsonb_typeof(el -> 'plan') = 'number'
            then public.cf_int(el -> 'plan', 3, 6, 'plan')::smallint else null end,
       public.cf_ts(el -> 'started_at', 'started_at'), v_end,
       v_dur,
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

revoke all on function public.upsert_my_sessions(jsonb) from public, anon;
grant execute on function public.upsert_my_sessions(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Verificação (somente leitura): deve retornar true
-- ---------------------------------------------------------------------
select 'v9 aplicada: sessões sem XP' as check_name,
  position('cf_grant_xp' in pg_get_functiondef('public.upsert_my_sessions(jsonb)'::regprocedure)) = 0
  and exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'workout_sessions') as ok;
