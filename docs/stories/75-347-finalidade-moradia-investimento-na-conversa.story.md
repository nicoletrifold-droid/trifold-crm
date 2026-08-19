# Story 75-347 — A finalidade (moradia × investimento) entra na conversa: perguntar, ler e pesar

**Status:** Done — gate PASS · **PR #458 mergeado em 19/08** (squash) · deploy de produção `success`
**Tipo:** Qualificação da Nicole (dado que existe e ninguém usa) + correção da régua de calor
**Epic:** 75 — CRM Trifold
**Complexidade:** M (~5 pts — 2 prompts no painel, 3 arquivos de código, 0 migrations)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Migrations:** **nenhuma** — `leads.finalidade` já existe (migration 154, CHECK `moradia|investimento|ambos`).

## O pedido (Marcos, 19/08)

> *"Ela entender um pouco mais a necessidade do lead, se é moradia ou investimento, ajuda muito até
> no filtro dela em saber se realmente o lead é quente ou só está aceitando visita pq ela tem
> forçado. Tivemos muitos no-show."*

## O defeito, em uma frase

**O campo existe, ninguém pergunta, ninguém lê e ninguém pesa.** `leads.finalidade`
(`moradia|investimento|ambos`) é preenchido só pelo formulário do Meta (75-114) e à mão. A Nicole
não pergunta (a finalidade não está na lista de 9 itens do `qualification-flow` de produção — o item 3
já é "número de quartos"), não recebe o valor quando ele existe (`buildLeadContext`, `pipeline.ts:1963`,
injeta apenas nome, fonte, campanha, UTM e status) e a finalidade não vale um ponto na régua de calor
(`SCORE_WEIGHTS`, `flows/qualification.ts:16-26`). É por isso que a Thielly pergunta na mão
*"seria pra moradia ou investimento?"* depois de a Nicole já ter conversado.

## Efeito medido em PRODUÇÃO ANTES de escrever código

Management API sobre `dsopqkqjkmhytudaaolv`, janela de 90 dias, medido em 19/08.

### 1. O no-show é da casa, não da Nicole

| Visita criada por | Total | Compareceu | No-show | Cancelada | % no-show |
|---|---|---|---|---|---|
| `broker` | 49 | 19 | 17 | 13 | **47,2%** |
| `admin` | 22 | 5 | 12 | 4 | **70,6%** |
| `nicole` | 6 | 2 | 3 | 1 | 60,0% (n=6, sem valor estatístico) |

**55% de no-show no agregado** (32 de 58 com desfecho). A hipótese "a Nicole força e enche a agenda
de no-show" **não se sustenta pela atribuição**: ela cria pouquíssimas visitas. O que ela faz é
esquentar o lead que depois é agendado por humano — e é aí que a qualificação fraca cobra o preço.

### 2. Ela empurra a visita e converte 10%

| Medida (90 dias) | Valor |
|---|---|
| Leads que conversaram com a Nicole | 314 |
| Visitas criadas por ela (`created_by='nicole'`) | 8 |
| Leads dela com **qualquer** visita registrada | 31 (~10%) |

O convite em toda mensagem não está virando agenda. Insistir mais não é o caminho — **qualificar antes
de convidar** é.

### 3. A régua de calor não prevê nada — o "quente" é o PIOR

| Calor do lead na hora da visita | Visitas | Compareceu | No-show | % no-show |
|---|---|---|---|---|
| `cold` | 27 | 11 | 12 | 52,2% |
| `warm` | 25 | 7 | 9 | 56,3% |
| **`hot`** | 16 | 4 | 7 | **63,6%** |

A ordem está **invertida**: quem o sistema chama de quente falta mais. Motivo, medido em 303 conversas:
**34 leads estão `hot` hoje e 28 deles (82%) só são `hot` por causa dos 20 pontos de "aceitou visita"** —
sem esse peso, cairiam abaixo de 70. O sistema chama de quente quem aceitou marcar. É literalmente a
máquina de no-show.

### 4. A finalidade está vazia em 83% dos leads

| Leads criados em 90 dias | 1.826 |
|---|---|
| Com `finalidade` preenchida | 311 (17%) |
| **Sem `finalidade`** | **1.515 (83%)** |

Nas conversas da Nicole é pior: 22 de 303 (7%). Não é campo morto — é campo que só o formulário do
Meta alimenta.

### 5. Simulação da nova régua (dados reais, 303 conversas)

Pesos novos: `visit_availability` **20 → 10** e `finalidade` **+10**.

| | Hoje | Depois | Diferença |
|---|---|---|---|
| `hot` | 34 | 24 | **11 saem, 1 entra** |
| `warm` | 68 | 82 | +14 |

Mudança contida e honesta: os 11 que saem eram quentes **só** por terem aceitado uma visita. Ninguém
perde acesso a nada — muda o badge e o gatilho de handoff.

## AC1 — A Nicole PERGUNTA a finalidade, e cedo

No slug `qualification-flow` (painel `/dashboard/configuracoes/personalidade`), a finalidade entra
como **item 2**, logo depois do nome e **antes** de qualquer ficha técnica (quartos/andar/vista):

> **2. Finalidade — moradia ou investimento** — a pergunta que muda TODA a conversa.
> *"Você está buscando pra morar ou pensando mais como investimento?"*
> Pergunte ANTES de apresentar metragem, plantas e diferenciais. A resposta define o ângulo:
> **moradia** → rotina, churrasco no fim de semana, escola/mercado perto, entrega;
> **investimento** → valorização até a entrega, perfil de locação, ticket de entrada, momento de compra.
> Nunca pergunte se a informação já vier no `<lead_context>`.

Editar **pelo painel** (fonte da verdade — decisão D-87-0-a) e regravar o espelho no mesmo PR:
`npx tsx scripts/dump-agent-prompts.ts --write`. **Nunca** rodar `scripts/seed-prompts.ts`.

## AC2 — A Nicole LÊ a finalidade que já existe

`buildLeadContext` (`pipeline.ts:1963`) passa a injetar `finalidade` (e `prazo_compra`, quando houver)
no bloco `<lead_context>`, com a regra correspondente em `PERSONALIZATION RULES`:

> 4. Se a FINALIDADE está preenchida acima, **não pergunte de novo** — use o ângulo dela.

Sem isso, a Nicole repergunta o que o formulário do Meta já respondeu (311 leads hoje) — o mesmo
defeito que irrita o lead e já está proibido na regra 7 do lembrete final.

## AC3 — A resposta do lead vira dado

`extractCollectedData` (`flows/qualification.ts:129`) passa a extrair `finalidade` por palavra-chave
(`morar`, `moradia`, `pra mim`, `minha família` → `moradia`; `investir`, `investimento`, `alugar`,
`locação`, `renda` → `investimento`; sinais dos dois → `ambos`), e o sync `collected_data → lead`
(`pipeline.ts:1397-1409`) grava em `leads.finalidade`.

🔥 **FAIL-CLOSED obrigatório: extrair SOMENTE com `origem: "lead"`.** A pergunta da própria Nicole
contém as duas palavras — extrair da fala dela reproduziria exatamente o veneno da 87-4 (10 de 13
`visit_availability` inspecionados em 07/08 eram fala dela).

E **não sobrescrever** valor já existente: o que veio do Meta ou foi digitado por humano manda
(mesma regra da 75-114, `process-lead.ts:270`).

## AC4 — A finalidade pesa, e "aceitou visita" deixa de decidir sozinha

Em `SCORE_WEIGHTS`: `visit_availability` **20 → 10**, `finalidade` **= 10**. Soma segue 100.

Um teste congela (a) a soma dos pesos, (b) os cortes 70/40 e (c) o caso que motivou a story:
**lead que só aceitou visita não chega a `hot`**.

⚠️ **Risco declarado:** o score alimenta `shouldHandoff` (score ≥ 70 + pergunta de preço). O efeito
está medido acima (11 leads mudam de faixa). O corretor continua mandando no calor
(`stripManualInterestLevel`, 75-237).

## AC5 — A régua de calor volta a ter UMA fonte

`pipeline.ts:1412` reproduz a régua à mão (`updatedScore >= 70 ? "hot" : updatedScore >= 40 ? "warm" : "cold"`)
em vez de importar `interestLevelFromScore` — a 75-332 unificou dois caminhos e **deixou de fora o
principal**, o da própria Nicole. Trocar pela função. É subtração, não comportamento novo: os números
são idênticos hoje, e a próxima recalibração para de divergir por caminho.

## AC6 — A apresentação segue o ângulo da finalidade

No slug `property-presentation`, uma seção curta: com `finalidade = investimento`, abrir por
valorização/locação/ticket de entrada e **não** por churrasqueira; com `moradia`, o inverso. Sem
finalidade conhecida, **não presumir** — perguntar (AC1).

## AC7 — Testes puros, sem DOM

Projeto não tem teste de componente (jsdom ausente): a decisão vira função pura e é testada sem DOM.
Cobrir: extração por origem (lead × assistant), não-sobrescrita, pesos/cortes, e `<lead_context>` com
e sem finalidade.

## Dev Agent Record

- [x] **AC1** — `qualification-flow` em produção: finalidade como **item 2**, itens 2-9 renumerados
      para 3-10, e a regra "a FINALIDADE vem primeiro" no bloco de regras. 2.458 → 3.222 chars.
- [x] **AC2** — `buildLeadContext` injeta `Finalidade:` e `Prazo de compra:` com rótulo legível
      (`ate_3m` → "até 3 meses"; mandar o enum cru para o modelo é ruído) + regras 4 e 5 de
      não-repergunta.
- [x] **AC3** — extração por palavra-chave **só com `origem: "lead"`** + sync que **não sobrescreve**
      finalidade existente (Meta/humano manda).
- [x] **AC4** — `visit_availability` 20 → 10 · `finalidade` = 10 · soma 100 congelada em teste.
- [x] **AC5** — `pipeline.ts` importa `interestLevelFromScore` (era a 3ª cópia à mão dos cortes).
- [x] **AC6** — `property-presentation`: seção ANGULO PELA FINALIDADE. 4.526 → 5.266 chars.
- [x] **AC7** — 16 casos novos em 2 arquivos, sem DOM.

### Decisões de implementação

- **A extração é fail-closed por origem, e isso não é preciosismo.** A pergunta da Nicole ("pra morar
  ou como investimento?") contém as DUAS palavras: extrair da fala dela carimbaria a finalidade a
  partir da pergunta. É o veneno da 87-4 com outro nome.
- **Os 4 goldens que mudaram, mudaram porque a régua mudou** — e o repo tinha tripwires em quatro
  lugares, o que é bom sinal: `qualification.test.ts` (scores e ordem), `pipeline-agenda-state`
  (score_antes 30→20), `pipeline-corretor-no-historico` (hash do system prompt) e
  `enrich-leads/route.test.ts` (o cron responde a MESMA régua). Cada um recebeu o número novo **com o
  motivo escrito ao lado**, nunca um número trocado no susto.
- **Sem backfill.** O recálculo acontece no próximo turno de cada conversa. Reprocessar as 303
  conversas mudaria badge de lead que ninguém está atendendo.
- **Prompt aplicado por Management API** (decisão do Marcos, 19/08) + `dump-agent-prompts --write` no
  mesmo PR. `--check` sai 0.

### Validações

`npx vitest run` 224 arquivos / **2.754 testes** ✅ · `type-check` 8/8 ✅ · `lint` 0 erros
(2 warnings pré-existentes) ✅ · `build` OK ✅ · `dump-agent-prompts --check` exit 0 ✅

**Mutação medida:** desligar a injeção do `<lead_context>` + remover a guarda de não-sobrescrita
derruba **3 de 6** testes de fiação (rodado vermelho e restaurado).

## File List

- `packages/ai/src/flows/qualification.ts` — AC3 (extração), AC4 (pesos) + testes
- `packages/ai/src/chat/pipeline.ts` — AC2 (`buildLeadContext`), AC3 (sync), AC5 (`interestLevelFromScore`)
- `packages/ai/src/prompts/_production/qualification-flow.txt` — AC1 *(gerado pelo dump)*
- `packages/ai/src/prompts/_production/property-presentation.txt` — AC6 *(gerado pelo dump)*
- `packages/ai/src/prompts/_production/manifest.json` — *(gerado pelo dump)*
- `packages/ai/src/flows/finalidade.test.ts` *(novo)* — AC3/AC4/AC7
- `packages/ai/src/chat/pipeline-finalidade-no-contexto.test.ts` *(novo)* — AC2/AC3/AC7
- `packages/ai/src/flows/qualification.test.ts` · `packages/ai/src/chat/pipeline-agenda-state.test.ts` ·
  `packages/ai/src/chat/pipeline-corretor-no-historico.test.ts` ·
  `packages/web/src/app/api/cron/enrich-leads/route.test.ts` — goldens da régua nova
- `docs/qa/gates/75-347-finalidade-na-conversa.yml` *(novo)*

> Os `.txt` de `_production/` são **espelho gerado**. A edição é no painel; o dump entra no mesmo PR.

## Verificar depois do deploy

- Lead novo do Meta **com** finalidade: a Nicole **não** pergunta de novo e abre pelo ângulo certo.
- Lead novo **sem** finalidade: ela pergunta na 2ª rodada, antes de metragem/plantas.
- Responder "quero investir" e conferir `leads.finalidade = investimento` na ficha.
- A Nicole perguntar "é pra morar ou investir?" e o lead **não** responder → `finalidade` segue **nula**
  (prova do fail-closed da AC3).
- Um lead que só aceitou visita: conferir que **não** aparece como `hot`.

Relacionado: 75-114 (finalidade do form do Meta) · 87-4 (fato de agenda exige fala do lead) ·
75-332 (régua única de calor) · 75-237 (calor manual manda) · 75-348 (a forma da resposta) ·
75-268 (guarda aplicada a um caminho só)
