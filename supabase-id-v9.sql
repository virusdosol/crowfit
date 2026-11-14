-- =====================================================================
-- Crowfit — Migração v9: ID OBRIGATÓRIO; troca 1x a cada 30 dias após a primeira troca
-- STATUS: REVISÃO. NÃO APLICADA. Produção = projeto gqhcknwuqwudctanigyf.
--         NÃO executar sem autorização expressa. Sintaxe NÃO executada em PostgreSQL aqui.
--         Esta migração deve rodar ANTES de supabase-reset-contas-v9.sql.
--
-- Pré-requisito: supabase-profiles.sql, supabase-amigos-v8.sql (coluna profiles.handle).
--
-- Regras:
--   * Todo usuário precisa de ID. E-mail: o banco recusa a conta sem ID válido.
--     Google: o app bloqueia o uso até o ID ser escolhido (Google não envia esse dado).
--   * Escolher o ID pela primeira vez é livre (handle_changed_at continua nulo).
--   * A primeira TROCA grava handle_changed_at = agora. Depois disso, nova troca só
--     quando passarem 30 dias desse momento.
--   * Sem backfill: contas antigas continuam livres para trocar até a primeira troca.
-- Idempotente. Não apaga dados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Coluna da data da primeira troca (nula = ainda não trocou)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists handle_changed_at timestamptz;

-- ---------------------------------------------------------------------
-- 2) Validação pura do ID
-- ---------------------------------------------------------------------
create or replace function public.profile_valid_handle(h text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select h is not null and h ~ '^[a-z0-9_]{3,20}$';
$$;

revoke all on function public.profile_valid_handle(text) from public;

-- ---------------------------------------------------------------------
-- 3) handle_available(p jsonb) -> { available: bool }
--    Usado no cadastro (antes do login), por isso anon executa.
-- ---------------------------------------------------------------------
create or replace function public.handle_available(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h text;
begin
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'handle') is distinct from 'string' then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;
  h := lower(btrim(p ->> 'handle'));
  if not public.profile_valid_handle(h) then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;
  return jsonb_build_object('available', not exists (select 1 from public.profiles where handle = h));
end;
$$;

-- ---------------------------------------------------------------------
-- 4) handle_new_user(): ID obrigatório para e-mail; Google entra sem ID e o app pede depois.
--    ID já ocupado -> unique_violation: a conta NÃO é criada.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  h        text;
  provider text;
begin
  h := nullif(lower(btrim(coalesce(new.raw_user_meta_data ->> 'handle', ''))), '');
  provider := coalesce(new.raw_app_meta_data ->> 'provider', 'email');

  if h is not null and not public.profile_valid_handle(h) then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;
  if h is null and provider = 'email' then
    raise exception 'handle_required' using errcode = '22023';
  end if;

  insert into public.profiles (id, display_name, handle)
  values (new.id, public.profile_name_from_user(new.raw_user_meta_data, new.email), h)
  on conflict (id) do nothing;
  return new;
exception when others then
  raise exception 'handle_new_user: falha ao criar o perfil de % (SQLSTATE %): %', new.id, sqlstate, sqlerrm
    using errcode = sqlstate;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) set_my_handle(p jsonb) -> { handle, changed }
--    - Primeira escolha (handle nulo): livre, não grava data.
--    - Primeira troca: livre, grava handle_changed_at.
--    - Trocas seguintes: só se handle_changed_at tiver mais de 30 dias.
--    - Mesmo ID: nada muda.
-- ---------------------------------------------------------------------
create or replace function public.set_my_handle(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  h     text;
  v_cur text;
  v_at  timestamptz;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'handle') is distinct from 'string' then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;
  h := lower(btrim(p ->> 'handle'));
  if not public.profile_valid_handle(h) then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;

  select handle, handle_changed_at into v_cur, v_at
    from public.profiles where id = uid for update;
  if not found then
    raise exception 'profile_missing' using errcode = 'P0002';
  end if;

  if v_cur = h then
    return jsonb_build_object('handle', h, 'changed', false);
  end if;

  if v_at is not null and v_at > now() - interval '30 days' then
    raise exception 'handle_cooldown' using errcode = '22023';
  end if;

  begin
    update public.profiles
       set handle = h,
           handle_changed_at = case when v_cur is null then handle_changed_at else now() end
     where id = uid;
  exception when unique_violation then
    raise exception 'handle_taken' using errcode = '23505';
  end;

  return jsonb_build_object('handle', h, 'changed', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 6) Permissões
--    Cliente não altera handle nem handle_changed_at direto (só display_name, como antes).
-- ---------------------------------------------------------------------
revoke all on function public.handle_available(jsonb) from public;
grant execute on function public.handle_available(jsonb) to anon, authenticated;

revoke all on function public.set_my_handle(jsonb) from public, anon;
grant execute on function public.set_my_handle(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 7) Verificação (somente leitura): todas as linhas devem vir true
-- ---------------------------------------------------------------------
select 'coluna handle_changed_at existe' as check_name,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles' and column_name = 'handle_changed_at') as ok
union all
select 'handle_new_user exige ID em e-mail',
  coalesce((select prosrc like '%handle_required%' from pg_proc
             where proname = 'handle_new_user' and pronamespace = 'public'::regnamespace), false)
union all
select 'set_my_handle aplica cooldown',
  coalesce((select prosrc like '%handle_cooldown%' from pg_proc
             where proname = 'set_my_handle' and pronamespace = 'public'::regnamespace), false)
union all
select 'handle_available existe e anon executa',
  exists (select 1 from information_schema.routine_privileges
           where routine_schema = 'public' and routine_name = 'handle_available' and grantee = 'anon')
union all
select 'cliente não altera handle direto',
  not exists (select 1 from information_schema.role_column_grants
               where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'handle' and grantee = 'authenticated'
                 and privilege_type = 'UPDATE')
union all
select 'criterio_ativo continua 0',
  coalesce((select value = 0 from public.box_config where key = 'criterio_ativo'), false);
