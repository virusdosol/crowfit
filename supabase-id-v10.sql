-- =====================================================================
-- Crowfit — Migração v10: cadastro por e-mail SEM ID inicial
-- STATUS: REVISÃO. NÃO APLICADA. Produção = projeto gqhcknwuqwudctanigyf.
--         NÃO executar sem autorização expressa. Sintaxe NÃO executada em PostgreSQL aqui.
--
-- Pré-requisitos (nesta ordem): supabase-amigos-v8.sql, supabase-id-v9.sql.
-- Esta migração só redefine public.handle_new_user(). Não altera tabelas, dados nem contas.
--
-- O que muda:
--   * A v9 recusava conta por e-mail sem ID (handle_required). O app já cria a conta
--     sem ID e pede a escolha depois (id-gate.js). Esta versão remove essa recusa.
--   * Continua valendo: ID informado precisa ser válido (invalid_handle) e único
--     (unique_violation, pelo índice profiles_handle_key). Quem não tem ID fica com handle nulo.
--   * Google continua entrando sem ID, como antes.
--   * Não sobrescreve perfil existente (on conflict do nothing).
--   * Qualquer erro desfaz o cadastro inteiro, como nas versões anteriores.
--
-- Contas antigas: não são tocadas. Quem já tem perfil sem ID continua sem ID
-- e o app pede a escolha ao entrar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) handle_new_user(): ID opcional na criação; validado quando informado.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  h text;
begin
  h := nullif(lower(btrim(coalesce(new.raw_user_meta_data ->> 'handle', ''))), '');

  if h is not null and not public.profile_valid_handle(h) then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;

  insert into public.profiles (id, display_name, handle)
  values (new.id, public.profile_name_from_user(new.raw_user_meta_data, new.email), h)
  on conflict (id) do nothing;
  return new;
exception when others then
  raise exception 'handle_new_user: falha ao criar o perfil de % (SQLSTATE %): %', new.id, sqlstate, sqlerrm
    using errcode = sqlstate;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Verificação (deve retornar true)
-- ---------------------------------------------------------------------
select position('handle_required' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) = 0
   and position('handle_new_user' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) > 0
   as v10_aplicada;
