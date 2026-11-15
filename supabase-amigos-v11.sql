-- =====================================================================
-- Crowfit — Migração v11: localizar jogador pelo ID antes de pedir amizade.
-- STATUS: REVISÃO. NÃO APLICADA. Produção = projeto gqhcknwuqwudctanigyf.
--         Não executar sem autorização expressa. Sintaxe não executada em PostgreSQL aqui.
-- Pré-requisito: supabase-amigos-v8.sql (friendships, get_my_social, send/respond/remove_friend)
--                e supabase-sync.sql (user_progress, cf_level_for).
-- Idempotente. Não apaga dados. Não altera as funções já existentes.
-- Privacidade: a busca mostra só ID, nome e nível (não mostra XP de quem não é amigo).
-- =====================================================================

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

revoke all on function public.find_user(jsonb) from public, anon;
grant execute on function public.find_user(jsonb) to authenticated;

-- Verificação (somente leitura): deve vir true
select 'find_user existe e é executável por usuário logado' as check_name,
  exists (select 1 from information_schema.routine_privileges
           where routine_schema = 'public' and routine_name = 'find_user' and grantee = 'authenticated') as ok;
