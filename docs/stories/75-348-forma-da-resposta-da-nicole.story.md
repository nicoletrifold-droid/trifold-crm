# Story 75-348 — A forma da resposta da Nicole: abertura que varia, uma ideia por mensagem, e nenhuma promessa que ninguém cumpre

**Status:** InReview — gate PASS · prompts de produção aplicados em 19/08 · divisão em blocos DESLIGADA
**Tipo:** Prompt (painel) + 1 ajuste de envio
**Epic:** 75 — CRM Trifold
**Complexidade:** S/M (~3 pts — 2 prompts no painel, 1 arquivo de código, 0 migrations)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Migrations:** nenhuma.

## O pedido (Marcos, 19/08)

> *"Ela tá sempre repetindo a mesma frase, não tô sentindo inteligência artificial aí. Fora que se
> observar, ser um pouco mais sucinto e até dividir as respostas em bloco talvez agrade mais o lead."*

Três prints, três leads diferentes, o mesmo esqueleto: elogia o interesse → despeja "67m², 2 suítes,
sacada com churrasqueira a carvão" → pergunta o nome.

## O defeito, em uma frase

**A repetição não é falta de criatividade do modelo: é o prompt prescrevendo uma sequência fixa.** Os
três leads chegaram com a MESMA mensagem template do Meta ("Tenho interesse no VIND Residence…"),
histórico vazio, prompt igual — e o `system-personality` de produção **não tem uma linha pedindo
variação de abertura** (o "varie suas respostas" existe só no lembrete final genérico do código, e é
tarde demais: a estrutura da mensagem já foi decidida pelas seções anteriores).

Dois agravantes medidos na leitura do código:

1. **Teto de tamanho conflitante.** O prompt de produção autoriza "3-4 frases"; o lembrete final do
   código pede "2-3". Ela usa o teto dos dois.
2. **O guardrail manda prometer um retorno que não existe.** `RN8` e `RN9` (slug `guardrails`) mandam
   dizer *"deixa eu confirmar com a equipe técnica e já te retorno, combinado?"*. Esse retorno não
   existe: nenhum cron, alerta ou tarefa nasce dessa frase. A 75-268 matou a frase **só para agenda** —
   para dúvida técnica ela segue viva, e é o mesmo incidente de 03/08 esperando repetir.

## AC1 — Playbook de abertura: o mesmo template do Meta não gera a mesma frase

No slug `system-personality`, uma seção nova de ABERTURA com 4 ângulos e a regra de escolha:

> Nunca abra duas conversas do mesmo jeito. Escolha o ângulo pelo que você SABE do lead
> (empreendimento, campanha, finalidade quando houver) — e, quando não souber nada, escolha um
> ângulo diferente do óbvio:
> (a) o ângulo do que ele pediu ("você chegou pelo Vind — o que te chamou atenção nele?");
> (b) o ângulo do momento ("tá procurando pra quando?");
> (c) o ângulo da pessoa ("é pra você ou pra família?");
> (d) o ângulo do ponto forte ÚNICO, uma característica só, nunca a lista.
> **Proibido despejar ficha técnica na primeira mensagem** (metragem + suítes + sacada + lazer). Uma
> característica basta para criar curiosidade — é a estratégia que já está escrita aqui: informe o
> suficiente para gerar curiosidade, nunca o bastante para decidir sem visitar.

Editar no painel (`/dashboard/configuracoes/personalidade`) e regravar o espelho no mesmo PR:
`npx tsx scripts/dump-agent-prompts.ts --write`.

> A 75-347 reforça esta AC de graça: sabendo a finalidade, o conteúdo muda por lead, e a variação
> deixa de depender de sinônimo.

## AC2 — Uma ideia + uma pergunta, teto único

Um teto só, nos dois lugares: **2 parágrafos curtos**, 1-2 frases cada, **uma** pergunta, no fim.
O prompt de produção passa a dizer o mesmo que o lembrete final do código — hoje eles divergem
(3-4 × 2-3) e ela obedece ao maior.

## AC3 — Nenhuma promessa de retorno que ninguém cumpre

`RN8`/`RN9` param de mandar prometer retorno. A resposta honesta para o que ela não sabe **entrega algo
agora**:

> Não invente e **não prometa retorno**: você não tem como voltar depois. Diga que esse detalhe quem
> fecha é o corretor/a equipe técnica e ofereça o caminho concreto no mesmo turno — falar com o
> corretor agora ou conhecer na sede. Nunca "já te retorno", "deixa eu confirmar e te aviso",
> "combinado?".

Vale para preço de unidade e detalhe técnico. Para **agenda** a proibição já existe (75-268) e não é
tocada aqui.

## AC4 — Convite à visita depois da qualificação, não antes

O `visit-scheduling` já exige sondar interesse antes de perguntar dia/horário (ETAPA 1). O que falta é
o piso: **não convidar antes de saber finalidade e prazo**. Medido em produção (90 dias): a Nicole
conversou com **314 leads** e virou **8 visitas** próprias (~10% dos leads dela têm qualquer visita) —
o convite em toda mensagem não está produzindo agenda, está produzindo "sim" de educação. E o
no-show de quem o sistema chama de quente é **63,6%**, pior que o dos frios (52,2%).

Uma linha no `visit-scheduling`, sem tocar nas REGRAS CRÍTICAS nem na VERDADE DO HORÁRIO:

> Antes da ETAPA 1, você precisa saber **finalidade** e **prazo**. Sem isso, pergunte — não convide.
> Um "sim" de educação vira falta na agenda do corretor.

## AC5 — Resposta em dois blocos (opcional, atrás de flag)

Hoje sai **uma** mensagem de WhatsApp por turno (`webhook/whatsapp/route.ts:1057-1071`); o que parece
"bloco" são parágrafos na mesma bolha. Dividir em duas mensagens (contexto e depois a pergunta) com o
delay humano que já existe (`calculateTypingDelay`) é o que aproxima do jeito humano de escrever.

Requisitos: **máximo 2 mensagens**, ordem garantida (envio sequencial, nunca paralelo), a pergunta
sempre no último bloco, e **nunca** dividir confirmação de agendamento (dia/horário viajam juntos —
75-245). Atrás de flag de ambiente para rollback sem redeploy de código, e **desligada por padrão**
nesta story: primeiro medimos o efeito de AC1-AC4 isolado, senão não sabemos o que funcionou.

## AC6 — Teste puro do divisor

O divisor de blocos é função pura (entra texto, sai `string[]`), testada sem DOM: nunca mais de 2,
nunca divide bloco com `[SISTEMA]`, nunca separa a pergunta do fim, texto curto sai inteiro.

## Dev Agent Record

- [x] **AC1** — `system-personality`: seção ABERTURA — NUNCA A MESMA, 4 ângulos, proibição de despejar
      ficha técnica na primeira mensagem. 2.477 → 3.602 chars.
- [x] **AC2** — teto único (2 parágrafos, 1 pergunta, uma ideia) no banco **e** no fallback do código.
- [x] **AC3** — RN8/RN9 sem promessa de retorno + **a autorização explícita no `visit-scheduling` foi
      revogada** ("vale SO para preço de unidade, detalhe técnico de obra"). Sem isso, um slug
      desmentiria o outro e a story não pegaria.
- [x] **AC4** — ETAPA 0 no `visit-scheduling`: sem finalidade e prazo, pergunta em vez de convidar.
- [x] **AC5** — `dividirResposta` + envio sequencial atrás de `NICOLE_RESPOSTA_EM_BLOCOS`, desligada.
- [x] **AC6** — 12 casos, sem DOM, a maioria NEGATIVOS (o que não pode ser dividido).

### Decisões de implementação

- **A maior parte do teste do divisor é negativa.** Um teste que só verificasse "divide em dois"
  ficaria verde com uma função que parte confirmação de visita no meio — a falha da 75-245. Então:
  confirmação de agenda, marcação `[SISTEMA]` vazada, pergunta fora do fim e texto curto **saem
  inteiros**, cada um com caso próprio.
- **Envio sequencial, nunca `Promise.all`.** Paralelo entregaria a pergunta antes do contexto.
- **O teto de 160 caracteres** é a régua de "isso já é curto" (tamanho de um SMS). A fixture do teste
  é o texto REAL do print de 19/08 — foi ele que revelou que minha primeira fixture ficava abaixo do
  teto e o teste nasceria mentindo.
- **A flag desligada é decisão de medição, não dúvida técnica** (ver C1/C2 no gate).

### Validações

`npx vitest run` 225 arquivos / **2.766 testes** ✅ · `type-check` 8/8 ✅ · `lint` 0 erros ✅ ·
`turbo run build --force` exit 0 ✅ · `dump-agent-prompts --check` exit 0 ✅

## File List

- `packages/ai/src/prompts/_production/system-personality.txt` — AC1/AC2 *(gerado)*
- `packages/ai/src/prompts/_production/guardrails.txt` — AC3 *(gerado)*
- `packages/ai/src/prompts/_production/visit-scheduling.txt` — AC4 *(gerado)*
- `packages/ai/src/prompts/_production/manifest.json` — *(gerado)*
- `packages/ai/src/prompts/personality.ts` · `guardrails.ts` — AC2/AC3 no **fallback** de bootstrap (para o código não contradizer o banco)
- `packages/web/src/lib/whatsapp/split-response.ts` *(novo)* + `split-response.test.ts` *(novo)* — AC5/AC6
- `packages/ai/src/prompts/visit-scheduling.ts` — AC3 no fallback (a autorização revogada)
- `packages/ai/src/chat/pipeline-corretor-no-historico.test.ts` — hash-ouro (+695 nos dois cenários)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — AC5
- `docs/qa/gates/75-348-forma-da-resposta.yml` *(novo)*

## Verificar depois do deploy

- Disparar 3 leads de teste com o **mesmo** template do Meta: três aberturas diferentes, nenhuma com
  ficha técnica despejada.
- Perguntar "qual o piso do banheiro?" → resposta sem "já te retorno", com caminho concreto.
- Perguntar preço → RN4 segue valendo (nada de R$ por unidade).
- Confirmar um agendamento → dia e horário na MESMA mensagem.
- `agent_prompts` conferido: `npx tsx scripts/dump-agent-prompts.ts --check` sai 0.

Relacionado: 75-347 (finalidade — reforça a AC1) · 75-268 (promessa de retorno na agenda) ·
75-245 (verdade do horário) · 75-156 (delay humano / digitando) · 87-0 (painel é a fonte da verdade)
