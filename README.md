<div align="center">

<img src="icon-512.png" alt="Crowfit" width="140">

# CROWFIT

**Treino sem equipamento, um dia de cada vez.**
Receba um plano semanal sob medida, mantenha sua ofensiva e acumule pontos, como nos apps de idiomas, mas para flexões, agachamentos e abdominais.

[**Abrir o app**](https://virusdosol.github.io/crowfit/) · [Instalar no celular](#-instalar-no-celular) · [Seus dados](#-seus-dados)

![PWA](https://img.shields.io/badge/PWA-instalável-1a1a1a?style=flat-square)
![Offline](https://img.shields.io/badge/funciona-offline-444444?style=flat-square)
![Sem dependências](https://img.shields.io/badge/dependências-zero-ffb703?style=flat-square)
![Mobile first](https://img.shields.io/badge/mobile-first-1a1a1a?style=flat-square)

<img src="logo.png" alt="Crowfit" width="320">

</div>

---

## O que é

Um app de exercícios **sem nenhum equipamento**. Você responde algumas perguntas, o Crowfit monta a sua semana de treinos com dias de descanso, e o corvo te acompanha a cada sessão. Treinar todo dia previsto aumenta a **ofensiva**, e cada exercício feito rende **pontos**.

Foi pensado para o celular, para treinar em casa, no quarto ou no parque.

## Como o plano é montado

No primeiro acesso, o app pergunta nome, idade, peso, altura, experiência com exercícios e quantos dias por semana você quer treinar (de 3 a 6).

O **nível** (iniciante, intermediário ou avançado) vem da experiência e é reduzido em um grau para quem tem 55 anos ou mais, ou IMC a partir de 30. Ele define as repetições, os segundos e o número de séries.

| Dias por semana | Seg | Ter | Qua | Qui | Sex | Sáb | Dom |
|---|---|---|---|---|---|---|---|
| 3 | Corpo todo | Descanso | Pernas | Descanso | Peito e braços | Descanso | Descanso |
| 4 | Peito e braços | Pernas | Descanso | Abdômen | Corpo todo | Descanso | Descanso |
| 5 | Peito e braços | Pernas | Abdômen | Descanso | Corpo todo | Peito e braços | Descanso |
| 6 | Peito e braços | Pernas | Abdômen | Corpo todo | Peito e braços | Pernas | Descanso |

## Funcionalidades

**Treino guiado**
- Um exercício por tela, com meta (repetições ou segundos) e dica de execução.
- Cronômetro nos exercícios por tempo, como prancha e agachamento na parede.
- Marcar como concluído ou pular o exercício.
- Aquecimento no início e alongamento no fim de cada sessão.

**Ofensiva**
- Sobe a cada dia de treino concluído.
- Os dias de descanso previstos no seu plano **não quebram** a ofensiva.
- Perder um dia de treino previsto zera a contagem.

**Pontos e níveis**
- 10 pontos por exercício concluído.
- 20 pontos de bônus por completar o treino do dia.
- Um nível novo a cada 200 pontos, com barra de progresso.

**Semana**
- Visão dos sete dias: concluído, hoje, não realizado, em breve e descanso.
- Contador de treinos da semana (por exemplo, 2 de 4).

**Exercícios**
- Flexão (com joelhos, tradicional, diamante e pike), mergulho em cadeira firme.
- Agachamento, afundo, ponte de glúteos, agachamento na parede, panturrilha.
- Abdominal, prancha, bicicleta, elevação de pernas, escalador.
- Polichinelo, burpee e alongamento.

**Aparência**
- Tema claro e escuro automático.
- Mascote corvo preto e identidade própria.

## 📲 Instalar no celular

1. Abra **https://virusdosol.github.io/crowfit/** no **Chrome** (Android) ou no **Safari** (iPhone).
2. Toque em **Instalar app** (Chrome) ou em **Compartilhar > Adicionar à Tela de Início** (Safari).
3. Abra pelo ícone novo. Depois do primeiro acesso, funciona offline.

## 💾 Seus dados

- Tudo fica **salvo no próprio aparelho**, no armazenamento do navegador. Nada é enviado para servidores.
- Limpar os dados do navegador ou desinstalar o app **apaga o seu progresso** (pontos, ofensiva e treinos feitos).
- Ainda não há backup nem sincronização entre aparelhos.
- Para refazer o plano, use **Refazer perfil e plano** no fim da tela inicial. Pontos e ofensiva são mantidos.

## 🛠 Para quem quer mexer no código

É um app de **um único arquivo** (`index.html`), em HTML, CSS e JavaScript puro, sem build e sem dependências. Os arquivos ficam todos na mesma pasta, sem subpastas.

```
crowfit/
├── index.html              # o app inteiro
├── manifest.json           # nome, cores e ícones do PWA
├── sw.js                   # service worker (cache offline)
├── mascot.png              # o corvo mascote
├── logo.png                # nome Crowfit em letras
├── icon-180.png            # ícone do iPhone
├── icon-192.png
├── icon-512.png
└── icon-maskable-512.png   # ícone adaptável do Android
```

Para rodar localmente, sirva a pasta com qualquer servidor estático (por exemplo `python3 -m http.server`) e abra `http://localhost:8000`. O service worker só funciona em `localhost` ou `https`.

Para publicar a sua cópia: faça um fork, vá em **Settings > Pages**, escolha a branch `main` e a pasta `/ (root)`.

**Atualizando o app:** depois de mudar um arquivo, troque `crowfit-v1` por `crowfit-v2` no `sw.js`. Assim os celulares baixam a versão nova.

Os exercícios, as sessões e os padrões semanais ficam nos objetos `EX`, `SES` e `PAT` dentro do `index.html`.

## Ainda não tem

- Ilustrações ou vídeos dos exercícios.
- Descanso entre as séries.
- Conquistas, ligas e amigos.
- Lembretes diários.
- Backup e sincronização entre aparelhos.
- Contas de usuário.

Sugestões e contribuições são bem-vindas: abra uma *issue* ou um *pull request*.

## Observações

- O Crowfit não substitui orientação médica nem de um profissional de educação física. Se você tem alguma condição de saúde, converse com um profissional antes de começar.
- Respeite o seu corpo: se algo doer, pare ou pule o exercício.

---

<div align="center">

Feito por **virusdosol** para quem quer treinar em qualquer lugar, sem desculpa e sem equipamento.

</div>
