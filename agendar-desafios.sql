-- =====================================================================
-- Crowfit — agendamento de resultados de desafios (cf_emit_challenge_results).
-- Rodar no SQL Editor do projeto PRODUCTION (crowfit). Idempotente.
-- A função gera o evento de cada desafio que terminou nas últimas 6 horas.
-- Rodando a cada 10 minutos, nenhum término fica sem evento.
-- Dupla geração é evitada pela chave 'cres:<id do desafio>' em notification_events.
-- =====================================================================

select cron.unschedule('cf-challenge-results')
 where exists (select 1 from cron.job where jobname = 'cf-challenge-results');

select cron.schedule(
  'cf-challenge-results',
  '*/10 * * * *',
  'select public.cf_emit_challenge_results();'
);

-- Verificação (somente leitura): deve mostrar uma linha com active = true
select jobname, schedule, active
  from cron.job
 where jobname in ('cf-challenge-results', 'push-dispatch-cada-5min');
