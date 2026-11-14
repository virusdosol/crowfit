-- =====================================================================
-- Crowfit — Migração v4 (FASE 1, ajuste): eventos de dia SEM janela retroativa
-- STATUS: REVISÃO. NÃO APLICADA. Produção = projeto gqhcknwuqwudctanigyf.
--         NÃO executar sem autorização expressa.
--
-- Pré-requisito: supabase-dias-v3.sql (aplicada, segundo o usuário).
--
-- O que muda em relação à v3:
--   1) record_day_events aceita eventos de QUALQUER idade (offline sem limite, como no Duolingo).
--      Conclusões e reversões são aceitas. A janela retroativa (janela_retro_h) deixa de ser usada.
--   2) Mantém: recusa de datas futuras (dia > hoje em São Paulo) e tolerância de 5 min para timestamps
--      no futuro (proteção contra relógio adiantado no servidor).
--   3) cf_server_now(): hora do servidor, usada pelo cliente para verificar o relógio do aparelho.
--   4) janela_retro_h permanece na tabela, sem efeito (não apagar dados).
--
-- Idempotente (create or replace).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Hora do servidor (para verificação do relógio do aparelho)
-- ---------------------------------------------------------------------
create or replace function public.cf_server_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now()
$$;
revoke all on function public.cf_server_now() from public, anon;
grant execute on function public.cf_server_now() to authenticated;

-- ---------------------------------------------------------------------
-- 2) record_day_events v4: sem janela retroativa
-- ---------------------------------------------------------------------
create or replace function public.record_day_events(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid       uuid := auth.uid();
  v_now     timestamptz := now();
  v_today   date := public.cf_sp_today();
  v_fut     integer;
  ev        jsonb;
  v_id      text;
  v_kind    text;
  v_day     date;
  v_at      timestamptz;
  v_status  text;
  v_reason  text;
  v_out     jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'events') is distinct from 'array' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p -> 'events') > 500 or octet_length(p::text) > 200000 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  select janela_futuro_min into v_fut from public.criterio_politica where id = 1;

  perform public.cf_lock_user(uid);

  for ev in select value from jsonb_array_elements(p -> 'events') loop
    v_id := null; v_kind := null; v_day := null; v_at := null;
    v_status := null; v_reason := null;

    if jsonb_typeof(ev) <> 'object' or jsonb_typeof(ev -> 'id') is distinct from 'string' then
      v_status := 'rejected'; v_reason := 'invalid_event';
    else
      v_id := ev ->> 'id';
      if v_id !~ '^[a-z0-9]{1,40}$' then
        v_status := 'rejected'; v_reason := 'invalid_id';
      elsif jsonb_typeof(ev -> 'kind') is distinct from 'string' or (ev ->> 'kind') not in ('done', 'undone') then
        v_status := 'rejected'; v_reason := 'invalid_kind';
      else
        v_kind := ev ->> 'kind';
      end if;
    end if;

    if v_status is null then
      begin
        if jsonb_typeof(ev -> 'day') = 'string' and (ev ->> 'day') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
          v_day := (ev ->> 'day')::date;
        end if;
      exception when others then v_day := null;
      end;
      begin
        if jsonb_typeof(ev -> 'at') = 'string' and (ev ->> 'at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$' then
          v_at := (ev ->> 'at')::timestamptz;
        end if;
      exception when others then v_at := null;
      end;

      if v_day is null or v_day < date '2020-01-01' then
        v_status := 'rejected'; v_reason := 'invalid_day';
      elsif v_at is null then
        v_status := 'rejected'; v_reason := 'invalid_at';
      elsif v_at > v_now + make_interval(mins => v_fut) then
        v_status := 'rejected'; v_reason := 'future_timestamp';
      elsif v_day > v_today then
        v_status := 'rejected'; v_reason := 'future_day';
      elsif exists (select 1 from public.day_events where user_id = uid and event_id = v_id) then
        v_status := 'duplicate';
      else
        insert into public.day_events (user_id, event_id, day, kind, completed_at, received_at)
        values (uid, v_id, v_day, v_kind, v_at, v_now);
        v_status := 'accepted';
      end if;
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id, 'status', v_status, 'reason', v_reason));
  end loop;

  return v_out;
end;
$$;

revoke all on function public.record_day_events(jsonb) from public, anon;
grant execute on function public.record_day_events(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3) VERIFICAÇÃO (somente leitura). Esperado: todas as linhas com ok = true.
-- ---------------------------------------------------------------------
select 'cf_server_now executável só por authenticated' as check_name,
  exists (select 1 from information_schema.routine_privileges
          where grantee = 'authenticated' and routine_schema = 'public' and routine_name = 'cf_server_now')
  and not exists (select 1 from information_schema.routine_privileges
          where grantee in ('anon', 'PUBLIC') and routine_schema = 'public' and routine_name = 'cf_server_now') as ok
union all
select 'record_day_events sem janela retroativa (não contém too_old)',
  coalesce((select position('too_old' in prosrc) = 0 from pg_proc
            where pronamespace = 'public'::regnamespace and proname = 'record_day_events'), false)
union all
select 'criterio_ativo continua 0',
  coalesce((select value = 0 from public.box_config where key = 'criterio_ativo'), false);
