-- =====================================================================
-- Crowfit — perfis (public.profiles): SQL COMPLETO PARA VERSIONAMENTO
-- Onde: Supabase > SQL Editor > New query > colar tudo > Run.
--
-- Este arquivo documenta o estado FINAL esperado do banco e pode ser rodado em
-- um banco novo OU no banco atual (onde a PARTE A já foi executada antes).
-- É idempotente: não apaga perfis, não recria tabela, não sobrescreve dados.
--
--   PARTE A — estrutura que JÁ existe no banco (SQL original da Etapa 2, sem o trigger de auth)
--   PARTE B — correções (idêntica a supabase-profiles-fix.sql): trigger sem exceção engolida,
--             recuperação ensure_my_profile(), backfill
--
-- Se o banco atual já tem a PARTE A, basta rodar supabase-profiles-fix.sql.
-- Depois de qualquer um dos dois, rode supabase-profiles-verify.sql.
-- =====================================================================

-- #####################################################################
-- PARTE A — ESTRUTURA EXISTENTE (já aplicada; aqui só para versionar)
-- #####################################################################

-- A1) Tabela. 1:1 com auth.users; apagar o usuário apaga o perfil (cascade).
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_display_name_chk
    check (display_name = btrim(display_name) and char_length(display_name) between 1 and 40)
);

comment on table public.profiles is 'Perfil do usuário no app. 1:1 com auth.users; criado por trigger (e recuperável por ensure_my_profile).';

-- A2) Antes de UPDATE: id imutável, created_at imutável, updated_at automático.
create or replace function public.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'O id do perfil não pode ser alterado';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.profiles_before_update() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_set_updated_at' and not tgisinternal
  ) then
    create trigger profiles_set_updated_at
      before update on public.profiles
      for each row execute function public.profiles_before_update();
  end if;
end
$$;

-- A3) Permissões (camada 1): cliente só LÊ e ATUALIZA display_name. Sem INSERT/DELETE.
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

-- A4) RLS (camada 2). Sem política para anon; sem política de INSERT/DELETE.
alter table public.profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_own') then
    create policy profiles_select_own on public.profiles
      for select to authenticated
      using ((select auth.uid()) = id);
  else
    alter policy profiles_select_own on public.profiles
      to authenticated
      using ((select auth.uid()) = id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own') then
    create policy profiles_update_own on public.profiles
      for update to authenticated
      using ((select auth.uid()) = id)
      with check ((select auth.uid()) = id);
  else
    alter policy profiles_update_own on public.profiles
      to authenticated
      using ((select auth.uid()) = id)
      with check ((select auth.uid()) = id);
  end if;
end
$$;

-- #####################################################################
-- PARTE B — CORREÇÕES (mesmo conteúdo de supabase-profiles-fix.sql)
-- #####################################################################

-- ---------------------------------------------------------------------
-- 1) Auxiliares de nome (puras; sem acesso a tabelas)
-- ---------------------------------------------------------------------
create or replace function public.profile_clean_name(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- remove caracteres de controle, apara espaços, limita a 40 caracteres, devolve null se ficar vazio
  select nullif(btrim(left(btrim(regexp_replace(coalesce(raw, ''), '[[:cntrl:]]', '', 'g')), 40)), '');
$$;

create or replace function public.profile_name_from_user(meta jsonb, email text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Mesma ordem do auth.js: full_name -> name -> parte do e-mail antes do @ -> 'Atleta'
  select coalesce(
    public.profile_clean_name(meta ->> 'full_name'),
    public.profile_clean_name(meta ->> 'name'),
    public.profile_clean_name(split_part(coalesce(email, ''), '@', 1)),
    'Atleta'
  );
$$;

revoke all on function public.profile_clean_name(text) from public, anon, authenticated;
revoke all on function public.profile_name_from_user(jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) handle_new_user(): SEM engolir exceções
--    Roda dentro da mesma transação do INSERT em auth.users. Se falhar, o PostgreSQL
--    desfaz o INSERT inteiro: o GoTrue devolve "Database error saving new user" e
--    NENHUMA conta parcial é criada (e-mail e Google).
--    on conflict do nothing: nunca duplica nem sobrescreve um perfil já existente.
--    O re-raise abaixo só acrescenta contexto (id e SQLSTATE) para os logs do Postgres.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, public.profile_name_from_user(new.raw_user_meta_data, new.email))
  on conflict (id) do nothing;
  return new;
exception when others then
  raise exception 'handle_new_user: falha ao criar o perfil de % (SQLSTATE %): %', new.id, sqlstate, sqlerrm
    using errcode = sqlstate;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Trigger: cria só se faltar; refaz apenas se estiver desabilitado ou apontando para outra função.
do $$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
    where t.tgrelid = 'auth.users'::regclass
      and t.tgname = 'on_auth_user_created'
      and not t.tgisinternal
      and (t.tgenabled <> 'O' or n.nspname <> 'public' or p.proname <> 'handle_new_user')
  ) then
    drop trigger on_auth_user_created on auth.users;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created' and not tgisinternal
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 3) ensure_my_profile(): recuperação segura de perfil ausente
--    - security definer + search_path vazio.
--    - NÃO recebe parâmetros: o id é SEMPRE auth.uid() (do JWT validado pelo Supabase).
--    - Anônimo (auth.uid() nulo) é rejeitado.
--    - Idempotente: on conflict do nothing; devolve o perfil existente sem alterá-lo.
--    - EXECUTE só para authenticated.
-- ---------------------------------------------------------------------
create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  u   record;
  result public.profiles;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select id, email, raw_user_meta_data into u from auth.users where id = uid;
  if not found then
    raise exception 'user_not_found' using errcode = '28000';
  end if;

  insert into public.profiles (id, display_name)
  values (u.id, public.profile_name_from_user(u.raw_user_meta_data, u.email))
  on conflict (id) do nothing;

  select * into result from public.profiles where id = uid;
  return result;
end;
$$;

revoke all on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;

comment on function public.ensure_my_profile() is
  'Recupera (cria se faltar) o perfil do usuário autenticado. Idempotente; id sempre = auth.uid().';

-- ---------------------------------------------------------------------
-- 4) Preenche usuários que ainda estejam sem perfil (não toca nos existentes)
-- ---------------------------------------------------------------------
insert into public.profiles (id, display_name)
select u.id, public.profile_name_from_user(u.raw_user_meta_data, u.email)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
