-- =====================================================================
-- Crowfit — perfil de usuário (public.profiles)
-- Onde executar: Supabase > SQL Editor > New query > colar tudo > Run.
-- É seguro rodar mais de uma vez (idempotente): não apaga nem sobrescreve perfis.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TABELA
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_display_name_chk
    check (display_name = btrim(display_name) and char_length(display_name) between 1 and 40)
);

comment on table public.profiles is 'Perfil público-do-app do usuário. 1:1 com auth.users; criado por trigger.';

-- ---------------------------------------------------------------------
-- 2) FUNÇÃO AUXILIAR: escolhe o nome de exibição
--    Mesma ordem usada pelo auth.js: full_name -> name -> parte do e-mail antes do @ -> 'Atleta'
--    (cadastro por e-mail envia full_name; Google envia full_name e name)
-- ---------------------------------------------------------------------
create or replace function public.profile_name_from_user(meta jsonb, email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(left(btrim(coalesce(meta ->> 'full_name', '')), 40)), ''),
    nullif(btrim(left(btrim(coalesce(meta ->> 'name', '')), 40)), ''),
    nullif(btrim(left(btrim(split_part(coalesce(email, ''), '@', 1)), 40)), ''),
    'Atleta'
  );
$$;

-- Não precisa ficar exposta como RPC da API.
revoke all on function public.profile_name_from_user(jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) CRIAÇÃO AUTOMÁTICA DO PERFIL (trigger em auth.users)
--    security definer + search_path vazio. O ID vem de auth.users, nunca do cliente.
--    on conflict do nothing: nunca duplica nem sobrescreve.
--    Se algo der errado, só emite WARNING: o cadastro do usuário NÃO é bloqueado
--    (o app trata perfil ausente com segurança).
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
  raise warning 'handle_new_user falhou para % (%): %', new.id, sqlstate, sqlerrm;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4) updated_at automático (e id imutável)
-- ---------------------------------------------------------------------
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

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.profiles_before_update();

-- ---------------------------------------------------------------------
-- 5) PERMISSÕES (camada 1) — o frontend só pode LER e ATUALIZAR display_name.
--    Sem INSERT e sem DELETE para anon/authenticated.
-- ---------------------------------------------------------------------
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 6) ROW LEVEL SECURITY (camada 2)
--    Nenhuma política para anon => anônimo não acessa nada.
--    Nenhuma política de INSERT/DELETE => ninguém cria/apaga perfil pelo cliente.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------
-- 7) PREENCHIMENTO DOS USUÁRIOS JÁ EXISTENTES
--    Só insere quem ainda não tem perfil. Perfis existentes não são tocados.
-- ---------------------------------------------------------------------
insert into public.profiles (id, display_name)
select u.id, public.profile_name_from_user(u.raw_user_meta_data, u.email)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 8) VERIFICAÇÃO (opcional, só leitura) — rode separadamente depois
-- ---------------------------------------------------------------------
-- a) Deve retornar 0 (ninguém sem perfil):
--    select count(*) as sem_perfil
--    from auth.users u left join public.profiles p on p.id = u.id
--    where p.id is null;
--
-- b) Deve mostrar rls_ligado = true:
--    select relname, relrowsecurity as rls_ligado from pg_class where oid = 'public.profiles'::regclass;
--
-- c) Deve listar exatamente 2 políticas (select e update):
--    select policyname, cmd, roles from pg_policies where tablename = 'profiles';
--
-- d) Deve listar o trigger on_auth_user_created:
--    select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
