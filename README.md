<div align="center">

<img src="logo.png" alt="Crowfit" width="300">

# Treino sem equipamento, um dia de cada vez

**Uma semana de treinos montada para você, uma trilha para seguir, uma ofensiva para não quebrar e nozes de recompensa no fim de cada semana.**

[**Abrir o app**](https://virusdosol.github.io/crowfit/) · [Direção visual](#-direção-visual) · [Como funciona](#-como-funciona) · [Instalar](#-instalar-no-celular) · [Seus dados](#-seus-dados)

![PWA](https://img.shields.io/badge/PWA-instalável-17171C?style=flat-square)
![Offline](https://img.shields.io/badge/funciona-offline-5E5E73?style=flat-square)
![Mobile first](https://img.shields.io/badge/mobile-first-E3182D?style=flat-square)
![Sem equipamento](https://img.shields.io/badge/sem-equipamento-F5B800?style=flat-square)

</div>

---

## 🧭 Em uma frase

Você responde algumas perguntas, o Crowfit monta a sua semana, e o corvo te acompanha enquanto você constrói a ofensiva.

<div align="center">

<img src="mascot.png" alt="Corvo mascote do Crowfit" width="120">

</div>

---

## 🎨 Direção visual

O Crowfit é **branco, vermelho, preto e laranja**, com cara de app de hábitos: limpo, direto e com um toque de energia.

### Paleta

| Papel | Cor | Hex | Onde aparece |
|---|---|---|---|
| Fundo | ![](https://img.shields.io/badge/-FFFFFF-FFFFFF?style=flat-square&labelColor=FFFFFF) | `#FFFFFF` | Todas as telas |
| Cartões | ![](https://img.shields.io/badge/-F8F8FB-F8F8FB?style=flat-square) | `#F8F8FB` | Cartões e painéis |
| Texto | ![](https://img.shields.io/badge/-17171C-17171C?style=flat-square) | `#17171C` | Títulos, texto, o corvo |
| Destaque | ![](https://img.shields.io/badge/-E3182D-E3182D?style=flat-square) | `#E3182D` | Ofensiva, botões, dias ativos |
| Vermelho escuro | ![](https://img.shields.io/badge/-B8121F-B8121F?style=flat-square) | `#B8121F` | Estados pressionados |
| Dourado | ![](https://img.shields.io/badge/-F5B800-F5B800?style=flat-square) | `#F5B800` | Brilho e detalhes |
| Laranja da chama | ![](https://img.shields.io/badge/-FF9F00-FF9F00?style=flat-square) | `#FF9F00` | Chama e nozes |
| Linhas | ![](https://img.shields.io/badge/-E6E6EE-E6E6EE?style=flat-square) | `#E6E6EE` | Bordas e divisórias |
| Texto secundário | ![](https://img.shields.io/badge/-5E5E73-5E5E73?style=flat-square) | `#5E5E73` | Legendas e dicas |

**Regra de ouro:** vermelho é o único destaque. Se algo está em vermelho, é importante: a ofensiva, um dia ativo, um botão principal.

### Tipografia

- **Fredoka**: números grandes e títulos de destaque (o contador de ofensiva, o XP da noz).
- **Nunito**: textos, botões e legendas.

### Formas e espaçamento

- Cartões com **borda de 2px** em `#E6E6EE` e **cantos de 18 a 24px**.
- Margem lateral de **18px** e largura máxima de **480px**, pensada primeiro para o celular.
- Dias de calendário com **pílulas**: sequências ativas viram faixas contínuas vermelhas.

### Ícones e imagens: o que é fixo

| Elemento | Regra |
|---|---|
| Logotipo | Versão **preta** (`logo-dark.png`) em fundos claros; a branca (`logo.png`) é só para fundos escuros. |
| Chama da ofensiva | PNG original (`flame.png`), sem redesenho e sem substituição por ícone genérico. |
| Nozes | Recortes da referência (`noz-fechada.png` e `noz-aberta.png`). |
| Corvo | `mascot.png`, sempre com o logotipo original. |
| Símbolos dos dias | Planetas da astrologia clássica, um por dia (veja abaixo). |

### Os símbolos dos dias

Cada dia da semana tem um astro, e cada astro representa um grupo de treino. A semana começa no **domingo**.

| Dia | Símbolo | Astro | Grupo |
|---|---|---|---|
| Domingo | ☉ | Sol | Ombros |
| Segunda | ☽ | Lua | Peito |
| Terça | ♂ | Marte | Braços |
| Quarta | ☿ | Mercúrio | Abdômen |
| Quinta | ♃ | Júpiter | Pernas |
| Sexta | ♀ | Vênus | Costas |
| Sábado | ♄ | Saturno | **Descanso** |

O descanso é sempre no **sábado** e aparece na trilha com um anel tracejado e o rótulo "descanso".

---

## 🧩 Como funciona

Um ciclo simples, do primeiro acesso à noz:

```mermaid
flowchart LR
    A[Responde o perfil] --> B[Recebe o plano de 3 a 6 dias]
    B --> C[Segue a trilha: uma unidade por dia]
    C --> D[Conclui exercícios e ganha pontos]
    D --> E[Mantém a ofensiva]
    C --> F[Fim da semana]
    F --> G[Ganha uma noz fechada]
    G --> H[Abre a noz e recebe XP]
    H --> D
```

### 1. Seu plano

No primeiro acesso, o app pergunta nome, idade, peso, altura, experiência e quantos dias por semana você quer treinar (3, 4, 5 ou 6). Os treinos são montados com base nisso, com dias de descanso já distribuídos.

<div align="center">

<img src="icon-512.png" alt="Ícone do Crowfit" width="96">

</div>

### 2. A trilha

A tela inicial é uma trilha de **unidades, uma por dia**, agrupadas em **semanas de 7 dias** (de domingo a sábado). Cada semana muda a cor dos círculos.

- Cada unidade abre **no dia dela**. Não dá para adiantar treinos.
- Unidades de dias anteriores continuam disponíveis para concluir.
- Só o mês atual (4 semanas) fica liberado. Os meses seguintes aparecem com cadeado.
- O treino guiado mostra um exercício por vez, com cronômetro para exercícios por tempo e descanso entre as séries.

### 3. A ofensiva

A ofensiva conta **dias seguidos treinados**. Ela tem uma chama com pena e um calendário com faixas vermelhas.

<div align="center">

<img src="flame.png" alt="Chama da ofensiva" width="160">

</div>

- O dia registrado é o **da própria unidade**: concluir hoje a unidade de ontem registra ontem.
- Dias de descanso **não quebram** a ofensiva.
- Perder um dia de treino previsto zera a contagem atual. A **melhor ofensiva** nunca diminui.
- No calendário, a faixa vermelha une os dias seguidos, a bolinha azul marca hoje (quando ainda não treinou) e o contorno preto marca o dia selecionado.

> **Pendente:** a trilha usa o **sábado** como descanso, mas a regra de ofensiva ainda considera o **domingo** como descanso. Assim, um sábado sem treino pode quebrar a ofensiva mesmo sendo dia de descanso na trilha. Essa regra ainda será ajustada.

### 4. As nozes

No fim de cada semana (de domingo a sábado) você ganha **uma noz fechada**.

- Ao tocar nela, uma tela mostra a noz aberta e um **número aleatório de XP**, proporcional ao seu nível.
- Cada noz só pode ser aberta uma vez, e o XP fica salvo na sua conta.
- As nozes ficam na tela de **Ofensivas**, abaixo do calendário.

<div align="center">

<img src="noz-fechada.png" alt="Noz fechada" width="110">&nbsp;&nbsp;&nbsp;&nbsp;➜&nbsp;&nbsp;&nbsp;&nbsp;<img src="noz-aberta.png" alt="Noz aberta" width="110">

</div>

### 5. Pontos e níveis

| Ação | Pontos |
|---|---|
| Exercício concluído | +10 |
| Unidade concluída (bônus) | +20 |
| Noz aberta | aleatório, de 20 a 50 vezes o nível atual |

- Um nível novo a cada **200 pontos**, com barra de progresso.
- Cada recompensa é concedida **uma única vez**. Refazer uma unidade não repete pontos.

---

## 📲 Instalar no celular

1. Abra **https://virusdosol.github.io/crowfit/** no **Chrome** (Android) ou no **Safari** (iPhone).
2. Toque em **Instalar app** (Chrome) ou em **Compartilhar > Adicionar à Tela de Início** (Safari).
3. Abra pelo ícone novo. O primeiro acesso e o primeiro login precisam de internet; depois, o app abre offline neste aparelho.

---

## 💾 Seus dados

O progresso fica **primeiro no seu aparelho**, separado por conta:

| Chave | Conteúdo |
|---|---|
| `corvofit-v2:u:<UID>` | Progresso da conta: perfil de treino, pontos, nozes, recompensas, ofensiva, dias concluídos, histórico, plano e trilha. O `<UID>` é o identificador da conta no Supabase; o e-mail nunca é usado como chave. |
| `corvofit-v2:sync:<UID>` | Metadados de sincronização. Pode ser apagada sem perder progresso: o app só reenvia. |
| `corvofit-v1` | Chave **histórica** de antes das contas. Nunca é apagada nem reescrita. |

- Sair da conta **não apaga** nada. Outra conta vê outra partição.
- Se a gravação falhar (por exemplo, armazenamento cheio), o app mostra o aviso **"Alterações NÃO salvas"**.
- Se os dados estiverem corrompidos, o app **não os apaga**: mostra uma tela de recuperação e guarda uma cópia.
- Limpar os dados do navegador ou desinstalar o app **apaga o progresso deste aparelho**.
- **Exportar backup** e **Importar backup** (arquivo `.json`) ficam em *Perfil > Dados e backup*. A importação valida o arquivo e guarda uma cópia dos dados atuais antes de trocar.

---

## 🔐 Conta e login

- Cadastro e login por e-mail e senha, login com Google, recuperação e troca de senha, e logout (Supabase Auth). A sessão fica salva no navegador.
- Sem sessão, uma tela de acesso cobre o app. Sem internet, o app abre na partição da última conta, se ela já tiver entrado neste aparelho.
- **Perfil remoto:** o nome de exibição fica em `public.profiles`, com leitura e atualização por RLS. O perfil de treino (idade, peso, altura) **não** vai ao servidor.
- O **SDK do Supabase** é carregado de `cdn.jsdelivr.net` (versão fixada) e guardado em cache pelo service worker.
- A chave publicável em `supabase-config.js` é pública por design. Nunca coloque ali `service_role`, senhas ou o Client Secret do Google.

---

## 🔄 Sincronização

> **Status:** implementada e coberta por testes automatizados que usam um simulador das regras do SQL. **Ainda não foi validada de ponta a ponta** em navegador real contra o Supabase.

| Dado local | Tabela remota | Como |
|---|---|---|
| Pontos, melhor ofensiva, última data, dias concluídos, histórico de plano, recompensas | `public.user_progress` | RPC `merge_my_progress` |
| Sessões do histórico | `public.workout_sessions` | RPC `upsert_my_sessions` (lotes de até 100) |
| Conquistas | `public.achievements_unlocked` | RPC `unlock_my_achievements` (envio pronto, catálogo ainda não existe) |

- A leitura é por `SELECT` sob RLS: cada usuário só enxerga as próprias linhas. Toda escrita passa pelas RPCs, que usam `auth.uid()`. O app nunca envia um UID.
- **Pontos:** o servidor calcula `points = base_points + soma(recompensas)`, o que preserva o total local exato.
- **Mescla:** `base_points`, melhor ofensiva e última data ficam com o maior valor; dias e recompensas são unidos. Nada regride.
- **Quando sincroniza:** ao entrar, ao salvar (agrupado por ~4 s), ao voltar a conexão e ao voltar para o app.
- **Offline:** a pendência é registrada e reenviada quando a conexão volta. Nenhum sucesso falso é mostrado.

### Limites conhecidos

- **A trilha não é sincronizada** (início, exercícios marcados, níveis). Em outro aparelho, pontos, dias e recompensas chegam, mas a trilha começa do zero.
- **Não sincronizam:** perfil de treino, ajuste de dificuldade, treino em andamento e as **nozes abertas** (o XP delas já entra nos pontos, mas a lista de nozes não vai ao servidor ainda).

---

## 🛠 Para quem quer mexer no código

HTML, CSS e JavaScript puro, sem build e sem framework. Dependências externas: SDK do Supabase (CDN, versão fixada) e as fontes Fredoka e Nunito (Google Fonts, só visual).

```
crowfit/
├── index.html              # telas, estilo e lógica principal (inclui a tela de Ofensivas e as nozes)
├── core.js                 # regras puras: validação, pontos, ofensiva, nozes, sessões, recompensas
├── store.js                # armazenamento local por conta
├── program.js              # programação dos treinos, grupos e símbolos dos dias
├── trail.js                # trilha: semanas, unidades, pontos e ofensiva por unidade
├── trail.css               # estilo da trilha (inclui o destaque do descanso)
├── supabase-config.js      # URL e chave publicável do Supabase
├── auth.js, auth-ui.js     # autenticação e telas de entrada
├── auth.css                # estilo das telas de autenticação
├── profile.js              # painel de perfil e perfil remoto
├── profile.css, settings.css
├── supabase-sync.js        # sincronização (RPCs, fila, offline, reconciliação)
├── sw.js                   # service worker (cache offline)
├── manifest.json           # PWA
├── supabase-profiles*.sql, supabase-sync.sql
└── imagens: logo.png, logo-dark.png, mascot.png, flame.png, noz-aberta.png,
             noz-fechada.png, intro-logo.png, intro-mascot.png, splash.jpg, icon-*.png
```

Ordem de carregamento no `index.html`: SDK, `supabase-config.js`, `auth.js`, `auth-ui.js`, `profile.js`, `core.js`, `store.js`, `program.js`, `trail.js`, `supabase-sync.js` e, por fim, o script do app.

**Rodar localmente:** sirva a pasta com um servidor estático (por exemplo `python3 -m http.server`) e abra `http://localhost:8000`. O service worker só funciona em `localhost` ou `https`.

**Atualizando o app:** depois de mudar um arquivo, aumente `CACHE_VERSION` no `sw.js` e inclua os arquivos novos na lista de cache. O service worker usa a rede primeiro para HTML, JS e JSON, apaga só caches com o prefixo `crowfit-cache-` e **nunca intercepta nem guarda** requisições ao Supabase.

---

## ☁️ Instalação própria (seu projeto Supabase)

O login e a sincronização só funcionam com o **seu** projeto Supabase.

1. Crie o projeto e coloque a URL e a chave publicável em `supabase-config.js`.
2. No *SQL Editor*, execute em um banco novo, nesta ordem: `supabase-profiles.sql` e depois `supabase-sync.sql`. Use `supabase-profiles-verify.sql` para conferir os perfis. (O projeto original já tem esses scripts aplicados.)
3. Em *Authentication > URL Configuration*, defina o Site URL com o endereço real do app e as Redirect URLs (com e sem `index.html`; `http://localhost:PORTA/**` para testes locais).
4. Em *Authentication > Providers*, ative e-mail (decida sobre "Confirm email") e Google (Client ID e Secret só no painel do Supabase).
5. No Google Cloud, autorize o URI `https://<seu-projeto>.supabase.co/auth/v1/callback`.
6. Para publicar: fork, *Settings > Pages*, branch `main`, pasta `/ (root)`.

O SMTP padrão do Supabase tem limite baixo de envios; para uso real, configure um SMTP próprio.

---

## 🗺 Ainda não tem

- Sincronização da trilha, do perfil de treino, do ajuste de dificuldade e das nozes.
- Conquistas (o envio já existe; faltam o catálogo e os desbloqueios).
- Tela de histórico de sessões.
- Ilustrações ou vídeos dos exercícios.
- Ligas, amigos e lembretes diários.
- Ajuste da regra de descanso da ofensiva para o sábado.

Sugestões e contribuições são bem-vindas: abra uma *issue* ou um *pull request*.

---

## ⚠️ Observações

- O Crowfit não substitui orientação médica nem de um profissional de educação física. Se você tem alguma condição de saúde, converse com um profissional antes de começar.
- Respeite o seu corpo: se algo doer, pare ou pule o exercício.

---

<div align="center">

<img src="intro-mascot.png" alt="" width="90">

Feito por **virusdosol** para quem quer treinar em qualquer lugar, sem desculpa e sem equipamento.

</div>
