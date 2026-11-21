-- =====================================================================
-- Crowfit — Desafios individuais v3 (etapa 1, integração da trilha)
-- Migração corretiva sobre supabase-desafios-individuais-v1.sql (já aplicada).
-- Única mudança: a listagem passa a devolver 'ancora' no formato sNuM, a mesma chave
-- de unidade usada pela trilha (s<secao>u<unidade>). Corpo idêntico ao da v1 no resto.
-- create or replace preserva o grant existente para authenticated.
-- =====================================================================

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
                  when not public.ic_desbloqueado(uid, c.ancora_secao, c.ancora_unidade) then 'bloqueado'
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
