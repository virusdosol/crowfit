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

O **nível** (iniciante, intermediário ou avançado) parte da experiência declarada e define repetições, segundos e séries. Depois ele se ajusta pelo seu retorno ao fim de cada treino: "Foi difícil" reduz o nível na hora; "Foi fácil" só aumenta depois de 3 treinos fáceis seguidos. Idade e IMC não decidem o seu nível.

| Dias por semana | Seg | Ter | Qua | Qui | Sex | Sáb | Dom |
|---|---|---|---|---|---|---|---|
| 3 | Corpo todo | Descanso | Pernas | Descanso | Peito e braços | Descanso | Descanso |
| 4 | Peito e braços | Pernas | Descanso | Abdômen | Corpo todo | Descanso | Descanso |
| 5 | Peito e braços | Pernas | Abdômen | Descanso | Corpo todo | Peito e braços | Descanso |
| 6 | Peito e braços | Pernas | Abdômen | Corpo todo | Peito e braços | Pernas | Descanso |

## Funcionalidades

**Treino guiado**
- Um exercício por tela, com séries individuais ("Série 2 de 3") e dica de execução.
- Exercícios por tempo (prancha, agachamento na parede) com cronômetro que pausa e retoma; a série só conclui quando o tempo acaba.
- Descanso entre séries, que pode ser iniciado, pausado ou pulado.
- Treino interrompido fica salvo e pode ser retomado depois (cronômetros voltam pausados).
- Aquecimento e alongamento são opcionais; todos os outros exercícios são obrigatórios para o bônus.

**Ofensiva**
- Sobe a cada dia com treino completo.
- Os descansos previstos no plano **não quebram** a ofensiva, usando o plano que valia em cada data. Trocar a frequência não reescreve o passado.
- Perder um dia de treino previsto zera a contagem. A **melhor ofensiva** fica sempre visível.

**Pontos e níveis**
- 10 pontos por exercício concluído (todas as séries feitas). Pular ou só iniciar não rende pontos.
- 20 pontos de bônus quando todos os exercícios obrigatórios são concluídos.
- Repetir o treino no mesmo dia é permitido (sessão extra), mas não repete pontos nem bônus. Cada recompensa só é concedida uma vez.
- Um nível novo a cada 200 pontos, com barra de progresso.
- Como tudo fica no aparelho, a pontuação garante consistência, não é um sistema antifraude.

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
- Se a gravação falhar (por exemplo, armazenamento cheio), o app mostra um aviso fixo "Alterações NÃO salvas".
- Se os dados salvos estiverem corrompidos, o app **não os apaga**: mostra uma tela de recuperação e guarda uma cópia.
- Limpar os dados do navegador ou desinstalar o app **apaga o seu progresso**.
- Faça backup em **Exportar backup** (arquivo `.json`) na tela inicial e restaure em **Importar backup**, inclusive em outro aparelho. A importação valida o arquivo antes de trocar os dados.
- Para refazer o plano, use **Refazer perfil e plano**. Pontos, histórico e ofensiva são mantidos.

## 🛠 Para quem quer mexer no código

É um app em HTML, CSS e JavaScript puro, sem build e sem dependências. Os arquivos do app ficam todos na mesma pasta; só os testes ficam em `tests/`.

```
crowfit/
├── index.html              # telas e estilo
├── core.js                 # regras (validação, pontos, séries, ofensiva)
├── manifest.json           # nome, cores e ícones do PWA
├── sw.js                   # service worker (cache offline)
├── mascot.png              # o corvo mascote
├── logo.png                # nome Crowfit em letras
├── icon-180.png            # ícone do iPhone
├── icon-192.png
├── icon-512.png
├── icon-maskable-512.png   # ícone adaptável do Android
└── tests/
    └── core.test.js        # testes automatizados
```

Para rodar localmente, sirva a pasta com qualquer servidor estático (por exemplo `python3 -m http.server`) e abra `http://localhost:8000`. O service worker só funciona em `localhost` ou `https`.

Para publicar a sua cópia: faça um fork, vá em **Settings > Pages**, escolha a branch `main` e a pasta `/ (root)`.

**Testes:** com o Node.js 18 ou mais novo, rode `node --test tests/core.test.js`. Não há nada para instalar.

**Atualizando o app:** depois de mudar um arquivo, aumente `CACHE_VERSION` no `sw.js`. O service worker usa a rede primeiro para HTML, JS e JSON, então a versão nova chega assim que houver conexão. Ele só apaga caches que começam com `crowfit-cache-`.

Os exercícios e as sessões ficam nos objetos `EX` e `SES` dentro do `index.html`. Os padrões semanais (`PAT`) ficam no `core.js`.

## Ainda não tem

- Ilustrações ou vídeos dos exercícios.
- Conquistas, ligas e amigos.
- Lembretes diários.
- Sincronização entre aparelhos.
- Tela de histórico de sessões (os dados já são gravados).
- Contas de usuário.

Sugestões e contribuições são bem-vindas: abra uma *issue* ou um *pull request*.

## Observações

- O Crowfit não substitui orientação médica nem de um profissional de educação física. Se você tem alguma condição de saúde, converse com um profissional antes de começar.
- Respeite o seu corpo: se algo doer, pare ou pule o exercício.

---

<div align="center">

Feito por **virusdosol** para quem quer treinar em qualquer lugar, sem desculpa e sem equipamento.

</div>
