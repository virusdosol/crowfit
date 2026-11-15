-- =====================================================================
-- Crowfit — Migração v10: XP da trilha só para unidades do dia atual.
-- STATUS: RASCUNHO. NÃO APLICADA. Testar primeiro em projeto de TESTE.
--         Não executar na produção sem autorização expressa.
--
-- O QUE MUDA:
--   cf_trail_amount passa a pagar XP somente se a data da unidade for
--   IGUAL ao dia atual (America/Sao_Paulo). Unidades de dias anteriores
--   continuam marcadas como concluídas, mas não geram XP novo.
--   Regra de negócio: "o dia acabou". Não há janela de retroatividade.
--
-- O QUE NÃO MUDA:
--   - fórmula do XP (10 × exercícios + 20);
--   - regras de seção, nível congelado e conclusão (todos os exercícios);
--   - idempotência (chave tr:sKuN no xp_ledger, via cf_grant_xp);
--   - merge_my_progress, cf_grant_xp, sessões e dados existentes.
--
-- EFEITO CONHECIDO: uma unidade concluída à noite e sincronizada depois da
--   meia-noite (horário de São Paulo) não gera XP. O histórico é preservado.
--
-- DEPENDÊNCIAS: plan_unit, cf_sp_today, trail_state, training_settings,
--   trail_exercise_states (já existentes em produção).
-- Idempotente. Não apaga nem altera dados.
-- =====================================================================

create or replace function public.cf_trail_amount(p_uid uuid, p_key text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  m        text[];
  k        integer;
  n        integer;
  v_start  date;
  v_levels jsonb;
  v_exp    text;
  v_adj    smallint;
  v_first  date;
  v_dim    integer;
  v_sec    date;
  v_next   date;
  v_date   date;
  v_lv     integer;
  v_b      jsonb;
  v_total  integer;
  v_done   integer;
  v_unit   text;
  v_amt    integer;
  v_today  date := public.cf_sp_today();
begin
  if p_uid is null or p_key is null then return null; end if;
  m := regexp_match(p_key, '^tr:s([0-9]{1,3})u([0-9]{1,3})$');
  if m is null then return null; end if;
  k := m[1]::integer; n := m[2]::integer;
  if k < 1 or n < 1 then return null; end if;

  select ts.start, ts.levels into v_start, v_levels from public.trail_state as ts where ts.user_id = p_uid;
  if v_start is null then return null; end if;

  -- início da seção k: +3 meses por seção, dia limitado ao fim do mês (igual a addM em trail.js)
  v_first := (date_trunc('month', v_start::timestamp) + make_interval(months => 3 * (k - 1)))::date;
  v_dim   := extract(day from (v_first + interval '1 month' - interval '1 day'))::integer;
  v_sec   := v_first + (least(extract(day from v_start)::integer, v_dim) - 1);
  v_first := (date_trunc('month', v_start::timestamp) + make_interval(months => 3 * k))::date;
  v_dim   := extract(day from (v_first + interval '1 month' - interval '1 day'))::integer;
  v_next  := v_first + (least(extract(day from v_start)::integer, v_dim) - 1);

  v_date := v_sec + (n - 1);
  if v_date >= v_next then return null; end if;          -- unidade fora da seção

  -- REGRA v10: só unidades do dia atual geram XP (o dia acabou, não há retroatividade)
  if v_date <> v_today then return null; end if;

  -- nível congelado da seção; se não houver, usa a configuração atual (mesma regra de level() em trail.js)
  if v_levels ? k::text and jsonb_typeof(v_levels -> k::text) = 'number' then
    v_lv := (v_levels ->> k::text)::integer;
  else
    select ts.exp, ts.adjust into v_exp, v_adj from public.training_settings as ts where ts.user_id = p_uid;
    if v_exp is null then return null; end if;
    v_lv := greatest(0, least(2,
      (case v_exp when 'Nunca treinei' then 0 when 'Treino às vezes' then 1 when 'Treino sempre' then 2 else 0 end)
      + coalesce(v_adj, 0)));
  end if;

  v_b := public.plan_unit(k, n, extract(dow from v_date)::integer, v_lv);
  v_total := jsonb_array_length(v_b -> 'exercises');
  if v_total = 0 then return null; end if;

  -- conclusão: todos os exercícios da unidade marcados como feitos
  v_unit := 's' || k || 'u' || n;
  select count(*) into v_done
    from jsonb_array_elements(v_b -> 'exercises') as e
   where exists (select 1 from public.trail_exercise_states as tes
                  where tes.user_id = p_uid and tes.unit_key = v_unit
                    and tes.exercise_id = e ->> 'id' and tes.done = true);
  if v_done < v_total then return null; end if;

  v_amt := 10 * v_total + 20;
  return case when v_amt between 1 and 1000 then v_amt else null end;
end;
$function$;

-- ---------------------------------------------------------------------
-- Verificação (somente leitura): deve retornar true
-- ---------------------------------------------------------------------
select 'v10 aplicada: trilha só do dia atual' as check_name,
  position('v_date <> v_today' in pg_get_functiondef('public.cf_trail_amount(uuid,text)'::regprocedure)) > 0
  and position('48' in pg_get_functiondef('public.cf_trail_amount(uuid,text)'::regprocedure)) = 0 as ok;
