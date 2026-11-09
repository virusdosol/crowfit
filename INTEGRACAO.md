# Crowfit — Autenticação (etapa 1): como integrar

Não tive acesso ao repositório, então estes arquivos são **autônomos**: não dependem do seu HTML nem do seu JS atual e não tocam em nenhuma chave de `localStorage` do app.

## Arquivos
- `auth/supabase-config.js` — URL e publishable key (único lugar).
- `auth/auth.js` — módulo `window.CrowfitAuth` (cadastro, login, Google, recuperação, logout, sessão).
- `auth/auth-ui.js` — telas (login, cadastro, recuperar, nova senha) em um overlay sobre o app.
- `auth/auth.css` — estilo. Para casar com o app, defina no seu CSS: `--crowfit-accent`, `--crowfit-bg`, `--crowfit-ink`.
- `teste-auth.html` — página de teste isolada (não faz parte do app).
- `index.html` e `sw.js` — os seus, já com a integração.

## 1. Teste isolado primeiro
Suba a pasta para um servidor (`python3 -m http.server 8000` e abra `http://localhost:8000/teste-auth.html`). Cadastre `http://localhost:8000/teste-auth.html` em Redirect URLs do Supabase (passo 3).

## 2. Integrar ao app (já feito no `index.html` deste zip)
O `index.html` incluído é o seu, com só duas inserções: o `<link>` do `auth/auth.css` antes de `</head>` e quatro `<script>` (SDK com `async` + os 3 arquivos de `auth/`) logo antes do `core.js`. Nada do app foi alterado. Suba **o `index.html` e a pasta `auth/`** para a raiz do repositório.

Como funciona: a tela de acesso cobre o app e ele fica inerte por baixo. Sem sessão, aparece login. Com sessão, a tela some e o fluxo atual segue: `S.profile ? renderHome() : renderOb()`. As chaves `corvofit-v1` (e `:corrompido`, `:antes-importar`) não são lidas nem escritas pela autenticação.

Logout: botão "Sair" no canto inferior esquerdo (desligue com `window.CROWFIT_AUTH_UI = { floatingLogout: false }` antes dos scripts) ou qualquer elemento com `data-crowfit-logout`. O evento `crowfit:auth` (detail.user = id, e-mail, nome; nunca tokens) fica para as próximas etapas.

## 3. Service Worker (já ajustado no `sw.js` deste zip)
Três mudanças no seu `sw.js`: (1) requisições a `*.supabase.co` passam direto, sem cache (antes cairiam no "cache primeiro" e guardariam respostas de autenticação); (2) os 4 arquivos de `auth/` entram no pré-cache e o SDK é pré-carregado à parte (falha dele não quebra a instalação); (3) `CACHE_VERSION` 3 → 4, para o PWA instalado receber tudo. Se trocar a versão do SDK, altere a URL no `index.html` **e** no `sw.js`.

## 4. Configurar Supabase
- **Authentication > URL Configuration**: Site URL = endereço real do app. Redirect URLs = URL exata de retorno, com e sem `index.html`, ou `https://SEU-DOMINIO/crowfit/**`, mais `http://localhost:PORTA/**` para testes. O app usa a página atual (`origem + caminho`) como `redirectTo`.
- **Authentication > Providers > Email**: decida se "Confirm email" fica ligado (o app trata os dois casos). Em Password, mínimo de 8 caracteres.
- E-mails: o SMTP padrão do Supabase tem limite baixo de envios por hora. Para uso real, configure SMTP próprio.
- **Google**: siga a seção 6 do seu PDF. O callback no Google é `https://gqhcknwuqwudctanigyf.supabase.co/auth/v1/callback`; Client ID/Secret só no painel Supabase.

## 5. Decisões técnicas
- Fluxo `implicit` do SDK (não PKCE): links de confirmação e recuperação funcionam mesmo se abertos em outro navegador/app de e-mail. Troque para `'pkce'` em `auth.js` se preferir.
- Logout usa `scope: 'local'` (só este aparelho) e não apaga dados do app.
- SDK fixado em 2.45.4. Se quiser, adicione `integrity` (SRI) ao `<script>`.
- Se o SDK não carregar offline e já existiu login neste aparelho, o app é liberado; sem login prévio, aparece a tela de entrada com aviso de falta de conexão ao tentar entrar.

## 6. Checklist de testes (precisa ser feito por você)
Cadastro válido · e-mail já usado · senha fraca · login certo/errado · confirmação de e-mail · recuperação + nova senha · Google (login e cancelamento) · reload mantém sessão · logout · offline · PWA instalada · usuário novo (vai ao onboarding) · usuário com perfil local (vai à tela principal, dados intactos).

## Status honesto
Escrito e verificado em sintaxe; lógica de erros/sessão testada com cliente simulado. **Não testado contra o Supabase real nem no navegador** (sem acesso à rede aqui). Google OAuth só estará concluído após criar as credenciais e testar ponta a ponta. Fora do escopo: perfil, sincronização, migração de dados locais.
