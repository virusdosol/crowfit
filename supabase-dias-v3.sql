-- =====================================================================
-- Crowfit — Migração v3 (FASE 1): critério mensal por EVENTOS de dia
-- STATUS: REVISÃO. NÃO APLICADA. Produção = projeto gqhcknwuqwudctanigyf
--         (já possui supabase-boxes-v2.sql). NÃO executar sem autorização expressa.
--
-- Pré-requisito (já aplicado em produção): supabase-boxes-v2.sql
--   (cf_lock_user, cf_sp_today, cf_box_xp_range, user_boxes, box_config, box_item_catalog).
--
-- O que faz:
--   1) criterio_politica: data de corte (2026-12-01), janela de datas futuras (5 min)
--      e janela de eventos retroativos (48 h). Fuso oficial: America/Sao_Paulo.
--   2) day_events: registro de eventos de dia (concluído / revertido), com id único por evento.
--      Só o servidor escreve (via record_day_events). Nenhuma leitura direta pela API.
--   3) record_day_events(p): aceita eventos com idempotência; recusa datas futuras,
--      timestamps futuros além da tolerância e eventos fora da janela retroativa.
--   4) cf_days_done(uid, de, até): estado de cada dia = último evento do dia.
--   5) grant_my_box: critério passa a usar SOMENTE cf_days_done (não usa done_dates),
--      só conta dias a partir da data de corte e recusa meses anteriores ao corte.
--      Continua com criterio_ativo = 0 (recusa com criterion_not_defined).
--
-- Idempotente: pode rodar mais de uma vez (create ... if not exists, create or replace).
-- Não altera user_progress, merge_my_progress nem dados existentes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Política do critério (uma linha)
-- ---------------------------------------------------------------------
create table if not exists public.criterio_politica (
  id                integer primary key default 1 check (id = 1),
  corte             date not null default date '2026-12-01',
  janela_futuro_min integer not null default 5 check (janela_futuro_min between 0 and 60),
  janela_retro_h    integer not null default 48 check (janela_retro_h between 1 and 168)
);
insert into public.criterio_politica (id) values (1) on conflict (id) do nothing;
revoke all on table public.criterio_politica from public, anon, authenticated;
alter table public.criterio_politica enable row level security;   -- sem políticas

-- ---------------------------------------------------------------------
-- 2) Eventos de dia
--    kind: 'done' (dia passou a concluído) | 'undone' (conclusão revertida)
--    completed_at: instante da ação no aparelho (UTC). received_at: instante no servidor.
-- ---------------------------------------------------------------------
create table if not exists public.day_events (
  user_id      uuid not null references auth.users (id) on delete cascade,
  event_id     text not null check (event_id ~ '^[a-z0-9]{1,40}$'),
  day          date not null check (day >= date '2020-01-01'),
  kind         text not null check (kind in ('done', 'undone')),
  completed_at timestamptz not null,
  received_at  timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index if not exists day_events_user_day
  on public.day_events (user_id, day, completed_at desc, received_at desc, event_id desc);

revoke all on table public.day_events from public, anon, authenticated;
alter table public.day_events enable row level security;   -- sem políticas: API não lê nem escreve

-- ---------------------------------------------------------------------
-- 3) Estado derivado: dias concluídos entre [de, até] = último evento de cada dia é 'done'
--    Ordem do "último": completed_at, depois received_at, depois event_id (determinística).
-- ---------------------------------------------------------------------
create or replace function public.cf_days_done(uid uuid, p_from date, p_to date)
returns setof date
language sql
stable
security definer
set search_path = ''
as $$
  select e.day
    from (
      select distinct on (day) day, kind
        from public.day_events
       where user_id = uid and day between p_from and p_to
       order by day, completed_at desc, received_at desc, event_id desc
    ) e
   where e.kind = 'done'
$$;
revoke all on function public.cf_days_done(uuid, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) record_day_events(p jsonb)
--    Payload: { events: [ { id, day: "AAAA-MM-DD", kind: "done"|"undone", at: "ISO-8601 UTC" }, ... ] }
--    Resposta: [ { id, status: "accepted"|"duplicate"|"rejected", reason } ]
--    Regras:
--      - at > agora + janela_futuro_min           -> rejected: future_timestamp
--      - at < agora - janela_retro_h              -> rejected: too_old
--      - day > hoje (America/Sao_Paulo)           -> rejected: future_day
--      - id repetido para o mesmo usuário         -> duplicate (não altera nada)
--    Mesmo id com conteúdo diferente nunca sobrescreve: a primeira gravação vence.
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
  v_retro   integer;
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

  select janela_futuro_min, janela_retro_h into v_fut, v_retro
    from public.criterio_politica where id = 1;

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
      elsif v_at < v_now - make_interval(hours => v_retro) then
        v_status := 'rejected'; v_reason := 'too_old';
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
-- 5) grant_my_box v3 — critério por eventos, a partir do corte.
--    Mantém: payload (xp/granted ignorados), mês (não futuro), idempotência, sorteio de XP,
--    validação de itens, criterio_ativo = 0 (recusa), permissões.
-- ---------------------------------------------------------------------
create or replace function public.grant_my_box(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid         uuid := auth.uid();
  v_today     date := public.cf_sp_today();
  v_corte     date;
  v_cur_month text;
  v_id        text;
  v_month     text;
  v_first     date;
  v_last      date;
  v_items     jsonb;
  ej          jsonb;
  el          text;
  v_seen      text[] := '{}';
  row_b       public.user_boxes;
  cur         public.user_progress;
  v_level     integer;
  v_base      integer;
  v_span      integer;
  v_slots     integer;
  v_bp        integer;
  v_avail     integer;
  v_required  integer;
  v_subst     integer;
  v_xp        integer;
  v_crit_on   integer;
  v_crit_v    integer;
  v_count     integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 4000 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  if jsonb_typeof(p -> 'id') is distinct from 'string' or (p ->> 'id') !~ '^mensal:[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid_box' using errcode = '22023';
  end if;
  v_id := p ->> 'id';
  v_month := substring(v_id from 8);
  if jsonb_typeof(p -> 'month') is distinct from 'string' or (p ->> 'month') <> v_month then
    raise exception 'invalid_box' using errcode = '22023';
  end if;
  if v_month < '2020-01' then
    raise exception 'invalid_box' using errcode = '22023';
  end if;

  v_cur_month := to_char(v_today, 'YYYY-MM');
  if v_month > v_cur_month then
    raise exception 'future_month' using errcode = '22023';
  end if;

  select corte into v_corte from public.criterio_politica where id = 1;
  if v_month < to_char(v_corte, 'YYYY-MM') then
    raise exception 'before_cutoff' using errcode = '22023';   -- sem caixas retroativas
  end if;

  v_items := coalesce(p -> 'items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 20 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  perform public.cf_lock_user(uid);

  select * into row_b from public.user_boxes where user_id = uid and box_id = v_id;
  if found then
    return jsonb_build_object('id', row_b.box_id, 'xp', row_b.xp, 'items', row_b.items,
                              'granted', row_b.granted::text, 'opened', row_b.opened_at is not null,
                              'opened_at', row_b.opened_at);
  end if;

  insert into public.user_progress (user_id) values (uid) on conflict (user_id) do nothing;
  select * into cur from public.user_progress where user_id = uid;

  -- Critério: ativo somente por decisão (criterio_ativo = 1)
  select value into v_crit_on from public.box_config where key = 'criterio_ativo';
  if coalesce(v_crit_on, 0) <> 1 then
    raise exception 'criterion_not_defined' using errcode = '22023';
  end if;

  -- Critério: dias com treino no mês, a partir do corte, a partir de EVENTOS (não de done_dates)
  v_first := greatest(v_corte, to_date(v_month || '-01', 'YYYY-MM-DD'));
  v_last  := (to_date(v_month || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  select value into v_crit_v from public.box_config where key = 'criterio_dias_no_mes';
  select count(*) into v_count from public.cf_days_done(uid, v_first, v_last);
  if v_count < v_crit_v then
    raise exception 'criterion_not_met' using errcode = '22023';
  end if;

  -- XP sorteado no servidor (idêntico à v2: base x nível + sorteio + substituto)
  v_level := public.cf_level_for(cur.points);
  select value into v_base from public.box_config where key = 'xp_base';
  select value into v_span from public.box_config where key = 'xp_por_nivel';
  select value into v_slots from public.box_config where key = 'itens_por_caixa';
  select value into v_bp from public.box_config where key = 'xp_substituto_bp';

  select count(*) into v_avail
    from public.box_item_catalog c
   where not exists (select 1 from public.user_items ui where ui.user_id = uid and ui.item_id = c.id)
     and not exists (select 1 from public.user_boxes b where b.user_id = uid and b.items ? c.id);
  v_required := least(v_slots, v_avail);

  if jsonb_array_length(v_items) <> v_required then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  for ej in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(ej) <> 'string' then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
    el := ej #>> '{}';
    if el !~ '^[a-z0-9_]{1,40}$' or el = any (v_seen) then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
    if not exists (select 1 from public.box_item_catalog c where c.id = el) then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
    if exists (select 1 from public.user_items ui where ui.user_id = uid and ui.item_id = el) then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
    if exists (select 1 from public.user_boxes b where b.user_id = uid and b.items ? el) then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
    v_seen := v_seen || el;
  end loop;

  v_subst := (v_slots - v_required) * round(v_level * v_bp / 10000.0)::integer;
  v_xp := v_base * v_level
        + floor(random() * (v_span * v_level + 1))::integer
        + v_subst;

  insert into public.user_boxes (user_id, box_id, month, xp, items, granted)
  values (uid, v_id, v_month, v_xp, v_items, v_today);

  return jsonb_build_object('id', v_id, 'xp', v_xp, 'items', v_items,
                            'granted', v_today::text, 'opened', false, 'opened_at', null);
end;
$$;

revoke all on function public.grant_my_box(jsonb) from public, anon;
grant execute on function public.grant_my_box(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 6) VERIFICAÇÃO (somente leitura). Esperado: todas as linhas com ok = true.
-- ---------------------------------------------------------------------
select 'criterio_politica tem corte 2026-12-01 e janelas 5 min / 48 h' as check_name,
  coalesce((select corte = date '2026-12-01' and janela_futuro_min = 5 and janela_retro_h = 48
            from public.criterio_politica where id = 1), false) as ok
union all
select 'day_events existe, com RLS e sem acesso direto para authenticated/anon',
  (to_regclass('public.day_events') is not null
   and exists (select 1 from pg_class where oid = 'public.day_events'::regclass and relrowsecurity)
   and not exists (select 1 from information_schema.role_table_grants
                   where table_schema = 'public' and table_name = 'day_events'
                     and grantee in ('authenticated', 'anon', 'PUBLIC')))
union all
select 'record_day_events existe e só authenticated executa',
  exists (select 1 from information_schema.routine_privileges
          where grantee = 'authenticated' and routine_schema = 'public' and routine_name = 'record_day_events')
  and not exists (select 1 from information_schema.routine_privileges
          where grantee in ('anon', 'PUBLIC') and routine_schema = 'public' and routine_name = 'record_day_events')
union all
select 'cf_days_done não é executável por authenticated/anon',
  not exists (select 1 from information_schema.routine_privileges
          where grantee in ('authenticated', 'anon', 'PUBLIC') and routine_schema = 'public' and routine_name = 'cf_days_done')
union all
select 'criterio_ativo continua 0 (recusa a concessão)',
  coalesce((select value = 0 from public.box_config where key = 'criterio_ativo'), false)
union all
select 'RPCs de caixa e de eventos são SECURITY DEFINER',
  (select count(*) = 3 and bool_and(prosecdef) from pg_proc
   where pronamespace = 'public'::regnamespace and proname in ('grant_my_box', 'open_my_box', 'record_day_events'));
