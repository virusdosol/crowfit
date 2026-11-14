-- =====================================================================
-- Crowfit — Migração: caixas mensais (sincronização idempotente)
-- Onde: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pré-requisito: supabase-sync.sql, supabase-sync-v2.sql e supabase-level-curve.sql já aplicados.
--
-- O que acrescenta (NADA é removido ou alterado):
--   1) box_config        : faixa de XP por nível (única fonte no servidor; editar aqui muda tudo)
--   2) user_boxes        : uma linha por caixa (chave: usuário + id da caixa)
--   3) grant_my_box(p)   : registra a caixa uma única vez (a primeira gravação vence)
--   4) open_my_box(p)    : registra a ABERTURA uma única vez. NÃO soma XP.
--
-- Regra de XP: o XP da caixa entra em points pelo mesmo caminho de tudo o resto,
--   que é a base enviada por merge_my_progress (merge por maior valor, nunca dobra).
--   open_my_box só marca quando a caixa foi aberta.
--
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Faixa de XP (espelha BOX.xp do core.js). Só o servidor lê; o cliente não escreve.
-- ---------------------------------------------------------------------
create table if not exists public.box_config (
  key   text primary key check (key ~ '^[a-z_]{1,40}$'),
  value integer not null check (value between 0 and 10000)
);
insert into public.box_config (key, value) values ('xp_base', 30), ('xp_por_nivel', 60)
  on conflict (key) do nothing;
revoke all on table public.box_config from public, anon, authenticated;
alter table public.box_config enable row level security;   -- sem políticas: API não lê nem escreve

-- Faixa [lo, hi] de XP para o nível informado. Lida só por dentro das RPCs.
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
-- 2) Tabela user_boxes (leitura só das próprias linhas; escrita só pelas RPCs)
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
-- 3) grant_my_box(p jsonb)
--    Payload: { id: "mensal:AAAA-MM", month: "AAAA-MM", xp, items: ["id", ...], granted: "AAAA-MM-DD" }
--    Grava a caixa se não existir. Se existir, devolve a gravada (não altera nada).
-- ---------------------------------------------------------------------
create or replace function public.grant_my_box(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  v_id    text;
  v_month text;
  v_xp    integer;
  v_items jsonb;
  v_day   date;
  cur     public.user_progress;
  v_lo    integer;
  v_hi    integer;
  row_b   public.user_boxes;
  el      jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 4000 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  if jsonb_typeof(p -> 'id') is distinct from 'string' or (p ->> 'id') !~ '^mensal:[0-9]{4}-[0-9]{2}$' then
    raise exception 'invalid_box' using errcode = '22023';
  end if;
  v_id := p ->> 'id';
  v_month := substring(v_id from 8);
  if jsonb_typeof(p -> 'month') is distinct from 'string' or (p ->> 'month') <> v_month then
    raise exception 'invalid_box' using errcode = '22023';
  end if;

  v_day := public.cf_date(p -> 'granted', 'granted', date '2020-01-01');

  v_items := coalesce(p -> 'items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 20 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  for el in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(el) <> 'string' or (el #>> '{}') !~ '^[a-z0-9_]{1,40}$' then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
  end loop;

  perform public.cf_lock_user(uid);

  select * into row_b from public.user_boxes where user_id = uid and box_id = v_id;
  if found then
    return jsonb_build_object('id', row_b.box_id, 'xp', row_b.xp, 'items', row_b.items,
                              'granted', row_b.granted::text, 'opened', row_b.opened_at is not null,
                              'opened_at', row_b.opened_at);
  end if;

  insert into public.user_progress (user_id) values (uid) on conflict (user_id) do nothing;
  select * into cur from public.user_progress where user_id = uid;
  select lo, hi into v_lo, v_hi from public.cf_box_xp_range(public.cf_level_for(cur.points));
  v_xp := public.cf_int(p -> 'xp', v_lo, v_hi, 'xp');

  insert into public.user_boxes (user_id, box_id, month, xp, items, granted)
  values (uid, v_id, v_month, v_xp, v_items, v_day);

  return jsonb_build_object('id', v_id, 'xp', v_xp, 'items', v_items,
                            'granted', v_day::text, 'opened', false, 'opened_at', null);
end;
$$;

-- ---------------------------------------------------------------------
-- 4) open_my_box(p jsonb)
--    Payload: { id: "mensal:AAAA-MM" }
--    Registra a abertura UMA vez (opened_at). NÃO altera user_progress: o XP já entra pela base.
--    Se já estava aberta, devolve a data gravada.
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
-- 5) Permissões das RPCs: só authenticated executa
-- ---------------------------------------------------------------------
revoke all on function public.grant_my_box(jsonb) from public, anon;
revoke all on function public.open_my_box(jsonb)  from public, anon;
grant execute on function public.grant_my_box(jsonb) to authenticated;
grant execute on function public.open_my_box(jsonb)  to authenticated;

-- ---------------------------------------------------------------------
-- 6) VERIFICAÇÃO (somente leitura). Esperado: todas as linhas com ok = true.
-- ---------------------------------------------------------------------
select 'box_config tem xp_base = 30 e xp_por_nivel = 60' as check_name,
  coalesce((select count(*) = 2 and bool_and((key = 'xp_base' and value = 30) or (key = 'xp_por_nivel' and value = 60))
            from public.box_config where key in ('xp_base', 'xp_por_nivel')), false) as ok
union all
select 'faixa de XP do nível 1 é 30 a 90',
  (select lo = 30 and hi = 90 from public.cf_box_xp_range(1))
union all
select 'faixa de XP do nível 4 é 120 a 360',
  (select lo = 120 and hi = 360 from public.cf_box_xp_range(4))
union all
select 'user_boxes com RLS, só SELECT para authenticated',
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
   where grantee in ('anon', 'PUBLIC') and routine_schema = 'public' and routine_name in ('grant_my_box', 'open_my_box'));
