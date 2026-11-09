-- =====================================================================
-- Crowfit — VERIFICAÇÃO do banco de perfis (somente leitura; não altera nada)
-- Onde: Supabase > SQL Editor > New query > colar tudo > Run.
-- Esperado: todas as linhas com resultado = OK.
-- =====================================================================
with chk as (
  select 1 as n, 'tabela public.profiles existe' as check_name,
    (to_regclass('public.profiles') is not null) as ok,
    '' as detail
  union all
  select 2, 'RLS ligado em public.profiles',
    coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.profiles')), false), ''
  union all
  select 3, 'nenhum usuário sem perfil',
    (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)) = 0,
    (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id))::text || ' sem perfil'
  union all
  select 4, 'políticas: só SELECT e UPDATE, só authenticated, ambas com auth.uid()',
    coalesce((
      select count(*) = 2
        and count(*) filter (where cmd = 'SELECT') = 1
        and count(*) filter (where cmd = 'UPDATE') = 1
        and bool_and(roles = '{authenticated}')
        and bool_and(coalesce(qual, '') like '%auth.uid()%')
        and bool_and(cmd <> 'UPDATE' or coalesce(with_check, '') like '%auth.uid()%')
      from pg_policies where schemaname = 'public' and tablename = 'profiles'
    ), false),
    coalesce((select string_agg(policyname || ':' || cmd, ', ') from pg_policies where schemaname = 'public' and tablename = 'profiles'), 'nenhuma')
  union all
  select 5, 'authenticated: SELECT e UPDATE só em display_name; sem INSERT/DELETE/TRUNCATE',
    has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    and not has_table_privilege('authenticated', 'public.profiles', 'INSERT')
    and not has_table_privilege('authenticated', 'public.profiles', 'DELETE')
    and not has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE')
    and not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
    and has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'UPDATE'),
    ''
  union all
  select 6, 'anon: nenhum acesso à tabela',
    not has_any_column_privilege('anon', 'public.profiles', 'SELECT')
    and not has_any_column_privilege('anon', 'public.profiles', 'INSERT')
    and not has_any_column_privilege('anon', 'public.profiles', 'UPDATE')
    and not has_table_privilege('anon', 'public.profiles', 'DELETE'),
    ''
  union all
  select 7, 'trigger profiles_set_updated_at (id imutável) existe',
    exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_set_updated_at' and not tgisinternal),
    ''
  union all
  select 8, 'trigger on_auth_user_created ativo em auth.users -> public.handle_new_user',
    exists (
      select 1 from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace n on n.oid = p.pronamespace
      where t.tgrelid = 'auth.users'::regclass and t.tgname = 'on_auth_user_created' and not t.tgisinternal
        and t.tgenabled = 'O' and n.nspname = 'public' and p.proname = 'handle_new_user'
    ),
    ''
  union all
  select 9, 'handle_new_user: security definer, search_path fixo, SEM raise warning (versão corrigida)',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'handle_new_user' and p.prosecdef
        and p.proconfig::text like '%search_path%'
        and pg_get_functiondef(p.oid) not ilike '%raise warning%'
    ),
    ''
  union all
  select 10, 'toda função SECURITY DEFINER em public tem search_path fixo',
    not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')
    ),
    coalesce((
      select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')
    ), 'nenhuma violação')
  union all
  select 11, 'ensure_my_profile: existe, security definer, EXECUTE só para authenticated',
    case when to_regprocedure('public.ensure_my_profile()') is null then false
    else exists (select 1 from pg_proc where oid = to_regprocedure('public.ensure_my_profile()') and prosecdef)
      and has_function_privilege('authenticated', 'public.ensure_my_profile()', 'EXECUTE')
      and not has_function_privilege('anon', 'public.ensure_my_profile()', 'EXECUTE')
    end,
    ''
  union all
  select 12, 'funções internas (handle_new_user, profile_*, profiles_before_update) não são executáveis por anon/authenticated',
    case when to_regprocedure('public.handle_new_user()') is null
           or to_regprocedure('public.profile_name_from_user(jsonb,text)') is null
           or to_regprocedure('public.profile_clean_name(text)') is null
           or to_regprocedure('public.profiles_before_update()') is null then false
    else not (
      has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
      or has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')
      or has_function_privilege('anon', 'public.profile_name_from_user(jsonb,text)', 'EXECUTE')
      or has_function_privilege('authenticated', 'public.profile_name_from_user(jsonb,text)', 'EXECUTE')
      or has_function_privilege('anon', 'public.profile_clean_name(text)', 'EXECUTE')
      or has_function_privilege('authenticated', 'public.profile_clean_name(text)', 'EXECUTE')
      or has_function_privilege('anon', 'public.profiles_before_update()', 'EXECUTE')
      or has_function_privilege('authenticated', 'public.profiles_before_update()', 'EXECUTE')
    ) end,
    ''
)
select n, check_name, case when ok then 'OK' else 'FALHOU' end as resultado, detail
from chk
order by n;

-- ---------------------------------------------------------------------
-- TESTE OPCIONAL da recuperação (simula um usuário logado; nada é gravado: termina em ROLLBACK).
-- Rode SEPARADO do bloco acima. Troque o UUID por um id real de auth.users.
-- Esperado: devolve 1 linha com id = o UUID informado (e nenhuma linha nova se o perfil já existia).
-- ---------------------------------------------------------------------
-- begin;
--   select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
--   set local role authenticated;
--   select * from public.ensure_my_profile();
-- rollback;
