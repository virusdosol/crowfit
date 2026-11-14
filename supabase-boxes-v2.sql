-- =====================================================================
-- Crowfit — Migração v2: caixas mensais (XP sorteado no servidor)
-- STATUS: REVISÃO. NÃO APLICADA. Não executar sem autorização expressa.
--
-- Substitui supabase-boxes.sql (v1). NÃO executar a v1: ela aceita XP
-- enviado pelo cliente e não valida mês, critério nem catálogo.
--
-- Onde: Supabase > SQL Editor > New query > colar tudo > Run (projeto de TESTE primeiro).
--
-- Pré-requisitos, NESTA ORDEM (já aplicados):
--   1) supabase-sync.sql         (user_progress, merge_my_progress, cf_int, cf_date)
--   2) supabase-level-curve.sql  (cf_level_for)
--   3) supabase-sync-v2.sql      (cf_lock_user)
--   4) supabase-items.sql        (user_items)
--
-- O que faz:
--   - XP da caixa sorteado SOMENTE no servidor. O "xp" enviado pelo cliente é ignorado.
--   - granted = data do servidor (America/Sao_Paulo). "granted" do payload é ignorado.
--   - Mês: aceita apenas o mês corrente ou meses encerrados. Nunca futuro.
--   - Critério mensal (12 dias com treino no mês): recusado com
--     'criterion_not_defined' enquanto box_config.criterio_ativo <> 1.
--   - Itens validados contra box_item_catalog (novo, espelha ITENS do core.js).
--   - Idempotente: a primeira gravação vence; repetições devolvem a caixa gravada.
--
-- LIMITAÇÃO CONHECIDA (pendência de segurança, exige decisão e fase separada):
--   O total de points continua vindo de merge_my_progress (base enviada pelo cliente).
--   user_boxes.xp NÃO é reconciliado com user_progress.points. Esta migração não altera
--   merge_my_progress nem cria reconciliação.
--
-- LIMITAÇÃO DO CRITÉRIO (motivo de criterio_ativo = 0):
--   done_dates no servidor é união (merge_my_progress nunca remove datas).
--   O cliente remove uma data de S.done quando a unidade fica incompleta.
--   Logo a contagem do servidor pode superar a do cliente. Enquanto isso não for
--   decidido, o critério não é reproduzido com exatidão e a concessão é recusada.
--   Ativar (update box_config set value = 1 where key = 'criterio_ativo') só após decisão.
--
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Parâmetros (só o servidor lê; a API não lê nem escreve)
-- ---------------------------------------------------------------------
create table if not exists public.box_config (
  key   text primary key check (key ~ '^[a-z_]{1,40}$'),
  value integer not null check (value between 0 and 10000)
);

-- xp_base/xp_por_nivel espelham BOX.xp do core.js (XP = base x nível + sorteio até porNivel x nível).
-- itens_por_caixa espelha BOX.itens. xp_substituto_bp = 3333 significa 33,33% (XP_SUBSTITUTO).
-- criterio_dias_no_mes espelha { t: "dias_no_mes", v: 12 }.
-- criterio_ativo = 0 recusa a concessão mensal (ver LIMITAÇÃO DO CRITÉRIO).
insert into public.box_config (key, value) values
  ('xp_base', 30),
  ('xp_por_nivel', 60),
  ('itens_por_caixa', 1),
  ('xp_substituto_bp', 3333),
  ('criterio_dias_no_mes', 12),
  ('criterio_ativo', 0)
on conflict (key) do nothing;

revoke all on table public.box_config from public, anon, authenticated;
alter table public.box_config enable row level security;   -- sem políticas

-- ---------------------------------------------------------------------
-- 2) Catálogo de itens do servidor (espelha ITENS / catalogoTemporario() do core.js)
--    Se o catálogo do core.js mudar, esta tabela deve mudar junto.
-- ---------------------------------------------------------------------
create table if not exists public.box_item_catalog (
  id        text primary key check (id ~ '^[a-z0-9_]{1,40}$'),
  raridade  text not null check (raridade in ('comum', 'epica', 'rara', 'lendaria')),
  tipo      text not null default 'aparencia' check (tipo = 'aparencia')
);

insert into public.box_item_catalog (id, raridade)
  select 'ap_com_' || lpad(n::text, 2, '0'), 'comum' from generate_series(1, 18) n
  on conflict (id) do nothing;
insert into public.box_item_catalog (id, raridade)
  select 'ap_epi_' || lpad(n::text, 2, '0'), 'epica' from generate_series(1, 9) n
  on conflict (id) do nothing;
insert into public.box_item_catalog (id, raridade)
  select 'ap_rar_' || lpad(n::text, 2, '0'), 'rara' from generate_series(1, 5) n
  on conflict (id) do nothing;
insert into public.box_item_catalog (id, raridade)
  select 'ap_len_' || lpad(n::text, 2, '0'), 'lendaria' from generate_series(1, 3) n
  on conflict (id) do nothing;

revoke all on table public.box_item_catalog from public, anon, authenticated;
alter table public.box_item_catalog enable row level security;   -- sem políticas

-- ---------------------------------------------------------------------
-- 3) Faixa de XP por nível (mantida da v1; usada só por verificação)
-- ---------------------------------------------------------------------
create or replace function public.cf_box_xp_range(lvl integer, out lo integer, out hi integer)
returns record
language sql
stable
security definer
set search_path = ''
as $$
  select (select value from public.box_config where key = 'xp_base') * lvl,
         (select value from public.box_config where key = 'xp_base') * lvl
         + (select value from public.box_config where key = 'xp_por_nivel') * lvl
$$;
revoke all on function public.cf_box_xp_range(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Data de hoje no fuso de São Paulo (uso interno das RPCs)
-- ---------------------------------------------------------------------
create or replace function public.cf_sp_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
revoke all on function public.cf_sp_today() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) Tabela user_boxes (mantida da v1)
-- ---------------------------------------------------------------------
create table if not exists public.user_boxes (
  user_id    uuid not null references auth.users (id) on delete cascade,
  box_id     text not null check (box_id ~ '^mensal:[0-9]{4}-[0-9]{2}$'),
  month      text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  xp         integer not null check (xp between 0 and 10000000),
  items      jsonb not null default '[]'::jsonb
             check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 20),
  granted    date not null,
  opened_at  timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, box_id),
  check (box_id = 'mensal:' || month)
);
comment on table public.user_boxes is
  'Caixas mensais. Escrita só via grant_my_box() e open_my_box(). Conteúdo fixo após a primeira gravação.';

revoke all on table public.user_boxes from public, anon, authenticated;
grant select on table public.user_boxes to authenticated;
alter table public.user_boxes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_boxes' and policyname = 'user_boxes_select_own') then
    create policy user_boxes_select_own on public.user_boxes
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 6) grant_my_box(p jsonb)
--    Payload aceito: { id: "mensal:AAAA-MM", month: "AAAA-MM", items: ["id", ...] }
--    "xp" e "granted", se enviados, são IGNORADOS.
--    Ordem: payload -> mês -> lock -> já existe? (devolve) -> critério -> sorteio -> itens -> insert.
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
  v_cur_month text;
  v_id        text;
  v_month     text;
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

  -- Identificador e mês
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

  -- Mês futuro: recusado. Mês corrente e encerrados: aceitos.
  v_cur_month := to_char(v_today, 'YYYY-MM');
  if v_month > v_cur_month then
    raise exception 'future_month' using errcode = '22023';
  end if;

  -- Itens: formato básico (validação completa após o lock)
  v_items := coalesce(p -> 'items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 20 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  perform public.cf_lock_user(uid);

  -- Idempotência: caixa já gravada é devolvida sem alterações
  select * into row_b from public.user_boxes where user_id = uid and box_id = v_id;
  if found then
    return jsonb_build_object('id', row_b.box_id, 'xp', row_b.xp, 'items', row_b.items,
                              'granted', row_b.granted::text, 'opened', row_b.opened_at is not null,
                              'opened_at', row_b.opened_at);
  end if;

  insert into public.user_progress (user_id) values (uid) on conflict (user_id) do nothing;
  select * into cur from public.user_progress where user_id = uid;

  -- Critério mensal: 12 dias com treino no mês (semântica de BOX.criterio do core.js)
  select value into v_crit_on from public.box_config where key = 'criterio_ativo';
  if coalesce(v_crit_on, 0) <> 1 then
    raise exception 'criterion_not_defined' using errcode = '22023';
  end if;
  select value into v_crit_v from public.box_config where key = 'criterio_dias_no_mes';
  select count(distinct d) into v_count
    from unnest(cur.done_dates) as d
   where to_char(d, 'YYYY-MM') = v_month;
  if v_count < v_crit_v then
    raise exception 'criterion_not_met' using errcode = '22023';
  end if;

  -- XP sorteado no servidor
  v_level := public.cf_level_for(cur.points);
  select value into v_base from public.box_config where key = 'xp_base';
  select value into v_span from public.box_config where key = 'xp_por_nivel';
  select value into v_slots from public.box_config where key = 'itens_por_caixa';
  select value into v_bp from public.box_config where key = 'xp_substituto_bp';

  -- Itens disponíveis: no catálogo e não possuídos nem reservados em caixas do usuário
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
      raise exception 'invalid_items' using errcode = '22023';   -- id desconhecido
    end if;
    if exists (select 1 from public.user_items ui where ui.user_id = uid and ui.item_id = el) then
      raise exception 'invalid_items' using errcode = '22023';   -- já possuído
    end if;
    if exists (select 1 from public.user_boxes b where b.user_id = uid and b.items ? el) then
      raise exception 'invalid_items' using errcode = '22023';   -- reservado em outra caixa
    end if;
    v_seen := v_seen || el;
  end loop;

  -- XP: base x nível + sorteio (0..porNivel x nível) + substituto por slot sem item
  -- Substituto = round(nível x bp / 10000) por slot sem item (espelha xpSubstituto do core.js).
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

-- ---------------------------------------------------------------------
-- 7) open_my_box(p jsonb) — sem alterações em relação à v1
--    Registra a ABERTURA uma vez. NÃO soma XP (o XP entra por merge_my_progress).
-- ---------------------------------------------------------------------
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
    return jsonb_build_object('id', v_id, 'already', false, 'opened_at', row_b.opened_at);
  end if;
  return jsonb_build_object('id', v_id, 'already', true, 'opened_at', row_b.opened_at);
end;
$$;

-- ---------------------------------------------------------------------
-- 8) Permissões: só authenticated executa as RPCs
-- ---------------------------------------------------------------------
revoke all on function public.grant_my_box(jsonb) from public, anon;
revoke all on function public.open_my_box(jsonb)  from public, anon;
grant execute on function public.grant_my_box(jsonb) to authenticated;
grant execute on function public.open_my_box(jsonb)  to authenticated;

-- ---------------------------------------------------------------------
-- 9) VERIFICAÇÃO (somente leitura). Esperado: todas as linhas com ok = true,
--    exceto a linha de criterio_ativo, que deve ser false enquanto a decisão estiver pendente.
-- ---------------------------------------------------------------------
select 'box_config tem as 6 chaves esperadas' as check_name,
  coalesce((select count(*) = 6 from public.box_config
            where key in ('xp_base','xp_por_nivel','itens_por_caixa','xp_substituto_bp','criterio_dias_no_mes','criterio_ativo')), false) as ok
union all
select 'faixa de XP do nível 1 é 30 a 90',
  (select lo = 30 and hi = 90 from public.cf_box_xp_range(1))
union all
select 'faixa de XP do nível 4 é 120 a 360',
  (select lo = 120 and hi = 360 from public.cf_box_xp_range(4))
union all
select 'box_item_catalog tem 35 itens (18 comum, 9 épica, 5 rara, 3 lendária)',
  (select count(*) = 35
          and count(*) filter (where raridade = 'comum') = 18
          and count(*) filter (where raridade = 'epica') = 9
          and count(*) filter (where raridade = 'rara') = 5
          and count(*) filter (where raridade = 'lendaria') = 3
   from public.box_item_catalog)
union all
select 'criterio_ativo está desligado (0) até decisão',
  coalesce((select value = 0 from public.box_config where key = 'criterio_ativo'), false)
union all
select 'user_boxes com RLS e só SELECT para authenticated',
  (to_regclass('public.user_boxes') is not null
   and exists (select 1 from pg_class where oid = 'public.user_boxes'::regclass and relrowsecurity)
   and (select count(*) = 1 from pg_policies where schemaname = 'public' and tablename = 'user_boxes' and cmd = 'SELECT')
   and not exists (select 1 from information_schema.role_table_grants
                   where grantee in ('authenticated', 'anon', 'PUBLIC') and table_schema = 'public'
                     and table_name = 'user_boxes' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')))
union all
select 'RPCs grant_my_box e open_my_box são SECURITY DEFINER',
  (select count(*) = 2 and bool_and(prosecdef) from pg_proc
   where pronamespace = 'public'::regnamespace and proname in ('grant_my_box', 'open_my_box'))
union all
select 'RPCs: só authenticated executa',
  (select count(*) = 2 from information_schema.routine_privileges
   where grantee = 'authenticated' and routine_schema = 'public' and routine_name in ('grant_my_box', 'open_my_box'))
  and not exists (select 1 from information_schema.routine_privileges
   where grantee in ('anon', 'PUBLIC') and routine_schema = 'public' and routine_name in ('grant_my_box', 'open_my_box'))
union all
select 'cf_sp_today e cf_box_xp_range não são executáveis por authenticated',
  not exists (select 1 from information_schema.routine_privileges
   where grantee in ('authenticated', 'anon', 'PUBLIC') and routine_schema = 'public'
     and routine_name in ('cf_sp_today', 'cf_box_xp_range'));
