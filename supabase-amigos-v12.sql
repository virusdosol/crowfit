-- =====================================================================
-- Crowfit — Migração v12: quem não tem ID não pode pedir amizade nem buscar jogadores.
-- Motivo: o ID é a identidade pública do jogador. Sem ID, o pedido chegaria a um
-- desconhecido sem como ser respondido com segurança. A checagem fica no banco
-- (não só na tela), então vale mesmo se alguém chamar a API diretamente.
-- STATUS: REVISÃO. NÃO APLICADA. Rodar depois de supabase-amigos-v11.sql.
-- Idempotente. Não apaga dados.
-- =====================================================================

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
  v_me   text;
  v_n    integer;
  v_rev  text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select handle into v_me from public.profiles where id = uid;
  if v_me is null then
    raise exception 'handle_required' using errcode = '22023';
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
  select f.status into v_rev from public.friendships as f
   where (f.requester_id = uid and f.addressee_id = v_to) or (f.requester_id = v_to and f.addressee_id = uid)
   limit 1;
  if v_rev = 'accepted' then
    raise exception 'already_friends' using errcode = '22023';
  end if;
  if v_rev = 'pending' and exists (select 1 from public.friendships where requester_id = uid and addressee_id = v_to) then
    raise exception 'already_sent' using errcode = '22023';
  end if;
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

create or replace function public.find_user(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  h     text;
  v     public.profiles;
  v_fr  public.friendships;
  v_pts integer;
  v_rel text;
  v_me  text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select handle into v_me from public.profiles where id = uid;
  if v_me is null then
    raise exception 'handle_required' using errcode = '22023';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'handle') is distinct from 'string' then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;
  h := lower(btrim(p ->> 'handle'));
  if h !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;

  select * into v from public.profiles where handle = h;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v.id = uid then
    v_rel := 'self';
  else
    select * into v_fr from public.friendships as f
     where (f.requester_id = uid and f.addressee_id = v.id)
        or (f.requester_id = v.id and f.addressee_id = uid)
     limit 1;
    if not found then
      v_rel := 'none';
    elsif v_fr.status = 'accepted' then
      v_rel := 'friends';
    elsif v_fr.requester_id = uid then
      v_rel := 'out';
    else
      v_rel := 'in';
    end if;
  end if;

  select up.points into v_pts from public.user_progress as up where up.user_id = v.id;
  v_pts := coalesce(v_pts, 0);

  return jsonb_build_object(
    'handle', v.handle,
    'name', v.display_name,
    'level', public.cf_level_for(v_pts),
    'relation', v_rel
  );
end;
$$;

revoke all on function public.send_friend_request(jsonb) from public, anon;
grant execute on function public.send_friend_request(jsonb) to authenticated;
revoke all on function public.find_user(jsonb) from public, anon;
grant execute on function public.find_user(jsonb) to authenticated;

-- Verificação (somente leitura): deve vir true
select 'pedido de amizade exige ID do próprio jogador' as check_name,
  coalesce((select prosrc like '%handle_required%' from pg_proc
             where proname = 'send_friend_request' and pronamespace = 'public'::regnamespace), false) as ok;
