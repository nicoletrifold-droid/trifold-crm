# Story 75-358 — A Nicole acusava de faltar à visita quem nunca teve visita: `no_show` era a etapa "Atendimento"

**Status:** InReview — testes/lint/type-check verdes · **com migration (236, em 2 POSTs)**
**Tipo:** Bug de dado/constante em produção (a etapa foi renomeada na UI e o código continuou apontando para ela)
**Epic:** 75 — CRM Trifold
**Complexidade:** S (~2 pts — 1 migration, 1 constante, 4 call-sites, 1 módulo puro + testes)
**Fluxo:** @sm → @po → @dev → @qa → @devops

## O sintoma relatado

20/08/2026, minutos depois de destravarmos o cron de follow-up (75-350…357). Marcos, olhando a
conversa do lead Amauri: *"ele repetiu 'temos 2 no momento'"*. Na varredura das conversas do dia
apareceu algo pior do que a duplicata: a Nicole abria a conversa **acusando o lead de ter furado uma
visita**.

Os **4 de 4** leads que responderam ao disparo das 11:00 receberam a mesma frase:

| hora | lead | `appointments` do lead | o que a Nicole disse |
|---|---|---|---|
| 11:01:27 | Melquiades | **0** | "Vi que a gente não conseguiu se encontrar antes…" |
| 11:01:36 | Cleonice | **0** | "…não conseguiu se encontrar da última vez" |
| 11:01:55 | Amauri | **0** | "…remarcar uma visita" |
| 11:03:34 | Maria Cristina | **0** | "não conseguimos nos encontrar **na visita que tínhamos combinado**" |

Nenhum dos quatro tem uma única linha em `appointments`. A visita não foi remarcada, cancelada ou
perdida: **ela nunca existiu**.

## A causa-raiz

`packages/shared/src/constants/stages.ts`:

```ts
no_show: "00000000-0000-0000-0001-000000000009",
```

Esse UUID nasceu No-Show de verdade — `supabase/migrations/011_noshow_stage.sql` o criou como
`'No-Show', 'no-show', 'no_show'`. Mas em **08/06/2026** a linha foi editada pela tela
Configurações → Pipeline. Estado atual em produção:

```
id    = 00000000-0000-0000-0001-000000000009
name  = 'Atendimento'      ← renomeada
slug  = 'no-show'          ← o slug ficou para trás e denuncia a troca
type  = 'novo'             ← deixou de ser no_show
position = 4
```

Nenhuma linha de `kanban_stages` tem `type = 'no_show'`: **o board não tem coluna No-Show**. E a
etapa que herdou o UUID é a maior do funil de atendimento — **129 leads** em 20/08.

Daí saem dois defeitos simétricos, os dois em produção:

1. `packages/ai/src/chat/pipeline.ts:720` injeta o `NO-SHOW CONTEXT` sempre que
   `leadStageId === STAGE_IDS.no_show`. Como esse ID é "Atendimento", o bloco entrava para
   **todo lead em Atendimento** — e o bloco manda, com todas as letras, a Nicole dizer *"Vi que nao
   conseguimos nos encontrar, quer marcar outro dia?"*.
2. `applyNoShowFeedback` (`visit-feedback-core.ts:312`) e o detector de 48h do cron
   (`followup/route.ts:972`) mandam o no-show **real** para esse mesmo ID. Quem faltou de verdade
   cai no balaio de Atendimento e fica indistinguível de um lead que nunca agendou nada.

### Por que estourou só agora

A renomeação é de 08/06 — 73 dias. Mas o contexto só vira frase quando alguém **conversa**, e o
follow-up estava morto: 29 dias por modelo descontinuado (75-350) e 20 dias sem entregar nada fora
da janela de 24h (75-353). Consertar o cron acordou 41 leads de Atendimento de uma vez, 4
responderam, e os 4 ouviram a acusação. **O bug não é novo; a testemunha é.**

## Decisão do Marcos (20/08)

Criar a coluna **No-Show** no board, entre "Visita Agendada" e "Visitou". Quem faltou volta a ser
visível para o comercial em vez de se dissolver nos 129 leads de Atendimento.

## AC1 — A etapa No-Show volta a existir, com UUID próprio

Migration `236`: insere a etapa `No-Show` (`type = 'no_show'`, posição entre Visita Agendada e
Visitou) com um **UUID novo**. A `…0009` **não é tocada** — ela é a "Atendimento" que 129 leads e
o `supremo-sync` usam hoje; mexer nela é que causou tudo isto.

O `slug` da `…0009` sai de `no-show` para `atendimento` no mesmo passo. Slug mentindo sobre o nome
é a pista que fez este bug demorar 73 dias para aparecer, e é `slug` que dá o conflito do
`ON CONFLICT (org_id, slug)` do seed.

## AC2 — A constante passa a ter nome de verdade para a `…0009`

`STAGE_IDS` ganha `atendimento` (a `…0009`), e `no_show` passa a apontar para a etapa nova. Os
call-sites que usavam `no_show` **querendo dizer "Atendimento"** passam a dizer isso:

| arquivo | antes | depois | por quê |
|---|---|---|---|
| `cron/supremo-sync/route.ts:27` | `11477: STAGE_IDS.no_show, // ATENDIMENTO` | `STAGE_IDS.atendimento` | o comentário já dizia ATENDIMENTO |
| `cron/supremo-sync/route.ts:40` | `"atendimento": STAGE_IDS.no_show` | `STAGE_IDS.atendimento` | idem |
| `visit-feedback-core.ts:75` | `NON_REGRESSION_STAGES` com `no_show` | `no_show` **e** `atendimento` | 🔥 sem `atendimento` na lista, lead em Atendimento pararia de avançar para "Visitou" ao receber feedback de visita — regressão silenciosa em cima do caminho mais usado |

`followup/route.ts:879` e `visit-feedback-core.ts:312` continuam escritos como estão: eles sempre
quiseram dizer no-show, e agora o `STAGE_IDS.no_show` finalmente é o no-show.

## AC3 — A Nicole passa a olhar o FATO, não a etapa

Etapa é um rótulo que qualquer pessoa renomeia numa tela — foi exatamente o que aconteceu. A prova
de que o lead faltou está em `appointments.status = 'no_show'`.

Novo módulo puro `packages/ai/src/flows/no-show-reengage.ts`:

> **O contexto de no-show só entra quando o agendamento MAIS RECENTE do lead está `no_show`.**

- Lead sem nenhum agendamento → **nunca** entra (mata os 4 casos de hoje).
- Lead que faltou e **remarcou** → o agendamento mais recente é o novo → não entra. A Nicole não
  oferece remarcar uma visita que já está na agenda.
- Lead que faltou e depois visitou → mais recente é `completed` → não entra.
- Lead que faltou e não voltou → entra, que é o caso que o bloco foi escrito para atender.

A etapa sai da decisão inteiramente: mesmo com o No-Show do AC1 no lugar, quem manda é o
agendamento. Se alguém renomear uma coluna outra vez, a Nicole não passa a mentir de novo.

## AC4 — Regressão coberta por teste

`no-show-reengage.test.ts` trava os quatro casos acima, mais o do dia:
`[]` de agendamentos → `false`. É o teste que teria pegado isto em 08/06.

## Fora de escopo (stories irmãs, mesma varredura)

- **75-359** — resposta duplicada: rajada de mensagens do lead abre um pipeline por webhook (34
  ocorrências em 30 dias). É o sintoma que o Marcos relatou primeiro.
- **75-360** — `leads.name` sobrescrito por texto qualquer ("Já Comprei", "Oii", "Morar").

## Dev Agent Record

**Branch:** `75-358-noshow-etapa-propria` (worktree `~/tmp_claude/wt-75-358`)

**File List**

| arquivo | o quê |
|---|---|
| `supabase/migrations/236_noshow_etapa_propria.sql` | novo — etapa No-Show (`…0011`), slug da `…0009` para `atendimento`, `ALTER TYPE` do enum |
| `packages/shared/src/constants/stages.ts` | `atendimento` (`…0009`) + `no_show` (`…0011`) |
| `packages/ai/src/flows/no-show-reengage.ts` | novo — decisão pura `deveReengajarNoShow()` |
| `packages/ai/src/flows/no-show-reengage.test.ts` | novo — 8 casos, começando pelo de 20/08 |
| `packages/ai/src/chat/pipeline.ts` | carrega `appointments`; `noShowContext` sai do fato; `leadStageId` e o import de `STAGE_IDS` morreram com a condição antiga |
| `packages/web/src/app/api/cron/supremo-sync/route.ts` | 2 mapeamentos ATENDIMENTO → `STAGE_IDS.atendimento` |
| `packages/web/src/lib/appointments/visit-feedback-core.ts` | `atendimento` entra em `NON_REGRESSION_STAGES` |

**Validações**

- `vitest run` — **235 arquivos, 2843 testes passando** (+8 novos), 6 expected-fail pré-existentes.
- `turbo type-check` — 8/8 tasks OK.
- `turbo lint` — **0 erros** (29 warnings, todos pré-existentes e em arquivos não tocados).
- Migration conferida **em produção dentro de transação REVERTIDA**: slug liberado, shift de posição
  e INSERT sem colisão; o board sai com No-Show na posição 7, entre Visita Agendada e Visitou.
  Rollback confirmado depois (`…0009` ainda com slug `no-show`, `Visitou` ainda em 7, sem linha `…0011`).
  Na validação o `type` foi `agendado` como placeholder — o valor `no_show` do enum não pode ser usado
  na mesma transação em que nasce.

**Pendente no deploy (@devops)**

1. `ALTER TYPE stage_type ADD VALUE IF NOT EXISTS 'no_show';` — POST sozinho.
2. Resto da migration 236 — POST seguinte.
3. Merge do PR.

Ordem importa: o código novo não depende da etapa `…0011` existir (a decisão é por `appointments`),
mas `applyNoShowFeedback` passa a escrever `…0011` — sem a linha no banco, a FK de `leads.stage_id`
recusaria o UPDATE. **Migration antes do merge.**

**Não incluído de propósito**

- Backfill de quem já está em Atendimento por ter faltado: não há como distinguir no banco quem caiu lá
  por no-show de quem sempre esteve — a etapa não guardava essa diferença, que é justamente o defeito.
  Daqui para a frente, `appointments.status='no_show'` responde. Se o comercial quiser a lista histórica,
  ela sai de `appointments` + `activities.type='appointment_no_show'`, não da etapa.
