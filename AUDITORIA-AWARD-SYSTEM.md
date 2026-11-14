# Auditoria do Award System (Etapas 1 a 7)

Data: 14 nov 2026. Escopo: integração visual, persistência, sincronização e responsividade.
Testes automatizados: 144 de 144 passando (`node --test *.test.js`).

## Problemas encontrados e corrigidos

| # | Problema | Efeito | Correção |
|---|----------|--------|----------|
| 1 | `index.html` chamava `window.onAchievement`, mas nada definia esse hook | Conquistas eram gravadas sem nenhum aviso ao usuário | `wall.js` define o hook e exibe o feedback |
| 2 | Não havia feedback de subida de nível | Subir de nível passava despercebido | `afterSave()` compara o nível com o anterior e exibe o aviso com fala do Crow |
| 3 | Conquistas pendentes (`achPending`) nunca eram reconhecidas | Avisos poderiam repetir a cada carregamento | Após "Continuar", `CF.achAck` remove os ids mostrados e salva |
| 4 | Caixas mensais não tinham tela | Caixa recebida não podia ser aberta pela interface | Aba "Caixas" lista semanais e mensais e abre a mensal com `CF.openBox` |
| 5 | Troféus só apareciam como os três de maior marco, no menu do Crow | Quantidade por exercício não era visível | Aba "Troféus" lista todos os exercícios com contagem, nível e próximo marco |
| 6 | Nomes provisórios de itens saíam com raridade crua ("epica") | Texto pouco claro | Rótulos corrigidos ("épica", "lendária") |
| 7 | Ids de itens com hífen eram descartados pelo `ACH_ID` | Itens sumiriam ao carregar | Ids em formato `ap_com_01` (corrigido na Etapa 6) |
| 8 | Equipar sem escolha local podia apagar a escolha de outro aparelho | Perda de dado entre aparelhos | Sync só envia a aparência quando ela foi definida localmente (Etapa 6) |

## Verificado no navegador (Chromium, viewport móvel)

- Barra inferior fixa, dentro da área visível, com quatro atalhos.
- Conquista desbloqueada com opacidade normal; bloqueada com opacidade 0,35.
- Toque em conquista mostra nome, ilustração provisória, requisito, fala do Crow e data.
- Equipar troca a aparência e dispara salvamento.
- Abrir caixa mensal soma o XP e adiciona o item à coleção, sem duplicar.
- Subida de nível pelo `save()` real mostra o aviso.
- Conquista pendente é exibida e reconhecida.
- Sem rolagem horizontal em 320, 375, 430 e 1280 px.
- Nenhum erro de console.

## Limitações conhecidas (não corrigidas)

1. **Caixa mensal não é criada no app.** `BOX.criterio` continua `null` (decisão pendente). Sem critério, nenhuma caixa é concedida e a aba "Caixas" só mostra as semanais.
2. **Aparência ainda não aparece no mascote da tela principal.** A seleção funciona e fica visível na aba "Aparências", mas a renderização do Crow no menu e na home ainda não usa a aparência equipada.
3. **Arte provisória.** Conquistas, itens e troféus usam símbolos e rótulos "TEMP" até a arte definitiva.
4. **Não testado com o app completo.** O harness carrega `core.js` e `wall.js` reais com estado de exemplo. Login, boot, sincronização e a trilha reais não rodaram no sandbox.
5. **Migração Supabase não executada.** `supabase-items.sql` e as RPCs de caixa precisam ser aplicados e validados no banco real.
6. **Troféus no harness.** O stub de registros não corresponde ao formato real, então os números do harness não servem como validação. A aba usa as mesmas funções de `renderHome`, mas precisa ser conferida com dados reais.
7. **Modo escuro.** As variáveis estão definidas, mas não houve captura visual desse modo.
8. **Sincronização de conquistas.** O envio das conquistas já existia e não foi alterado nesta etapa.

## Arquivos desta etapa

- `wall.js` (reescrito): barra inferior, folha com abas, feedback de conquista e de nível.
- `wall.css` (reescrito): layout móvel, abas, listas, feedback.
- `core.js`: apenas rótulos dos nomes provisórios. Nenhuma lógica alterada.
