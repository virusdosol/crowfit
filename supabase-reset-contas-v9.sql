-- =====================================================================
-- Crowfit — RESET DE CONTAS (v9). DESTRUTIVO. IRREVERSÍVEL.
-- STATUS: NÃO EXECUTADO. Só rodar com autorização expressa do dono do projeto.
-- Ordem obrigatória: 1) supabase-id-v9.sql  2) este arquivo.
--
-- O que apaga: TODAS as contas em auth.users. Pelo ON DELETE CASCADE, somem junto
-- profiles, amizades e demais tabelas ligadas a auth.users.
-- O que NÃO apaga: tabelas de configuração (box_config etc.).
--
-- Passo 0 (OBRIGATÓRIO, antes do reset): exportar backup. Supabase > Table Editor > Export,
-- ou o SQL de contagem abaixo, guardando os números.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) Diagnóstico (somente leitura): quantas contas e o que depende delas.
-- ---------------------------------------------------------------------
select 'contas em auth.users' as item, count(*) as total from auth.users
union all
select 'perfis em profiles', count(*) from public.profiles
union all
select 'amizades', count(*) from public.friendships;

-- Tabelas com FK para auth.users SEM cascata (se aparecer alguma linha, NÃO rode o passo B;
-- me envie o resultado para eu ajustar):
select c.conrelid::regclass as tabela, c.confdeltype as regra
  from pg_constraint c
 where c.confrelid = 'auth.users'::regclass and c.contype = 'f' and c.confdeltype <> 'c';

-- ---------------------------------------------------------------------
-- B) Reset (DESTRUTIVO). Só rodar depois do backup e da autorização.
--    Se alguma tabela bloquear a exclusão, a instrução inteira falha e nada é apagado.
-- ---------------------------------------------------------------------
-- delete from auth.users;

-- ---------------------------------------------------------------------
-- C) Verificação pós-reset (todas devem ser 0)
-- ---------------------------------------------------------------------
-- select (select count(*) from auth.users) as contas,
--        (select count(*) from public.profiles) as perfis;
