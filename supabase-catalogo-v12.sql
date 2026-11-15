-- =====================================================================
-- Crowfit — Catálogo v12: remove 6 exercícios com equipamento e inclui 3 novos.
-- Rodar no SQL Editor do projeto PRODUCTION (crowfit). Idempotente.
-- Os 6 removidos continuam nas sessões antigas (histórico não é apagado).
-- =====================================================================

delete from public.exercise_catalog
 where id in ('bi_toalha', 'bi_mochila', 'bi_mochila_l', 'bi_mochila_u', 'stiff_mo', 'rem_toalha');

insert into public.exercise_catalog (id) values
  ('parede_bi'),
  ('chao_bi'),
  ('stiff_par')
on conflict (id) do nothing;

-- Verificação (somente leitura): deve ser true
select 'catálogo com 95 exercícios' as check_name,
  (select count(*) from public.exercise_catalog) = 95 as ok;
