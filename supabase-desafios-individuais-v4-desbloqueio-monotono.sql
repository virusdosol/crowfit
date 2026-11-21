-- =====================================================================
-- Crowfit — Desafios individuais v4 (etapa 1, desbloqueio monotônico)
-- STATUS: NÃO APLICADA. Aplicar só após revisão e autorização.
-- Depende de: v1, v2 (record_series), v3 (ancora em individual_challenges_list), v11 (cf_user_today).
--
-- PROBLEMA QUE RESOLVE: com o fuso do aparelho (v11 + set_my_time_zone), o "hoje" de uma
-- pessoa pode recuar (ex.: viagem para fuso anterior). Sem esta migração, um desafio já
-- desbloqueado voltaria a ficar bloqueado e a série seria recusada. Regra: uma vez desbloqueado,
-- permanece desbloqueado.
--
-- O QUE MUDA:
--   1) Tabela individual_challenge_unlocks: uma linha por (usuário, desafio) registrada na
--      primeira vez em que o desafio fica disponível. Nunca é apagada nem alterada.
--      Sem acesso direto pelo cliente (RLS ligado, nenhum grant).
--   2) ic_desbloqueado_id(uid, challenge): true se já existe registro de desbloqueio OU se a
--      data da âncora <= cf_user_today. Na primeira vez em que vale, registra o desbloqueio.
--   3) individual_challenges_list e individual_challenge_record_series passam a usar
--      ic_desbloqueado_id. O restante do corpo é idêntico ao da versão em produção.
--   4) Backfill: registra o desbloqueio de quem já está desbloqueado hoje. Não cria, apaga
--      nem altera séries, estrelas, XP ou progresso.
--
-- O QUE NÃO MUDA: ic_desbloqueado (v1) continua existindo, mas deixa de ser usado.
-- Não há mudança em XP, ledger, trail_grants, desafios entre amigos ou dados existentes.
-- Idempotente (create table if not exists, on conflict do nothing, create or replace).
-- =====================================================================

create table if not exists public.individual_challenge_unlocks (
  user_id         uuid not null references auth.users (id) on delete cascade,
  challenge_id    uuid not null references public.individual_challenges (id),
  desbloqueado_em timestamptz not null default now(),
  primary key (user_id, challenge_id)
);
alter table public.individual_challenge_unlocks enable row level security;
revoke all on public.individual_challenge_unlocks from public, anon, authenticated;

create or replace function public.ic_desbloqueado_id(p_uid uuid, p_challenge uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c    record;
  v_ok boolean;
begin
  select cc.ancora_secao, cc.ancora_unidade into c
    from public.individual_challenges as cc where cc.id = p_challenge;
  if not found then return false; end if;

  -- já desbloqueado antes: continua desbloqueado, mesmo que o "hoje" tenha recuado
  if exists (select 1 from public.individual_challenge_unlocks as u
              where u.user_id = p_uid and u.challenge_id = p_challenge) then
    return true;
  end if;

  v_ok := coalesce(public.ic_data_da_unidade(p_uid, c.ancora_secao, c.ancora_unidade)
                     <= public.cf_user_today(p_uid), false);
  if v_ok then
    insert into public.individual_challenge_unlocks (user_id, challenge_id)
    values (p_uid, p_challenge)
    on conflict (user_id, challenge_id) do nothing;
  end if;
  return v_ok;
end
$$;

revoke all on function public.ic_desbloqueado_id(uuid, uuid) from public, anon, authenticated;

-- Backfill: quem já está desbloqueado hoje fica registrado (idempotente).
insert into public.individual_challenge_unlocks (user_id, challenge_id)
select ts.user_id, cc.id
  from public.trail_state as ts
  cross join public.individual_challenges as cc
 where ts.start is not null
   and public.ic_data_da_unidade(ts.user_id, cc.ancora_secao, cc.ancora_unidade)
       <= public.cf_user_today(ts.user_id)
on conflict (user_id, challenge_id) do nothing;

-- Listagem (corpo da v3; única mudança: ic_desbloqueado_id)
create or replace function public.individual_challenges_list()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  out_json jsonb;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select coalesce(jsonb_agg(item order by item->>'slug'), '[]'::jsonb) into out_json
  from (
    select jsonb_build_object(
      'id', c.id,
      'ancora', 's' || c.ancora_secao::text || 'u' || c.ancora_unidade::text,
      'slug', c.slug,
      'nome', c.nome,
      'atividade', c.atividade,
      'estado', case
                  when p.estrelas = 3 then 'concluido'
                  when not c.ativo then 'inativo'
                  when not public.ic_desbloqueado_id(uid, c.id) then 'bloqueado'
                  when coalesce(p.estrelas, 0) > 0 then 'em_progresso'
                  else 'disponivel' end,
      'total_reps', coalesce(p.total_reps, 0),
      'estrelas', coalesce(p.estrelas, 0),
      'metas', case when coalesce(p.meta_1, c.meta_1) is null then null
                    else jsonb_build_array(coalesce(p.meta_1, c.meta_1), coalesce(p.meta_2, c.meta_2), coalesce(p.meta_3, c.meta_3)) end
    ) as item
    from public.individual_challenges as c
    left join public.individual_challenge_progress as p
      on p.challenge_id = c.id and p.user_id = uid
    where c.ativo or p.user_id is not null
  ) as x;

  return out_json;
end $$;

revoke all on function public.individual_challenges_list() from public, anon;
grant execute on function public.individual_challenges_list() to authenticated;

-- Registro de série (corpo da v2; única mudança: ic_desbloqueado_id)
create or replace function public.individual_challenge_record_series(
  p_challenge_id uuid,
  p_repeticoes   integer,
  p_chave        uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid        uuid := auth.uid();
  c          public.individual_challenges%rowtype;
  pr         public.individual_challenge_progress%rowtype;
  ser        public.individual_challenge_series%rowtype;
  novo_total integer;
  novas_est  smallint;
  conquistas jsonb := '[]'::jsonb;
  s          smallint;
  meta_s     integer;
  xp_s       integer;
  k          text;
  v_ok       boolean;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_repeticoes is null or p_repeticoes < 1 or p_repeticoes > 1000 then
    raise exception 'invalid_reps' using errcode = '22023';
  end if;
  if p_chave is null then raise exception 'invalid_key' using errcode = '22023'; end if;

  select * into c from public.individual_challenges where id = p_challenge_id;
  if not found then raise exception 'challenge_not_found' using errcode = 'P0001'; end if;
  if not c.ativo then raise exception 'challenge_inactive' using errcode = 'P0001'; end if;
  if not public.ic_desbloqueado_id(uid, c.id) then
    raise exception 'locked' using errcode = 'P0001';
  end if;

  perform public.cf_lock_user(uid);

  insert into public.individual_challenge_progress as p
    (user_id, challenge_id, versao_config, meta_1, meta_2, meta_3, xp_1, xp_2, xp_3)
  values (uid, c.id, c.versao_config, c.meta_1, c.meta_2, c.meta_3, c.xp_1, c.xp_2, c.xp_3)
  on conflict (user_id, challenge_id) do nothing;

  select * into pr from public.individual_challenge_progress
   where user_id = uid and challenge_id = c.id for update;

  -- retry com a mesma chave: devolve o resultado gravado, sem duplicar nada
  select * into ser from public.individual_challenge_series
   where user_id = uid and chave_idempotente = p_chave;
  if found then
    if ser.challenge_id <> c.id or ser.repeticoes <> p_repeticoes then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return jsonb_build_object('replay', true, 'total', ser.total_apos,
                              'estrelas', ser.estrelas_apos, 'conquistas', ser.conquistas);
  end if;

  if pr.estrelas = 3 then raise exception 'completed' using errcode = 'P0001'; end if;

  novo_total := pr.total_reps + p_repeticoes;
  if novo_total > 10000000 then raise exception 'overflow' using errcode = '22003'; end if;

  novas_est := ((novo_total >= pr.meta_1)::int + (novo_total >= pr.meta_2)::int
              + (novo_total >= pr.meta_3)::int)::smallint;

  for s in select g from generate_series(pr.estrelas + 1, novas_est) as g loop
    meta_s := case s when 1 then pr.meta_1 when 2 then pr.meta_2 else pr.meta_3 end;
    xp_s   := case s when 1 then pr.xp_1   when 2 then pr.xp_2   else pr.xp_3   end;
    conquistas := conquistas || jsonb_build_array(jsonb_build_object(
      'estrela', s, 'meta', meta_s, 'xp', xp_s, 'total', novo_total));
  end loop;

  insert into public.individual_challenge_series
    (user_id, challenge_id, repeticoes, chave_idempotente, total_apos, estrelas_apos, conquistas)
  values (uid, c.id, p_repeticoes, p_chave, novo_total, novas_est, conquistas);

  for s in select g from generate_series(pr.estrelas + 1, novas_est) as g loop
    insert into public.individual_challenge_stars
      (user_id, challenge_id, estrela, meta, total_na_conquista, versao_config, xp_recompensa)
    values (uid, c.id, s,
            case s when 1 then pr.meta_1 when 2 then pr.meta_2 else pr.meta_3 end,
            novo_total, pr.versao_config,
            case s when 1 then pr.xp_1 when 2 then pr.xp_2 else pr.xp_3 end);
  end loop;

  -- concessão de XP: mesma transação. Se qualquer passo falhar, nada é gravado.
  for s in select g from generate_series(pr.estrelas + 1, novas_est) as g loop
    xp_s := case s when 1 then pr.xp_1 when 2 then pr.xp_2 else pr.xp_3 end;
    k    := 'idv:' || c.id::text || ':' || s::text;

    v_ok := public.cf_grant_xp(uid, k, xp_s, 'app');
    if not v_ok and not exists (
      select 1 from public.xp_ledger x
       where x.user_id = uid and x.key = k and x.amount = xp_s
    ) then
      raise exception 'xp_divergente' using errcode = 'P0001';
    end if;

    update public.individual_challenge_stars
       set xp_status = 'concedido', concedido_em = now()
     where user_id = uid and challenge_id = c.id and estrela = s;
  end loop;

  update public.individual_challenge_progress
     set total_reps   = novo_total,
         estrelas     = novas_est,
         concluido_em = case when novas_est = 3 then now() else null end
   where user_id = uid and challenge_id = c.id;

  return jsonb_build_object('replay', false, 'total', novo_total,
                            'estrelas', novas_est, 'conquistas', conquistas);
end $$;

revoke all on function public.individual_challenge_record_series(uuid, integer, uuid) from public, anon;
grant execute on function public.individual_challenge_record_series(uuid, integer, uuid) to authenticated;
