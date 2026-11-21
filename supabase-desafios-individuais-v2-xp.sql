-- =====================================================================
-- Crowfit — Desafios individuais v2 (etapa 3: XP das estrelas)
-- Migração corretiva sobre supabase-desafios-individuais-v1.sql (já aplicada).
-- Pré-requisitos (já aplicados): v1, supabase-xp-v7-fase2c.sql (cf_grant_xp, xp_ledger).
-- NÃO altera cf_grant_xp, xp_ledger, trail_grants, challenges nem o sistema entre amigos.
--
-- O que muda:
--   1) chave de origem da estrela passa a ser idv:<uuid do desafio>:<estrela>
--      (única por usuário; xp_ledger já é único por (user_id, key));
--   2) xp_status aceita 'concedido' com concedido_em (coerentes entre si);
--   3) histórico de estrelas: só é permitida a transição pendente -> concedido;
--   4) concessão de XP dentro da mesma transação de record_series;
--   5) backfill idempotente das estrelas já gravadas sem XP.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Chave de origem idv:<uuid>:<estrela>, única por usuário
-- ---------------------------------------------------------------------
alter table public.individual_challenge_stars drop constraint if exists ist_chave_origem_unica;
alter table public.individual_challenge_stars drop column if exists chave_origem_xp;
alter table public.individual_challenge_stars add column chave_origem_xp text
  generated always as ('idv:' || challenge_id::text || ':' || estrela::text) stored;
alter table public.individual_challenge_stars add constraint ist_chave_origem_unica
  unique (user_id, chave_origem_xp);

-- ---------------------------------------------------------------------
-- 2) Estados de concessão, coerentes entre si
-- ---------------------------------------------------------------------
alter table public.individual_challenge_stars
  drop constraint if exists individual_challenge_stars_xp_status_check;
alter table public.individual_challenge_stars add column if not exists concedido_em timestamptz;
alter table public.individual_challenge_stars add constraint ist_xp_status_check
  check (xp_status in ('pendente', 'concedido'));
alter table public.individual_challenge_stars add constraint ist_concedido_coerente
  check ((xp_status = 'concedido') = (concedido_em is not null));

-- ---------------------------------------------------------------------
-- 3) Histórico de estrelas imutável, exceto a transição pendente -> concedido
--    (substitui ist_imutavel, criado na v1)
-- ---------------------------------------------------------------------
drop trigger if exists ist_imutavel on public.individual_challenge_stars;

create or replace function public.ist_protege_conquista()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.xp_status <> 'pendente'
     or new.xp_status <> 'concedido'
     or new.concedido_em is null
     or (new.user_id, new.challenge_id, new.estrela, new.meta, new.total_na_conquista,
         new.versao_config, new.xp_recompensa, new.chave_origem_xp, new.conquistado_em)
        is distinct from
        (old.user_id, old.challenge_id, old.estrela, old.meta, old.total_na_conquista,
         old.versao_config, old.xp_recompensa, old.chave_origem_xp, old.conquistado_em)
  then
    raise exception 'historico_imutavel' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function public.ist_protege_conquista() from public, anon, authenticated;

drop trigger if exists ist_protege on public.individual_challenge_stars;
create trigger ist_protege before update on public.individual_challenge_stars
  for each row execute function public.ist_protege_conquista();

-- ---------------------------------------------------------------------
-- 4) Backfill idempotente: estrelas já gravadas sem XP recebem a recompensa.
--    Usa cf_grant_xp; só marca como concedido com confirmação no ledger.
-- ---------------------------------------------------------------------
do $$
declare
  r    record;
  v_ok boolean;
begin
  for r in
    select user_id, challenge_id, estrela, xp_recompensa, chave_origem_xp
      from public.individual_challenge_stars
     where xp_status = 'pendente'
     order by user_id, challenge_id, estrela
  loop
    v_ok := public.cf_grant_xp(r.user_id, r.chave_origem_xp, r.xp_recompensa, 'app');
    if not v_ok and not exists (
      select 1 from public.xp_ledger x
       where x.user_id = r.user_id and x.key = r.chave_origem_xp and x.amount = r.xp_recompensa
    ) then
      raise exception 'backfill_xp_divergente' using errcode = 'P0001';
    end if;
    update public.individual_challenge_stars
       set xp_status = 'concedido', concedido_em = now()
     where user_id = r.user_id and challenge_id = r.challenge_id and estrela = r.estrela;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5) record_series: série + conquistas + XP numa única transação
--    Ordem de bloqueio: cf_lock_user(uid) antes do progresso (igual a open_my_noz/open_my_box).
--    Erros: challenge_not_found, challenge_inactive, locked, completed, idempotency_conflict,
--           xp_divergente; invalid_reps / invalid_key (22023); overflow (22003).
-- ---------------------------------------------------------------------
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
  if not public.ic_desbloqueado(uid, c.ancora_secao, c.ancora_unidade) then
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
