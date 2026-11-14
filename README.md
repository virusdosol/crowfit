<div align="center">

<img src="logo-dark.png" alt="Crowfit" width="260">

# Treine. Evolua. Mantenha a ofensiva.

**Seu treino, sua trilha, sua evolução — um dia de cada vez.**

Treinos sem equipamentos, progressão gamificada e uma experiência pensada para acompanhar você todos os dias.

[**Abrir o Crowfit**](https://virusdosol.github.io/crowfit/) · [Instalar no celular](#-instale-no-celular) · [Como funciona](#-como-funciona) · [Desenvolvimento](#-para-desenvolvedores)

![PWA](https://img.shields.io/badge/PWA-instalável-17171C?style=flat-square)
![Mobile first](https://img.shields.io/badge/feito_para-mobile-E3182D?style=flat-square)
![Treino](https://img.shields.io/badge/treino-sem_equipamento-F5B800?style=flat-square)

<img src="mascot.png" alt="Mascote do Crowfit" width="116">

</div>

---

## 🐦 Conheça o Crowfit

O Crowfit transforma a rotina de exercícios em uma jornada. Você define seu perfil, recebe uma programação semanal e acompanha cada treino por uma trilha de evolução.

A proposta é simples: **criar consistência, acompanhar seu progresso e ter um motivo a mais para voltar amanhã.**

## ✦ O que você encontra

| Recurso | O que faz |
|---|---|
| **Plano personalizado** | Organiza sua semana de acordo com seu perfil e sua disponibilidade. |
| **Trilha de treinos** | Divide a jornada em unidades diárias, organizadas por semana. |
| **Treino guiado** | Apresenta os exercícios em sequência, com controles de tempo e descanso. |
| **Ofensiva** | Acompanha seus dias de treino consecutivos e sua melhor marca. |
| **XP e níveis** | Recompensa sua evolução e acompanha seu progresso. |
| **Nozes de recompensa** | Adiciona recompensas semanais à jornada. |
| **Experiência instalável** | Funciona como um aplicativo no celular e oferece suporte offline. |

## 🎮 Como funciona

1. **Monte seu perfil** — informe seus dados de treino e quantos dias por semana deseja se exercitar.
2. **Receba sua programação** — o Crowfit organiza os treinos e os dias de descanso.
3. **Siga a trilha** — avance pelas unidades e conclua os exercícios.
4. **Ganhe recompensas** — acumule XP, evolua de nível e mantenha sua ofensiva.
5. **Continue evoluindo** — volte a cada dia e construa uma rotina consistente.

## 📲 Instale no celular

O Crowfit é um PWA: você pode instalá-lo pela página, sem precisar procurar o aplicativo em uma loja.

**Android — Chrome**
1. Acesse [virusdosol.github.io/crowfit](https://virusdosol.github.io/crowfit/).
2. Abra o menu do navegador.
3. Toque em **Instalar app** ou **Adicionar à tela inicial**.

**iPhone — Safari**
1. Acesse [virusdosol.github.io/crowfit](https://virusdosol.github.io/crowfit/).
2. Toque em **Compartilhar**.
3. Selecione **Adicionar à Tela de Início**.

> O primeiro acesso e a autenticação precisam de conexão com a internet. O funcionamento offline depende de o aplicativo já ter sido carregado neste aparelho.

## 💾 Seus dados e sua conta

O Crowfit utiliza armazenamento local para manter os dados de uso no aparelho e integração com Supabase para autenticação e recursos de sincronização.

- O progresso local fica associado à conta utilizada no aparelho.
- Sair da conta não é o mesmo que apagar os dados.
- Limpar os dados do navegador ou desinstalar o aplicativo pode remover o progresso armazenado localmente.
- Quando disponível, use as opções de **exportar backup** e **importar backup** na área de perfil para proteger seus dados.

**Importante:** a disponibilidade da sincronização entre aparelhos depende da configuração correta do projeto Supabase e das migrações correspondentes.

## 🧭 Identidade do projeto

O Crowfit tem uma interface clara, direta e mobile-first. A identidade combina fundo branco, tons escuros para leitura e vermelho como cor principal de ação, com detalhes em dourado e laranja para recompensas.

A experiência visual utiliza o corvo como mascote e elementos próprios para representar a ofensiva, a trilha e as nozes.

---

## 🛠 Para desenvolvedores

O projeto é construído com **HTML, CSS e JavaScript**, sem etapa de build ou framework obrigatório.

### Executar localmente

Clone o repositório:

```bash
git clone https://github.com/virusdosol/crowfit.git
cd crowfit
```

Inicie um servidor estático:

```bash
python3 -m http.server 8000
```

Acesse [http://localhost:8000](http://localhost:8000).

> O service worker exige HTTPS ou ambiente local (`localhost`).

### Estrutura principal

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Estrutura principal e inicialização do aplicativo. |
| `core.js` | Regras centrais, progresso e recompensas. |
| `store.js` | Persistência local. |
| `program.js` | Organização dos programas de treino. |
| `trail.js` / `trail.css` | Trilha de unidades e sua interface. |
| `auth.js` / `auth-ui.js` | Autenticação e telas de acesso. |
| `profile.js` | Perfil e configurações do usuário. |
| `supabase-sync.js` | Integração e sincronização com Supabase. |
| `sw.js` | Cache e experiência offline. |
| `manifest.json` | Configuração instalável do PWA. |
| `tests/` | Testes automatizados. |

### Configuração do Supabase

Para executar uma instalação própria com autenticação e sincronização:

1. Crie um projeto no [Supabase](https://supabase.com/).
2. Configure a URL do projeto e a chave publicável em `supabase-config.js`.
3. Configure os provedores de autenticação e as URLs de redirecionamento no painel do Supabase.
4. Revise os arquivos SQL do repositório e aplique as migrações na ordem indicada pela documentação de cada arquivo.
5. Configure o domínio de publicação nas URLs permitidas de autenticação.

**Segurança:** a chave publicável pode estar no frontend. Nunca exponha `service_role`, senhas ou segredos OAuth no código do aplicativo.

### Testes

Os testes automatizados podem ser executados com:

```bash
node --test
```

### Contribuições

Encontrou um problema ou tem uma ideia para melhorar o Crowfit?

- Abra uma **Issue** para relatar bugs ou sugerir funcionalidades.
- Envie um **Pull Request** com a alteração e uma descrição objetiva do que foi feito.
- Sempre que possível, inclua passos para reproduzir o problema e evidências da correção.

---

## ⚠️ Aviso

O Crowfit é uma ferramenta de apoio à organização de exercícios e à criação de hábitos. Não substitui avaliação ou orientação de profissionais de saúde e educação física. Respeite seus limites e interrompa o exercício caso sinta dor ou desconforto.

<div align="center">

<img src="intro-mascot.png" alt="" width="88">

**Feito por [virusdosol](https://github.com/virusdosol).**

*Um dia de cada vez. Uma unidade de cada vez. Uma ofensiva de cada vez.*

[**Comece sua jornada no Crowfit →**](https://virusdosol.github.io/crowfit/)

</div>
