-- =====================================================================
-- Crowfit — Migração v13: evolução social dos jogadores (amigos e classificação).
-- Reutiliza user_progress (points = XP, best_streak, last_workout_date) e cf_level_for.
-- Não cria lógica nova de progressão. Não expõe e-mail, nozes, caixas nem configurações.
-- Ofensiva ATUAL não é guardada no servidor: mostramos a melhor ofensiva e o último treino.
-- STATUS: REVISÃO. NÃO APLICADA. Rodar depois de supabase-amigos-v12.sql.
-- Idempotente. Não apaga dados.
-- =====================================================================

-- Classificação: eu + amigos aceitos. Ordena por XP total (empate: handle).
create or replace function public.get_leaderboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  v_out jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select coalesce(jsonb_agg(r.j order by (r.j ->> 'pos')::int), '[]'::jsonb) into v_out
    from (
      select jsonb_build_object(
               'pos', row_number() over (order by coalesce(up.points, 0) desc, pr.handle),
               'handle', pr.handle,
               'name', pr.display_name,
               'level', public.cf_level_for(coalesce(up.points, 0)),
               'xp', coalesce(up.points, 0),
               'best_streak', coalesce(up.best_streak, 0),
               'me', pr.id = uid) as j
        from public.profiles as pr
        left join public.user_progress as up on up.user_id = pr.id
       where pr.handle is not null
         and (pr.id = uid
              or pr.id in (select case when f.requester_id = uid then f.addressee_id else f.requester_id end
                             from public.friendships as f
                            where f.status = 'accepted' and uid in (f.requester_id, f.addressee_id)))
    ) as r;
  return jsonb_build_object('rows', v_out);
end;
$$;

-- Perfil de um amigo. Só para amigos aceitos (ou para o próprio usuário).
create or replace function public.get_friend_profile(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  h   text;
  v   public.profiles;
  up  public.user_progress;
  v_pts integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'handle') is distinct from 'string' then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;
  h := lower(btrim(p ->> 'handle'));
  select * into v from public.profiles where handle = h;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if v.id <> uid and not exists (
       select 1 from public.friendships as f
        where f.status = 'accepted'
          and ((f.requester_id = uid and f.addressee_id = v.id) or (f.requester_id = v.id and f.addressee_id = uid))) then
    raise exception 'not_friends' using errcode = '42501';
  end if;
  select * into up from public.user_progress where user_id = v.id;
  v_pts := coalesce(up.points, 0);
  return jsonb_build_object(
    'handle', v.handle,
    'name', v.display_name,
    'level', public.cf_level_for(v_pts),
    'xp', v_pts,
    'best_streak', coalesce(up.best_streak, 0),
    'last_workout', up.last_workout_date,
    'since', v.created_at::date
  );
end;
$$;

revoke all on function public.get_leaderboard() from public, anon;
grant execute on function public.get_leaderboard() to authenticated;
revoke all on function public.get_friend_profile(jsonb) from public, anon;
grant execute on function public.get_friend_profile(jsonb) to authenticated;

-- Verificação (somente leitura): deve vir true
select 'funções sociais existem e são executáveis por usuário logado' as check_name,
  (select count(*) from information_schema.routine_privileges
    where routine_schema = 'public' and grantee = 'authenticated'
      and routine_name in ('get_leaderboard', 'get_friend_profile')) = 2 as ok;
