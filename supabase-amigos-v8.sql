-- =====================================================================
-- Crowfit — Migração v8: AMIGOS (ID único, pedidos e amizades)
-- STATUS: REVISÃO. NÃO APLICADA. Produção = projeto gqhcknwuqwudctanigyf.
--         NÃO executar sem autorização expressa. Sintaxe NÃO executada em PostgreSQL aqui.
--
-- Pré-requisito: supabase-profiles.sql (profiles), supabase-sync.sql (user_progress, cf_level_for).
--
-- Regras:
--   * ID (handle): 3 a 20 caracteres, só minúsculas, números e "_". Único. Pode ser trocado.
--   * Para ser amigo, a pessoa precisa de um ID. Pedido por ID; quem recebe aceita ou recusa.
--   * Se os dois se pedirem ao mesmo tempo, vira amizade automaticamente.
--   * O que um amigo vê: ID, nome de exibição, nível e XP total. Nada mais.
--   * Limite: 300 vínculos por pessoa (pedidos e amigos somados).
--   * Tabela sem acesso direto: tudo passa pelas funções abaixo (security definer).
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ID no perfil (único; nulo até a pessoa escolher)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists handle text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_handle_chk') then
    alter table public.profiles add constraint profiles_handle_chk
      check (handle is null or handle ~ '^[a-z0-9_]{3,20}$');
  end if;
end $$;
create unique index if not exists profiles_handle_key on public.profiles (handle);

-- ---------------------------------------------------------------------
-- 2) Vínculos entre jogadores
-- ---------------------------------------------------------------------
create table if not exists public.friendships (
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status       text not null check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);
comment on table public.friendships is 'Pedidos e amizades. Escrita e leitura só pelas funções friends_*/social_*.';
revoke all on table public.friendships from public, anon, authenticated;
alter table public.friendships enable row level security;

-- ---------------------------------------------------------------------
-- 3) set_my_handle(p jsonb) -> { handle }
-- ---------------------------------------------------------------------
create or replace function public.set_my_handle(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  h   text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'handle') is distinct from 'string' then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;
  h := lower(btrim(p ->> 'handle'));
  if h !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;
  begin
    update public.profiles set handle = h where id = uid;
  exception when unique_violation then
    raise exception 'handle_taken' using errcode = '23505';
  end;
  if not found then
    raise exception 'profile_missing' using errcode = 'P0002';
  end if;
  return jsonb_build_object('handle', h);
end;
$$;

-- ---------------------------------------------------------------------
-- 4) get_my_social() -> { handle, name, level, xp, friends[], incoming[], outgoing[] }
-- ---------------------------------------------------------------------
create or replace function public.get_my_social()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_me public.profiles;
  v_pts integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_me from public.profiles where id = uid;
  select coalesce(up.points, 0) into v_pts from public.user_progress as up where up.user_id = uid;
  v_pts := coalesce(v_pts, 0);

  return jsonb_build_object(
    'handle', v_me.handle,
    'name', v_me.display_name,
    'level', public.cf_level_for(v_pts),
    'xp', v_pts,
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('handle', p.handle, 'name', p.display_name,
                                          'level', public.cf_level_for(coalesce(up.points, 0)), 'xp', coalesce(up.points, 0))
                       order by p.handle)
        from public.friendships as f
        join public.profiles as p on p.id = case when f.requester_id = uid then f.addressee_id else f.requester_id end
        left join public.user_progress as up on up.user_id = p.id
       where f.status = 'accepted' and uid in (f.requester_id, f.addressee_id)
    ), '[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object('handle', p.handle, 'name', p.display_name) order by f.created_at)
        from public.friendships as f join public.profiles as p on p.id = f.requester_id
       where f.status = 'pending' and f.addressee_id = uid
    ), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object('handle', p.handle, 'name', p.display_name) order by f.created_at)
        from public.friendships as f join public.profiles as p on p.id = f.addressee_id
       where f.status = 'pending' and f.requester_id = uid
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5) send_friend_request(p jsonb) -> { status: 'sent' | 'accepted' }
-- ---------------------------------------------------------------------
create or replace function public.send_friend_request(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := auth.uid();
  h      text;
  v_to   uuid;
  v_n    integer;
  v_rev  text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'handle') is distinct from 'string' then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;
  h := lower(btrim(p ->> 'handle'));
  if h !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;

  select id into v_to from public.profiles where handle = h;
  if v_to is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if v_to = uid then
    raise exception 'self_request' using errcode = '22023';
  end if;

  -- já existe vínculo nos dois sentidos?
  select f.status into v_rev from public.friendships as f
   where (f.requester_id = uid and f.addressee_id = v_to) or (f.requester_id = v_to and f.addressee_id = uid)
   limit 1;
  if v_rev = 'accepted' then
    raise exception 'already_friends' using errcode = '22023';
  end if;
  if v_rev = 'pending' and exists (select 1 from public.friendships where requester_id = uid and addressee_id = v_to) then
    raise exception 'already_sent' using errcode = '22023';
  end if;

  -- o outro já tinha pedido para mim: aceita agora
  if exists (select 1 from public.friendships where requester_id = v_to and addressee_id = uid and status = 'pending') then
    update public.friendships set status = 'accepted', accepted_at = now()
     where requester_id = v_to and addressee_id = uid;
    return jsonb_build_object('status', 'accepted');
  end if;

  select count(*) into v_n from public.friendships where requester_id = uid or addressee_id = uid;
  if v_n >= 300 then
    raise exception 'too_many' using errcode = '22023';
  end if;

  insert into public.friendships (requester_id, addressee_id, status) values (uid, v_to, 'pending');
  return jsonb_build_object('status', 'sent');
end;
$$;

-- ---------------------------------------------------------------------
-- 6) respond_friend_request(p jsonb) -> { status: 'accepted' | 'declined' }
--    p = { handle: "<quem pediu>", accept: true|false }
-- ---------------------------------------------------------------------
create or replace function public.respond_friend_request(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  h    text;
  v_from uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'handle') is distinct from 'string'
     or jsonb_typeof(p -> 'accept') is distinct from 'boolean' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  h := lower(btrim(p ->> 'handle'));

  select f.requester_id into v_from from public.friendships as f
    join public.profiles as pr on pr.id = f.requester_id
   where pr.handle = h and f.addressee_id = uid and f.status = 'pending';
  if v_from is null then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  if (p ->> 'accept')::boolean then
    update public.friendships set status = 'accepted', accepted_at = now()
     where requester_id = v_from and addressee_id = uid;
    return jsonb_build_object('status', 'accepted');
  end if;
  delete from public.friendships where requester_id = v_from and addressee_id = uid;
  return jsonb_build_object('status', 'declined');
end;
$$;

-- ---------------------------------------------------------------------
-- 7) remove_friend(p jsonb): desfaz amizade, cancela pedido enviado ou recusa um recebido
-- ---------------------------------------------------------------------
create or replace function public.remove_friend(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  h   text;
  v_other uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'handle') is distinct from 'string' then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;
  h := lower(btrim(p ->> 'handle'));
  select id into v_other from public.profiles where handle = h;
  if v_other is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  delete from public.friendships
   where (requester_id = uid and addressee_id = v_other) or (requester_id = v_other and addressee_id = uid);
  return jsonb_build_object('status', 'removed');
end;
$$;

-- ---------------------------------------------------------------------
-- 8) Permissões: só usuários logados executam as funções
-- ---------------------------------------------------------------------
revoke all on function public.set_my_handle(jsonb)          from public, anon;
revoke all on function public.get_my_social()               from public, anon;
revoke all on function public.send_friend_request(jsonb)    from public, anon;
revoke all on function public.respond_friend_request(jsonb) from public, anon;
revoke all on function public.remove_friend(jsonb)          from public, anon;
grant execute on function public.set_my_handle(jsonb)          to authenticated;
grant execute on function public.get_my_social()               to authenticated;
grant execute on function public.send_friend_request(jsonb)    to authenticated;
grant execute on function public.respond_friend_request(jsonb) to authenticated;
grant execute on function public.remove_friend(jsonb)          to authenticated;

-- ---------------------------------------------------------------------
-- 9) Verificação (somente leitura): todas as linhas devem vir true
-- ---------------------------------------------------------------------
select 'coluna handle existe' as check_name,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'handle') as ok
union all
select 'índice único de handle', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'profiles_handle_key')
union all
select 'friendships com RLS ativo', coalesce((select relrowsecurity from pg_class where oid = 'public.friendships'::regclass), false)
union all
select 'funções de amigos existem',
  (select count(*) = 5 from information_schema.routines
    where routine_schema = 'public' and routine_name in ('set_my_handle','get_my_social','send_friend_request','respond_friend_request','remove_friend'))
union all
select 'anon não executa funções de amigos',
  not exists (select 1 from information_schema.routine_privileges
              where grantee in ('anon', 'PUBLIC') and routine_schema = 'public'
                and routine_name in ('set_my_handle','get_my_social','send_friend_request','respond_friend_request','remove_friend'))
union all
select 'criterio_ativo continua 0',
  coalesce((select value = 0 from public.box_config where key = 'criterio_ativo'), false);
