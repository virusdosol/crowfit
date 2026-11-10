<div align="center">

<img src="mascot.png" alt="Mascote corvo do Crowfit" width="112">

# CROWFIT

### Treino sem equipamento. Evolução com propósito.

**Um dia de cada vez. Uma repetição de cada vez.**

[Abrir o aplicativo](https://virusdosol.github.io/crowfit/) · [Instalar
no celular](https://virusdosol.github.io/crowfit/) · [Reportar um
problema](https://github.com/virusdosol/crowfit/issues)

<br>

<img src="logo.png" alt="Crowfit" width="220">

</div>

------------------------------------------------------------------------

> **Crowfit é mais do que uma lista de exercícios.** É um companheiro de
> consistência para quem quer desenvolver força, criar hábitos e treinar
> em qualquer lugar — sem depender de equipamentos.

## ✦ Sobre o projeto

O Crowfit é um aplicativo de treinamento com peso corporal, pensado
primeiro para celulares. A experiência combina planos semanais, treinos
guiados, acompanhamento de consistência e uma progressão inspirada em
aplicativos de aprendizagem: você treina, conclui etapas, acumula pontos
e acompanha sua evolução.

A proposta é simples: tornar o exercício mais acessível, compreensível e
sustentável. Sem academia obrigatória. Sem equipamento especial. Sem
transformar cada treino em uma competição.

**Feito para caber na vida real:** em casa, no quarto, no parque ou onde
houver espaço para se movimentar.

## ✦ A experiência

| Pilar             | O que oferece                                                                         |
|-------------------|---------------------------------------------------------------------------------------|
| **Treino guiado** | Exercícios apresentados em etapas, com séries, descanso e orientações.                |
| **Plano semanal** | Distribuição de grupos musculares e dias de descanso conforme a frequência escolhida. |
| **Progressão**    | Ajustes graduais de dificuldade com base na experiência e no retorno após os treinos. |
| **Consistência**  | Ofensiva, histórico de dias concluídos e acompanhamento semanal.                      |
| **Motivação**     | Pontos, níveis e o corvo mascote acompanhando a jornada.                              |
| **Acesso móvel**  | Aplicativo web progressivo (PWA), instalável em dispositivos compatíveis.             |

## ✦ Como funciona

### 1. Conheça seu ponto de partida

No primeiro acesso, o aplicativo apresenta um onboarding para coletar
informações como nome, idade, peso, altura, experiência com exercícios e
quantidade de dias disponíveis para treinar por semana.

Essas informações ajudam a configurar a experiência inicial. Elas não
substituem avaliação profissional e não devem ser interpretadas como
diagnóstico ou prescrição clínica.

### 2. Receba uma semana de treinos

O Crowfit organiza os dias de atividade e descanso de acordo com a
frequência escolhida. Os padrões semanais atuais contemplam de **3 a 6
dias de treino**.

| Frequência | Organização geral                                            |
|------------|--------------------------------------------------------------|
| 3 dias     | Corpo todo, pernas e peito/braços                            |
| 4 dias     | Peito/braços, pernas, abdômen e corpo todo                   |
| 5 dias     | Peito/braços, pernas, abdômen e sessões adicionais           |
| 6 dias     | Alternância entre peito/braços, pernas, abdômen e corpo todo |

A distribuição exata é definida pelo plano do aplicativo. Os dias de
descanso fazem parte da programação — recuperar também é treinar.

### 3. Complete as sessões

O treino é dividido em etapas para facilitar o acompanhamento:

- Um exercício por tela.
- Séries individuais com indicação de progresso.
- Exercícios por repetição ou por tempo.
- Cronômetro com pausa e retomada para exercícios cronometrados.
- Intervalos de descanso que podem ser iniciados, pausados ou pulados.
- Possibilidade de retomar uma sessão interrompida, quando o estado
  salvo permitir.

Aquecimento e alongamento são opcionais na implementação atual; os
demais exercícios obrigatórios contam para a conclusão completa da
sessão.

### 4. Evolua com consistência

O Crowfit utiliza pontos e níveis como incentivo:

- **10 pontos** por exercício concluído, com todas as séries.
- **20 pontos** de bônus pela conclusão dos exercícios obrigatórios da
  sessão.
- **200 pontos** para avançar um nível.
- Repetir um treino no mesmo dia é permitido, mas não deve conceder
  novamente recompensas já contabilizadas.

A pontuação atual é uma mecânica de motivação local. Não é um sistema
antifraude, não representa uma medida científica de condicionamento e
não deve ser usada como classificação competitiva ou premiação.

## ✦ Ofensiva e acompanhamento semanal

A ofensiva representa a continuidade dos treinos previstos no plano.

- Treinos completos contribuem para a ofensiva.
- Dias de descanso programados não devem quebrá-la.
- A melhor ofensiva fica registrada.
- Alterar a frequência de treino não deve reescrever retroativamente o
  planejamento de datas anteriores.

A visão semanal ajuda a identificar dias concluídos, o dia atual,
treinos pendentes, dias futuros e descansos.

## ✦ Biblioteca de movimentos

A biblioteca atual contempla exercícios de peso corporal, incluindo:

**Peito, braços e parte superior** - Flexões com joelhos, tradicionais,
diamante e pike. - Mergulho em cadeira firme.

**Pernas e glúteos** - Agachamento. - Afundo. - Ponte de glúteos. -
Agachamento na parede. - Elevação de panturrilhas.

**Abdômen e core** - Abdominal. - Prancha. - Bicicleta. - Elevação de
pernas. - Escalador.

**Condicionamento e mobilidade** - Polichinelo. - Burpee. -
Alongamentos.

A execução correta importa mais do que a velocidade. Adapte os
movimentos à sua capacidade e interrompa o exercício se sentir dor.

## ✦ Instale no seu celular

O Crowfit é publicado como um **Progressive Web App (PWA)**. Em
navegadores compatíveis, pode ser adicionado à tela inicial e aberto
como um aplicativo.

1.  Acesse
    [virusdosol.github.io/crowfit](https://virusdosol.github.io/crowfit/).
2.  No Android, use a opção de instalação do Chrome quando disponível.
3.  No iPhone, abra o menu Compartilhar do Safari e escolha **Adicionar
    à Tela de Início**.
4.  Abra o Crowfit pelo ícone instalado.

A disponibilidade de recursos offline depende de o aplicativo e seus
arquivos terem sido carregados e armazenados em cache anteriormente. O
primeiro acesso e os recursos que dependem de autenticação ou serviços
externos exigem conexão.

## ✦ Conta, privacidade e armazenamento

O projeto utiliza o **Supabase** para autenticação. O código inclui
fluxos de cadastro e login por e-mail e senha, autenticação com Google,
recuperação/atualização de senha e encerramento de sessão.

O módulo de perfil também possui integração com a tabela `profiles` para
informações básicas, como nome de exibição. A disponibilidade efetiva de
cada provedor depende da configuração do projeto Supabase e dos
respectivos provedores externos.

### O que está confirmado na implementação pública consultada

- O estado principal do aplicativo é persistido no navegador usando
  `localStorage`, sob a chave histórica `corvofit-v1`.
- O perfil de treino, pontos, ofensiva e histórico permanecem associados
  ao armazenamento local dessa instalação.
- A autenticação Supabase mantém uma sessão de usuário, mas isso não
  significa que todo o progresso esteja sincronizado com essa conta.
- O código público consultado não demonstra sincronização completa do
  progresso entre contas ou dispositivos.
- Fazer logout não deve ser interpretado como exclusão dos dados locais.
- Limpar os dados do navegador ou desinstalar o aplicativo pode remover
  dados locais que não tenham sido exportados.

**Atenção:** na implementação pública consultada, os dados locais não
estão adequadamente isolados por conta. Em um aparelho compartilhado,
trocar de usuário pode deixar informações locais visíveis para outra
sessão. Até que o isolamento por usuário seja implementado e testado,
não considere o Crowfit pronto para uso multiusuário seguro no mesmo
navegador.

### Backup e recuperação

A versão atual inclui exportação e importação de backup em arquivo JSON.
O arquivo pode ser usado para transportar dados entre instalações, mas
deve ser tratado como informação pessoal.

- Guarde backups em local privado.
- Não publique arquivos de backup em issues, fóruns ou repositórios.
- Antes de importar, confira se o arquivo pertence ao perfil correto.
- A importação pode substituir dados locais; mantenha uma cópia de
  segurança antes de restaurar.

### Segurança

A chave publicável do Supabase usada no cliente é pública por definição.
Nunca inclua no código do navegador uma chave `service_role`, senha
administrativa, segredo OAuth ou credencial privada.

A autenticação não transforma automaticamente dados armazenados no
navegador em dados protegidos por usuário. Isolamento, autorização no
banco e políticas RLS precisam ser implementados e testados
separadamente.

## ✦ Estado do projeto

O quadro abaixo descreve a implementação pública consultada no branch
`main`. Ele deve ser atualizado quando funcionalidades forem
efetivamente implementadas e validadas.

| Área                                      | Estado documentado                                                        |
|-------------------------------------------|---------------------------------------------------------------------------|
| Treinos guiados e exercícios              | Implementados no aplicativo                                               |
| Plano semanal e dias de descanso          | Implementados no aplicativo                                               |
| Pontos, níveis e ofensiva                 | Implementados localmente                                                  |
| Persistência do progresso                 | Local (`localStorage`)                                                    |
| Exportação e importação de backup         | Implementadas                                                             |
| PWA e cache de arquivos                   | Implementados; comportamento offline depende do cache e da conexão        |
| Autenticação Supabase                     | Código integrado; configuração e testes ponta a ponta necessários         |
| Login com Google                          | Código integrado; depende da configuração do provedor e validação prática |
| Perfil básico remoto                      | Módulo de perfil Supabase presente                                        |
| Perfil de treino remoto                   | Não confirmado como sincronizado                                          |
| Sincronização completa entre dispositivos | Não confirmada na versão pública consultada                               |
| Isolamento de progresso por conta         | Requer correção e validação                                               |
| Tela completa de histórico                | Não confirmada como funcionalidade de interface                           |
| Conquistas, ligas e amigos                | Não implementados na versão consultada                                    |
| Lembretes diários                         | Não implementados na versão consultada                                    |

> O status acima é uma fotografia do código público consultado, não uma
> promessa de disponibilidade futura. Uma funcionalidade só deve ser
> marcada como concluída depois de implementada, testada e documentada.

## ✦ Para desenvolvedores

### Tecnologias

- **HTML5** para estrutura e interface.
- **CSS3** para identidade visual e responsividade.
- **JavaScript puro** para lógica e interações.
- **Supabase Auth** para autenticação.
- **Supabase Database** para os recursos remotos já integrados.
- **Service Worker** e **Web App Manifest** para a experiência PWA.
- **Google Fonts** para tipografia.
- **GitHub Pages** para publicação.

O projeto não utiliza um processo de build obrigatório na estrutura
pública consultada. Os arquivos estáticos são servidos diretamente.

### Estrutura do repositório

``` text
crowfit/
├── index.html                    # Interface principal e estrutura do app
├── core.js                       # Estado, regras, pontos, sessões e ofensiva
├── program.js                    # Lógica relacionada aos programas de treino
├── trail.js                      # Recursos da trilha/jornada
├── trail.css                     # Estilos da trilha/jornada
├── auth.js                       # Integração de autenticação
├── auth-ui.js                    # Interface de login e cadastro
├── auth.css                      # Estilos da autenticação
├── profile.js                    # Integração do perfil
├── profile.css                   # Estilos do perfil
├── supabase-config.js             # URL e chave publicável do Supabase
├── supabase-profiles.sql          # Estrutura inicial de perfis
├── supabase-profiles-fix.sql      # Ajustes/reparo da estrutura de perfis
├── supabase-profiles-verify.sql   # Consultas de verificação
├── sw.js                          # Service Worker e cache
├── manifest.json                  # Metadados do PWA
├── mascot.png                     # Mascote
├── logo.png                       # Logotipo
├── icon-180.png                   # Ícone para iOS
├── icon-192.png                   # Ícone PWA
├── icon-512.png                   # Ícone PWA
├── icon-maskable-512.png           # Ícone adaptável
└── splash.jpg                     # Imagem de abertura
```

A lista reflete os arquivos visíveis na raiz do branch público
consultado. Consulte o repositório antes de assumir que nomes, módulos
ou responsabilidades continuam iguais.

### Executar localmente

É necessário ter Python 3 ou outro servidor HTTP estático.

``` bash
git clone https://github.com/virusdosol/crowfit.git
cd crowfit
python3 -m http.server 8000
```

Abra `http://localhost:8000` no navegador.

O Service Worker requer `localhost` ou HTTPS. Recursos de autenticação
exigem configuração válida do Supabase e URLs de redirecionamento
compatíveis com o endereço utilizado.

### Configuração do Supabase

Para executar uma cópia própria do projeto:

1.  Crie um projeto no Supabase.
2.  Configure a URL do projeto e a chave publicável em
    `supabase-config.js`.
3.  Configure os provedores de autenticação que pretende utilizar.
4.  Defina corretamente Site URL e Redirect URLs.
5.  Configure as tabelas, funções e políticas RLS necessárias, usando os
    scripts SQL correspondentes.
6.  Teste cadastro, login, logout, recuperação de senha e retorno do
    OAuth em ambiente real.

**Nunca execute scripts SQL sem revisar o conteúdo e confirmar que
correspondem à versão atual do código.** Faça backup do banco antes de
alterações estruturais.

### Atualização do Service Worker

Quando arquivos do aplicativo forem alterados, revise a estratégia de
cache em `sw.js` e atualize a versão do cache quando necessário.
Verifique se novos módulos JavaScript, estilos e recursos foram
incluídos na lista de arquivos essenciais.

Não armazene respostas privadas ou dados de autenticação no cache
público do Service Worker.

## ✦ Princípios de desenvolvimento

O Crowfit deve evoluir sem perder sua simplicidade. Toda contribuição
deve respeitar estes princípios:

1.  **Mobile first:** a experiência principal acontece no celular.
2.  **Acessibilidade:** textos legíveis, controles claros e navegação
    compreensível.
3.  **Privacidade por padrão:** dados pessoais não devem vazar entre
    contas.
4.  **Integridade dos dados:** migrações e sincronizações nunca devem
    apagar progresso silenciosamente.
5.  **Offline com honestidade:** indicar o que funciona sem internet e o
    que depende de serviços externos.
6.  **Código simples:** preferir soluções nativas e legíveis antes de
    adicionar dependências.
7.  **Consistência visual:** preservar a identidade do corvo e o sistema
    visual do produto.
8.  **Testes antes de promessas:** documentar somente o que foi
    realmente validado.

### Diretrizes para alterações com IA

Se utilizar uma ferramenta de IA para modificar o projeto:

- Leia os arquivos existentes antes de propor mudanças.
- Não recrie módulos que já existem sem justificar.
- Não substitua arquivos inteiros quando uma alteração localizada for
  suficiente.
- Preserve compatibilidade com os dados locais existentes.
- Não misture dados de contas diferentes.
- Não exponha segredos no frontend.
- Revise permissões e políticas RLS no Supabase.
- Atualize o Service Worker quando necessário.
- Informe os arquivos modificados, migrações SQL, testes realizados e
  limitações.
- Não marque funcionalidades como concluídas sem validação prática.

## ✦ Como contribuir

Toda contribuição que torne o Crowfit mais útil, acessível, seguro e
agradável é bem-vinda.

1.  Abra uma issue descrevendo o problema ou a melhoria.
2.  Explique como reproduzir o comportamento, quando aplicável.
3.  Proponha a solução sem quebrar funcionalidades existentes.
4.  Envie um pull request com uma descrição objetiva e testes
    realizados.

Antes de propor uma grande mudança, converse pela área de
[Issues](https://github.com/virusdosol/crowfit/issues).

## ✦ Segurança e relatos de vulnerabilidade

Não publique tokens, senhas, arquivos `.env`, backups pessoais ou dados
de usuários em issues públicas.

Se encontrar uma falha que possa expor contas ou informações pessoais,
evite divulgar detalhes exploráveis publicamente. Procure um canal
privado com o mantenedor antes de compartilhar a reprodução técnica.

## ✦ Aviso de saúde

O Crowfit é uma ferramenta de apoio à prática de exercícios e à criação
de hábitos. Não substitui avaliação médica, fisioterapêutica ou
orientação individual de um profissional de educação física.

Respeite seus limites, priorize a técnica e interrompa a atividade em
caso de dor, tontura ou mal-estar. Se você possui uma condição de saúde,
está retornando após lesão ou tem dúvidas sobre quais exercícios pode
realizar, procure orientação profissional.

## ✦ Comunidade

O Crowfit nasce da ideia de que evoluir não precisa ser complicado. Cada
pessoa começa de um ponto diferente, e cada pequena conquista merece
espaço.

Se o projeto te ajuda a se movimentar, aprender e manter a constância,
compartilhe com alguém que também queira começar.

- **Aplicativo:** https://virusdosol.github.io/crowfit/
- **Código-fonte:** https://github.com/virusdosol/crowfit
- **Sugestões e problemas:**
  https://github.com/virusdosol/crowfit/issues

------------------------------------------------------------------------

<div align="center">

**CROWFIT**

*Treine no seu ritmo. Evolua no seu tempo.*

Feito com dedicação por **virusdosol** e por uma comunidade que acredita
na força da constância.

</div>
