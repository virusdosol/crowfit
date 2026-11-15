# Auditoria — correções (14/11/2026)

## Corrigido
1. profile.js — função esc() não existia. Abrir "Conta e perfil" lançava ReferenceError e a tela quebrava. Adicionada.
2. auth-ui.js — o campo de ID estava no cadastro. Pelo fluxo pedido, o ID é escolhido DEPOIS de criar a conta (página própria, id-gate.js). Campo removido; validações do cadastro preservadas.
3. supabase-id-v10.sql — NOVA. Remove a exigência de ID no cadastro por e-mail (sem ela o cadastro falharia após a remoção do campo). Rodar uma vez, depois da v9.
4. sw.js — versão 58.

## Verificado sem problema
- Sintaxe de todos os .js e do script inline do index.html.
- Todos os arquivos citados no service worker existem.
- Todas as RPCs chamadas pelo JS existem no SQL; parâmetros {p: {...}} batem.
- Colunas handle e handle_changed_at existem no SQL.
- Imagens referenciadas existem.
- 161 testes JS passando.

## Pendências conhecidas (não bloqueiam o lançamento)
- Funções de amizade (send_friend_request) não exigem que quem pede já tenha ID. Na prática o id-gate impede o uso antes do ID, mas o banco não garante.
- Quem entra com conta existente sem perfil ainda cai na onboarding antiga (tela "Vamos começar") dentro do app. Só acontece sem rascunho; o fluxo novo não passa por ela.
- introSeen() em auth-ui.js não é mais usada (código morto, sem efeito).
- Nada foi testado no navegador nem no Supabase real.

## Ordem para aplicar
1. Subir no GitHub: profile.js, auth-ui.js, sw.js.
2. Rodar supabase-id-v10.sql no SQL Editor (depois da v9). Conferir o check: deve dar true.
3. Testar pelo celular: cadastro por e-mail (sem campo de ID) → confirmar e-mail → entrar → página de ID → trilha. Google: perguntas → Google → página de ID → trilha. Conta → Configurações → Conta e perfil abre sem erro.
