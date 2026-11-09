# 🐦‍⬛ Crowfit

App de treinos **sem equipamento** inspirado no Duolingo, com ofensivas, pontos e níveis. O mascote é um corvo preto. Funciona no celular como um app instalado (PWA) e também offline.

## O que o app faz

- Pergunta nome, idade, peso, altura, experiência e dias de treino por semana (3 a 6)
- Monta um plano semanal completo, com dias de descanso
- Ajusta as repetições ao seu nível
- Guia o treino um exercício por vez, com dicas e cronômetro
- Conta a ofensiva (dias seguidos; os descansos previstos não quebram a ofensiva)
- Dá pontos (10 por exercício, 20 de bônus por treino completo) e sobe de nível a cada 200 pontos
- Tem tema claro e escuro automático
- Salva tudo no próprio navegador do aparelho

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | O app inteiro (telas, estilo e lógica) |
| `manifest.json` | Nome, cores e ícones do app instalado |
| `sw.js` | Faz o app funcionar offline |
| `mascot.png` | O corvo mascote |
| `logo.png` | Nome Crowfit em letras |
| `icon-180.png` | Ícone para iPhone |
| `icon-192.png`, `icon-512.png` | Ícones para Android |
| `icon-maskable-512.png` | Ícone adaptável do Android |

Todos ficam na mesma pasta, sem subpastas.

## Como publicar (sem instalar nada)

1. Entre em [github.com](https://github.com) e clique em **New repository**.
2. Dê o nome `crowfit`, deixe **Public** e clique em **Create repository**.
3. Clique em **uploading an existing file**.
4. Envie **todos os arquivos desta lista** (não o zip), clique em **Commit changes**.
5. Vá em **Settings → Pages**. Em **Source**, escolha **Deploy from a branch**, depois `main` e `/ (root)`, e clique em **Save**.
6. Em 1 a 2 minutos o GitHub mostra o link do app.

## Como instalar no celular

- **Android (Chrome):** abra o link, toque nos três pontinhos e escolha **Instalar app** ou **Adicionar à tela inicial**.
- **iPhone (Safari):** abra o link, toque em **Compartilhar** e escolha **Adicionar à Tela de Início**.

## Atualizando o app

Depois de trocar um arquivo no GitHub, mude o número em `sw.js` (`crowfit-v1` para `crowfit-v2`, e assim por diante). Isso faz os celulares baixarem a versão nova.

## Próximos passos

- Ilustrações ou vídeos dos exercícios
- Descanso entre séries
- Conquistas e ligas
- Lembretes diários
- Contas de usuário e banco de dados

## Licença

MIT
