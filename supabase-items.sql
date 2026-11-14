-- =====================================================================
-- Crowfit — Migração: inventário de aparências (sincronização)
-- Onde: Supabase > SQL Editor > colar tudo > Run.
-- Pré-requisito: supabase-boxes.sql já aplicado (usa cf_lock_user).
--
-- O que acrescenta (NADA é removido):
--   1) user_items       : um item por usuário (sem duplicata; chave usuário + item)
--   2) user_appearance  : aparência equipada (uma linha por usuário; vale o instante mais recente)
--   3) merge_my_items(p): une os itens (nunca remove) e aplica a aparência equipada se for mais recente
--
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

create table if not exists public.user_items (
  user_id    uuid not null references auth.users (id) on delete cascade,
  item_id    text not null check (item_id ~ '^[a-z0-9_]{1,40}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create table if not exists public.user_appearance (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  item_id  text check (item_id is null or item_id ~ '^[a-z0-9_]{1,40}$'),
  at       timestamptz not null
);
alter table public.user_items enable row level security;
alter table public.user_appearance enable row level security;
drop policy if exists "own items" on public.user_items;
create policy "own items" on public.user_items for select to authenticated using (user_id = auth.uid());
drop policy if exists "own appearance" on public.user_appearance;
create policy "own appearance" on public.user_appearance for select to authenticated using (user_id = auth.uid());
revoke all on table public.user_items, public.user_appearance from public, anon, authenticated;
grant select on table public.user_items, public.user_appearance to authenticated;

-- merge_my_items(p): p = { items: ["id", ...] (até 500), equipped: "id"|null, at: ISO }
create or replace function public.merge_my_items(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  el    jsonb;
  v_id  text;
  v_at  timestamptz;
  v_eq  text;
  cur   public.user_appearance;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p -> 'items', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) > 500 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  perform public.cf_lock_user(uid);

  for el in select value from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    if jsonb_typeof(el) <> 'string' or (el #>> '{}') !~ '^[a-z0-9_]{1,40}$' then
      raise exception 'invalid_item' using errcode = '22023';
    end if;
    insert into public.user_items (user_id, item_id) values (uid, el #>> '{}')
      on conflict (user_id, item_id) do nothing;
  end loop;

  if p ? 'equipped' and jsonb_typeof(p -> 'equipped') in ('string', 'null') and p ->> 'at' is not null then
    v_at := (p ->> 'at')::timestamptz;
    v_eq := case when jsonb_typeof(p -> 'equipped') = 'string' then p ->> 'equipped' else null end;
    if v_eq is not null and not exists (select 1 from public.user_items where user_id = uid and item_id = v_eq) then
      raise exception 'item_not_owned' using errcode = '22023';
    end if;
    insert into public.user_appearance (user_id, item_id, at) values (uid, v_eq, v_at)
      on conflict (user_id) do update set item_id = excluded.item_id, at = excluded.at
      where public.user_appearance.at < excluded.at;
  end if;

  select * into cur from public.user_appearance where user_id = uid;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(item_id order by item_id) from public.user_items where user_id = uid), '[]'::jsonb),
    'equipped', case when cur.user_id is null then null else jsonb_build_object('id', cur.item_id, 'at', cur.at) end
  );
end;
$$;
revoke all on function public.merge_my_items(jsonb) from public, anon;
grant execute on function public.merge_my_items(jsonb) to authenticated;
