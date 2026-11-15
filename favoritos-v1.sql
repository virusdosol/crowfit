-- =====================================================================
-- Crowfit — Favoritos da biblioteca na conta (v1).
-- Rodar no SQL Editor do projeto PRODUCTION (crowfit). Idempotente.
-- Não altera dados existentes. Só cria a tabela e as funções.
-- =====================================================================

-- 1) Tabela: um favorito por exercício e conta
create table if not exists public.bib_favorites (
  user_id     uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null check (exercise_id ~ '^[a-z0-9_]{1,40}$'),
  created_at  timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
alter table public.bib_favorites enable row level security;
revoke all on public.bib_favorites from anon, authenticated;

-- 2) Ler os favoritos da conta logada
create or replace function public.get_my_favorites()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(f.exercise_id order by f.created_at)
      from public.bib_favorites as f
     where f.user_id = uid
  ), '[]'::jsonb);
end;
$$;

-- 3) Substituir a lista inteira de favoritos da conta (validada)
--    p = { ids: [ "po", "bu", ... ] }
create or replace function public.replace_my_favorites(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'ids') is distinct from 'array' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p -> 'ids') > 200 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  -- todo item precisa ser texto no formato de id do catálogo
  if exists (
    select 1 from jsonb_array_elements(p -> 'ids') as e
     where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[a-z0-9_]{1,40}$'
  ) then
    raise exception 'invalid_exercise_id' using errcode = '22023';
  end if;

  delete from public.bib_favorites as f
   where f.user_id = uid
     and f.exercise_id not in (select distinct (e #>> '{}') from jsonb_array_elements(p -> 'ids') as e);

  insert into public.bib_favorites (user_id, exercise_id)
  select uid, x.id
    from (select distinct (e #>> '{}') as id from jsonb_array_elements(p -> 'ids') as e) as x
  on conflict (user_id, exercise_id) do nothing;

  return jsonb_build_object('count', (select count(*) from public.bib_favorites where user_id = uid));
end;
$$;

-- 4) Só usuário logado executa as funções
revoke all on function public.get_my_favorites()           from public, anon;
revoke all on function public.replace_my_favorites(jsonb)  from public, anon;
grant execute on function public.get_my_favorites()           to authenticated;
grant execute on function public.replace_my_favorites(jsonb) to authenticated;

-- 5) Verificação (somente leitura): todas as linhas devem vir true
select 'tabela bib_favorites com RLS' as check_name,
  coalesce((select relrowsecurity from pg_class where oid = 'public.bib_favorites'::regclass), false) as ok
union all
select 'funções de favoritos existem',
  (select count(*) = 2 from information_schema.routines
    where routine_schema = 'public' and routine_name in ('get_my_favorites', 'replace_my_favorites'))
union all
select 'anon não executa favoritos',
  not exists (select 1 from information_schema.routine_privileges
              where grantee in ('anon', 'PUBLIC') and routine_schema = 'public'
                and routine_name in ('get_my_favorites', 'replace_my_favorites'));
