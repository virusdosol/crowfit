<div align="center">

<img src="icon-512.png" alt="Crowfit" width="140">

# CROWFIT

**Treino sem equipamento, um dia de cada vez.**
Receba um plano semanal sob medida, siga a trilha, mantenha sua ofensiva e acumule pontos, como nos apps de idiomas, mas para flexões, agachamentos e abdominais.

[**Abrir o app**](https://virusdosol.github.io/crowfit/) · [Instalar no celular](#-instalar-no-celular) · [Seus dados](#-seus-dados) · [Sincronização](#-sincronização)

![PWA](https://img.shields.io/badge/PWA-instalável-1a1a1a?style=flat-square)
![Offline](https://img.shields.io/badge/funciona-offline-444444?style=flat-square)
![Login](https://img.shields.io/badge/login-Supabase-E5322D?style=flat-square)
![Mobile first](https://img.shields.io/badge/mobile-first-1a1a1a?style=flat-square)

<img src="logo.png" alt="Crowfit" width="320">

</div>

---

## O que é

Um app de exercícios **sem nenhum equipamento**. Você responde algumas perguntas, o Crowfit monta a sua semana de treinos com dias de descanso, e o corvo mascote te acompanha. Treinar todo dia (ou quase) é o objetivo: a ofensiva e os pontos existem para isso.

Foi pensado para o celular, para treinar em casa, no quarto ou no parque.

## Aparência

Identidade **clara, clean e minimalista**: fundo branco ou muito claro, cartões em tons claros, texto escuro, **vermelho** como cor de destaque e o **corvo preto** como mascote. Não há tema escuro. As telas de introdução e de boas-vindas da autenticação mantêm o logotipo e o mascote originais.

## Como o plano é montado

No primeiro acesso, o app pergunta nome, idade, peso, altura, experiência com exercícios e quantos dias por semana você quer treinar (de 3 a 6).

O **nível** (iniciante, intermediário ou avançado) parte da experiência declarada e define repetições, segundos e séries. Depois ele se ajusta pelo seu retorno ao fim de cada treino ("Foi difícil", "No ponto", "Foi fácil").

| Dias por semana | Seg | Ter | Qua | Qui | Sex | Sáb | Dom |
|---|---|---|---|---|---|---|---|
| 3 | Corpo todo | Descanso | Pernas | Descanso | Peito e braços | Descanso | Descanso |
| 4 | Peito e braços | Pernas | Descanso | Abdômen | Corpo todo | Descanso | Descanso |
| 5 | Peito e braços | Pernas | Abdômen | Descanso | Corpo todo | Peito e braços | Descanso |
| 6 | Peito e braços | Pernas | Abdômen | Corpo todo | Peito e braços | Pernas | Descanso |

## Funcionalidades

**Trilha de progressão**
- A tela inicial é uma trilha de unidades, uma por dia, organizadas em **semanas** de 7 dias. A cada semana muda a cor dos círculos.
- Só o mês atual (4 semanas) fica liberado; os meses seguintes aparecem bloqueados, com cadeado.
- Cada unidade abre **no dia dela** (a partir da meia-noite). Não dá para adiantar treinos; unidades de dias anteriores continuam disponíveis para concluir.
- Cada unidade tem seus exercícios, com o progresso em anel. O treino guiado mostra um exercício por vez, série a série, com cronômetro para exercícios por tempo e descanso entre séries. Também é possível marcar exercícios como concluídos na lista da unidade.

**Ofensiva**
- Conta os dias treinados. Ao concluir uma unidade, o dia registrado é o **da própria unidade**: concluir hoje a unidade de ontem registra ontem, não hoje.
- Os descansos previstos no plano **não quebram** a ofensiva, usando o plano que valia em cada data. Trocar a frequência não reescreve o passado.
- Perder um dia de treino previsto zera a contagem. A **melhor ofensiva** nunca diminui.

**Pontos e níveis**
- 10 pontos por exercício concluído e 20 de bônus ao concluir a unidade. Cada recompensa é concedida **uma única vez**; reabrir ou refazer a unidade não repete pontos.
- Um nível novo a cada 200 pontos, com barra de progresso.
- A pontuação garante consistência, não é um sistema antifraude.

**Perfil e configurações**
- Painel de perfil com nome de exibição, nível e XP, perfil de treino (experiência e dias por semana), dados e backup, e sair da conta.
- Se houver um treino antigo em andamento (formato anterior à trilha), ele aparece na tela inicial para retomar ou abandonar.

## 📲 Instalar no celular

1. Abra **https://virusdosol.github.io/crowfit/** no **Chrome** (Android) ou no **Safari** (iPhone).
2. Toque em **Instalar app** (Chrome) ou em **Compartilhar > Adicionar à Tela de Início** (Safari).
3. Abra pelo ícone novo. O primeiro acesso e o primeiro login precisam de internet. Depois, o app abre offline neste aparelho.

## 💾 Seus dados

O progresso fica **primeiro no seu aparelho**, no `localStorage`, **separado por conta**:

| Chave | Conteúdo |
|---|---|
| `corvofit-v2:u:<UID>` | Progresso da conta (perfil de treino, pontos, recompensas, ofensiva, dias concluídos, histórico, plano e trilha). `<UID>` é o identificador da conta no Supabase; o e-mail nunca é usado como chave. |
| `corvofit-v2:sync:<UID>` | Metadados de sincronização da conta (pendência, assinatura do último envio, sessões já enviadas, valores de recompensa). Pode ser apagada sem perder progresso: o app só reenvia. |
| `corvofit-v1` | Chave **histórica** (dados de antes das contas). Nunca é apagada nem reescrita. Uma única conta pode adotá-la, por decisão explícita, na primeira entrada; depois disso ela não é oferecida a nenhuma outra. |

- Sair da conta **não apaga** nada. Entrar com outra conta carrega outra partição; uma conta nunca vê o progresso da outra neste aparelho.
- Se a gravação falhar (por exemplo, armazenamento cheio), o app mostra um aviso fixo "Alterações NÃO salvas".
- Se os dados salvos estiverem corrompidos, o app **não os apaga**: mostra uma tela de recuperação e guarda uma cópia.
- Limpar os dados do navegador ou desinstalar o app **apaga o progresso deste aparelho**. Com a sincronização, o que já foi enviado continua na sua conta (veja abaixo).
- **Exportar backup** e **Importar backup** (arquivo `.json`) ficam em *Perfil > Dados e backup*. A importação valida o arquivo e guarda uma cópia dos dados atuais antes de trocar.

## 🔐 Conta e login

- Cadastro e login por e-mail e senha, login com Google, recuperação e troca de senha e logout (Supabase Auth). A sessão fica salva no navegador.
- Sem sessão, uma tela de acesso cobre o app. Se o aparelho já teve login e está sem internet (ou o SDK não carregou), o app abre mesmo assim, na partição da última conta.
- **Perfil remoto:** o nome de exibição fica em `public.profiles` (leitura e atualização por RLS). O perfil de treino (idade, peso, altura) **não** vai ao servidor.
- O **SDK do Supabase** é carregado de `cdn.jsdelivr.net` (versão fixada) e guardado em cache pelo service worker.
- A chave publicável em `supabase-config.js` é pública por design. Nunca coloque ali `service_role`, senhas ou o Client Secret do Google.

## 🔄 Sincronização

> **Status:** implementada no código e coberta por testes automatizados que usam um simulador das regras do SQL. **Ainda não foi validada de ponta a ponta** em navegador real contra o Supabase. Até esse teste, não trate a sincronização como confirmada em produção.

### O que sincroniza

| Dado local | Tabela remota | Como |
|---|---|---|
| Pontos, melhor ofensiva, última data de treino, dias concluídos, histórico de plano, recompensas | `public.user_progress` | RPC `merge_my_progress` |
| Sessões do histórico (`S.history`) | `public.workout_sessions` | RPC `upsert_my_sessions` (lotes de até 100) |
| Conquistas | `public.achievements_unlocked` | RPC `unlock_my_achievements` (leitura pronta; veja limites) |

A leitura das três tabelas é por `SELECT` sob RLS: cada usuário só enxerga as próprias linhas. Toda escrita passa pelas RPCs, que usam `auth.uid()`; o app nunca envia um UID.

### Reconciliação (sem perder nem duplicar)

- **Pontos:** o servidor calcula `points = base_points + soma(rewards)`. O app envia `base_points = S.points − soma das recompensas enviadas`, o que preserva exatamente o total local. Recompensas sem valor seguro de derivar (chaves desconhecidas) **não** são enviadas e permanecem dentro de `base_points`.
- **Valor de cada recompensa:** `ex:<data>:<exercício>` = 10; `sess:<data>` = 20; `tr:s<k>u<n>` = 10 × exercícios da unidade + 20. Se o valor já existe no servidor, ele prevalece.
- **Regras de mescla (no servidor):** `base_points`, melhor ofensiva e última data ficam com o maior valor; dias concluídos e recompensas são unidos; o plano é unido por data. Nada regride.
- **Resultado:** o app adota a linha devolvida (pontos, recompensas, dias, plano, ofensiva) sem remover nada local, e grava na partição da conta.
- **Sessões:** só sessões finalizadas (`completed`, `interrupted`, `abandoned`) são enviadas. Sessão finalizada é imutável no servidor; só o feedback pode ser preenchido, uma vez. No login, sessões que só existem no servidor entram no histórico local.
- **Se os pontos locais forem menores que a soma das recompensas** (estado inconsistente), a sincronização para, mostra um aviso e não envia nada.

### Quando sincroniza

Ao entrar na conta, ao salvar o progresso (agrupado por ~4 s, sem timers soltos), ao voltar a conexão e ao voltar para o app. Se nada relevante mudou, não há requisição.

### Offline e falhas

- O app abre e funciona sem a rede; o progresso continua sendo salvo localmente.
- Sem rede, a pendência é registrada e o envio é repetido quando a conexão volta (com intervalos crescentes). Nenhum sucesso falso é mostrado.
- Se o servidor recusar um conteúdo (erro de validação), o app não repete sozinho o mesmo conteúdo, mantém tudo local e avisa.
- Cada rodada pertence a uma conta e a uma "geração" do app: se a conta trocar no meio de uma resposta, nada é gravado na conta errada.

### Limites conhecidos

- **A trilha não é sincronizada** (`S.trail`: data de início, exercícios marcados, níveis congelados). O banco atual não tem coluna para isso. Em outro aparelho, pontos, dias concluídos e recompensas chegam, mas as marcações da trilha e a data de início dela começam do zero. As recompensas já registradas impedem pontos repetidos.
- **Não sincronizam:** perfil de treino (idade, peso, altura, experiência, dias), ajuste de dificuldade e treino em andamento.
- **Sessões:** as unidades da trilha não geram sessões; só o histórico de sessões do formato antigo é enviado.
- **Conquistas:** o app ainda não tem catálogo nem desbloqueios locais, então nada é enviado hoje. O envio está implementado e pronto para quando existirem.

## 🛠 Para quem quer mexer no código

HTML, CSS e JavaScript puro, sem build e sem framework. Dependências externas: SDK do Supabase (CDN, versão fixada) e as fontes Fredoka e Nunito (Google Fonts, só visual). Todos os arquivos ficam na raiz.

```
crowfit/
├── index.html              # telas, estilo e lógica principal do app
├── core.js                 # regras puras: validação, pontos, ofensiva, sessões, recompensas
├── store.js                # armazenamento local por conta (chaves, adoção do legado)
├── program.js              # programação dos treinos e exercícios
├── trail.js                # trilha: semanas, unidades, pontos e ofensiva por unidade
├── trail.css               # estilo da trilha
├── supabase-config.js      # URL e chave publicável do Supabase
├── auth.js                 # autenticação (cliente Supabase único)
├── auth-ui.js              # telas de entrada, login, cadastro e recuperação
├── auth.css                # estilo das telas de autenticação
├── profile.js              # painel de perfil e perfil remoto (public.profiles)
├── profile.css, settings.css
├── supabase-sync.js        # sincronização (RPCs, fila, offline, reconciliação)
├── sw.js                   # service worker (cache offline)
├── manifest.json           # PWA
├── supabase-profiles.sql, supabase-profiles-fix.sql, supabase-profiles-verify.sql
├── supabase-sync.sql       # tabelas, RLS e RPCs da sincronização
└── imagens: mascot.png, logo.png, intro-logo.png, intro-mascot.png, splash.jpg, icon-*.png
```

Ordem de carregamento no `index.html`: SDK, `supabase-config.js`, `auth.js`, `auth-ui.js`, `profile.js`, `core.js`, `store.js`, `program.js`, `trail.js`, `supabase-sync.js` e, por fim, o script do app.

Para rodar localmente, sirva a pasta com um servidor estático (por exemplo `python3 -m http.server`) e abra `http://localhost:8000`. O service worker só funciona em `localhost` ou `https`.

**Atualizando o app:** depois de mudar um arquivo, aumente `CACHE_VERSION` no `sw.js` e inclua arquivos novos na lista de cache. O service worker usa a rede primeiro para HTML, JS e JSON, apaga só caches com o prefixo `crowfit-cache-` e **nunca intercepta nem guarda** requisições ao Supabase. Se trocar a versão do SDK, altere a URL no `index.html` **e** no `sw.js`.

## Instalação própria (seu projeto Supabase)

O login e a sincronização só funcionam com o **seu** projeto Supabase.

1. Crie o projeto e coloque a URL e a chave publicável em `supabase-config.js`.
2. No *SQL Editor*, **revise e execute em um banco novo**, nesta ordem: `supabase-profiles.sql` (já inclui as correções) e depois `supabase-sync.sql`. Use `supabase-profiles-verify.sql` para conferir os perfis; o final de `supabase-sync.sql` traz a verificação da sincronização. (O projeto original já tem esses scripts aplicados; eles não precisam ser executados de novo nele.)
3. Em *Authentication > URL Configuration*, defina o Site URL com o endereço real do app e as Redirect URLs (com e sem `index.html`; `http://localhost:PORTA/**` para testes locais).
4. Em *Authentication > Providers*, ative e-mail (decida sobre "Confirm email") e Google (Client ID e Secret só no painel do Supabase).
5. No Google Cloud, autorize o URI `https://<seu-projeto>.supabase.co/auth/v1/callback`.
6. Para publicar: fork, *Settings > Pages*, branch `main`, pasta `/ (root)`.

O SMTP padrão do Supabase tem limite baixo de envios; para uso real, configure um SMTP próprio.

## Ainda não tem

- Sincronização da trilha, do perfil de treino e do ajuste de dificuldade.
- Conquistas (o envio ao servidor já existe; faltam o catálogo e os desbloqueios no app).
- Tela de histórico de sessões.
- Ilustrações ou vídeos dos exercícios.
- Ligas, amigos e lembretes diários.

Sugestões e contribuições são bem-vindas: abra uma *issue* ou um *pull request*.

## Observações

- O Crowfit não substitui orientação médica nem de um profissional de educação física. Se você tem alguma condição de saúde, converse com um profissional antes de começar.
- Respeite o seu corpo: se algo doer, pare ou pule o exercício.

---

<div align="center">

Feito por **virusdosol** para quem quer treinar em qualquer lugar, sem desculpa e sem equipamento.

</div>
