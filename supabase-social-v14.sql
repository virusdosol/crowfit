-- =====================================================================
-- Crowfit — Migração v14: ofensiva atual, troféus e conquistas visíveis entre amigos.
-- Ofensiva atual: coluna nova em user_progress, enviada pelo app (como best_streak).
-- Troféus: snapshot por exercício enviado pelo app (nível 0-4 e valor).
-- Conquistas: já estão em achievements_unlocked; passam a aparecer no perfil do amigo.
-- STATUS: REVISÃO. NÃO APLICADA. Rodar depois de supabase-social-v13.sql.
-- Não apaga dados. Idempotente.
-- =====================================================================

alter table public.user_progress add column if not exists current_streak integer not null default 0
  check (current_streak between 0 and 100000);

create table if not exists public.user_trophies (
  user_id     uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null check (exercise_id ~ '^[a-z0-9_]{1,24}$'),
  level       smallint not null check (level between 0 and 4),
  value       integer not null default 0 check (value between 0 and 100000000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
alter table public.user_trophies enable row level security;
revoke all on public.user_trophies from anon, authenticated;

-- Ofensiva atual (o app envia o valor calculado no aparelho).
create or replace function public.set_my_current_streak(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v   integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'current_streak') is distinct from 'number' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  v := least(100000, greatest(0, (p ->> 'current_streak')::integer));
  update public.user_progress set current_streak = v where user_id = uid;
  return jsonb_build_object('current_streak', v);
end;
$$;

-- Troféus: snapshot dos níveis por exercício (até 200 itens).
create or replace function public.set_my_trophies(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  it  jsonb;
  n   integer := 0;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'items') is distinct from 'array'
     or jsonb_array_length(p -> 'items') > 200 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  delete from public.user_trophies where user_id = uid;
  for it in select * from jsonb_array_elements(p -> 'items') loop
    if jsonb_typeof(it -> 'ex') is distinct from 'string' or jsonb_typeof(it -> 'lv') is distinct from 'number'
       or jsonb_typeof(it -> 'value') is distinct from 'number' then
      raise exception 'invalid_payload' using errcode = '22023';
    end if;
    if (it ->> 'lv')::integer between 1 and 4 then
      insert into public.user_trophies (user_id, exercise_id, level, value)
      values (uid, it ->> 'ex', (it ->> 'lv')::smallint, least(100000000, greatest(0, (it ->> 'value')::integer)))
      on conflict (user_id, exercise_id) do update set level = excluded.level, value = excluded.value, updated_at = now();
      n := n + 1;
    end if;
  end loop;
  return jsonb_build_object('saved', n);
end;
$$;

-- Perfil do amigo: agora inclui ofensiva atual, conquistas e troféus (só para amigos aceitos).
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
    'current_streak', coalesce(up.current_streak, 0),
    'best_streak', coalesce(up.best_streak, 0),
    'last_workout', up.last_workout_date,
    'since', v.created_at::date,
    'achievements', coalesce((select jsonb_agg(a.achievement_id order by a.unlocked_at desc)
                                from (select achievement_id, unlocked_at from public.achievements_unlocked
                                       where user_id = v.id order by unlocked_at desc limit 50) as a), '[]'::jsonb),
    'trophies', coalesce((select jsonb_agg(jsonb_build_object('ex', t.exercise_id, 'lv', t.level, 'value', t.value)
                                             order by t.level desc, t.exercise_id)
                            from public.user_trophies as t where t.user_id = v.id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.set_my_current_streak(jsonb) from public, anon;
grant execute on function public.set_my_current_streak(jsonb) to authenticated;
revoke all on function public.set_my_trophies(jsonb) from public, anon;
grant execute on function public.set_my_trophies(jsonb) to authenticated;
revoke all on function public.get_friend_profile(jsonb) from public, anon;
grant execute on function public.get_friend_profile(jsonb) to authenticated;

-- Verificação (somente leitura): deve vir true
select 'colunas e funções da v14 existem' as check_name,
  exists (select 1 from information_schema.columns where table_schema = 'public'
           and table_name = 'user_progress' and column_name = 'current_streak')
  and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_trophies')
  and (select count(*) from information_schema.routine_privileges where routine_schema = 'public'
        and grantee = 'authenticated' and routine_name in ('set_my_current_streak', 'set_my_trophies')) = 2 as ok;
