# Story 75-275 — Espelho da agenda no Google Calendar (HOUSE + IMOB)

**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** M (~5 pts)

**CodeRabbit Integration:** Disabled (`coderabbit_integration` ausente do `core-config.yaml`).

---

## Story

Como **equipe de apoio (copa)**, quero ver as visitas do CRM no Google Agenda da empresa — para
**preparar café** para quem vai chegar, sem depender de alguém avisar.

---

## Context

Pedido do Marcos em 05/08. **Inverte a decisão 4 do Epic 81** (17/07), que desligou o Google
Calendar quando o link público por imobiliária passou a resolver o agendamento. O motivo de
negócio é novo e o link nunca cobriu: **a agenda do CRM não é visível para quem não usa o CRM.**

### Estado do código: o encanamento está INTEIRO

Kill-switch em **constante** (não env var — gotcha de env vazia da Vercel):
`lib/google-calendar.ts:13` → `GOOGLE_CALENDAR_DISABLED = true`. A coluna
`appointments.google_event_id` existe. A Nicole já está correta: recebe as funções injetadas pelo
webhook do WhatsApp e faz delete+create ao remarcar.

### 🔥 As 3 lacunas que o caso da copa expõe (nenhuma é o kill-switch)

1. **Remarcar pela tela não move o evento.** `api/appointments/[id]/route.ts` só apaga quando
   `status === "cancelled"`. Arrastar a visita de 10h para 15h deixa o Google em 10h → **café na
   hora errada, que é pior que não ter café**. Falta um `updateCalendarEvent` (não existe no lib).
2. **O link público da imobiliária não espelha.** `api/agendar/[token]/route.ts` insere o
   appointment sem chamar o Google — justamente as visitas que ninguém do escritório digitou.
3. **`attendeeEmail` provavelmente derrubava o evento INTEIRO.** O POST manda o e-mail do cliente
   como convidado. Service account **sem Domain-Wide Delegation não consegue convidar** → 403 do
   Google → a função é fail-open (`return null` + `console.error`) e o agendamento é criado normal.
   `housetrifold@gmail.com` é Gmail comum, **sem Workspace, logo DWD é impossível**. Suspeita forte
   de ser por que a integração parecia instável antes de ser desligada.

### Decisões do Marcos (05/08)

- **HOUSE + IMOB no mesmo calendário.** Título de visita IMOB leva prefixo `[IMOB]`.
- **Calendário próprio** `Visitas Trifold` dentro do `housetrifold@gmail.com` (opção A), exibido na
  mesma visão semanal do resto. Motivo: a agenda dele já tem 5-8 eventos/dia (Sala de Reunião,
  Devocional, Treinamento…) — cor própria é o que faz a copa achar a visita. E a credencial passa a
  ter permissão de escrita **só nesse calendário**: se o código errar um delete, o estrago não
  alcança o Devocional nem a agenda da Samara.
- **Cliente NÃO é convidado** (`attendeeEmail` sai). Sem Workspace não seria possível de todo jeito.
- ⚠️ Guardrail que nasce daqui: o calendário passa a ter **nome de cliente HOUSE em texto puro**. A
  máscara da 75-200 (`maskHouse`) é por PERFIL, dentro do CRM — o Google não tem perfil. **Esse
  calendário não pode ser compartilhado com imobiliária parceira.**

### Os 4 pontos de INSERT em `appointments` (o espelho tem de cobrir os 4)

| Ponto | Espelha hoje? |
|---|---|
| `api/appointments` (POST — modal interno) | ✅ já tinha |
| `api/agendar/[token]` (link da imobiliária) | ❌ lacuna 2 |
| `api/leads/[id]/visit-feedback` (visita retroativa) | ❌ |
| `packages/ai/src/chat/pipeline.ts` (Nicole) | ✅ já tinha |

---

## Acceptance Criteria

- [x] **AC1** — com as 3 env vars presentes, criar visita pelo modal interno cria o evento no
      calendário e grava `appointments.google_event_id`.
- [x] **AC2** — **remarcar pela tela move o evento** (não apaga, não duplica): mudar
      `scheduled_at`/`duration_minutes`/`location` atualiza o evento existente pelo
      `google_event_id`. Se o appointment não tem evento (criado com a integração desligada), a
      remarcação **cria** um.
- [x] **AC3** — cancelar (status `cancelled`, exclusão, ou cancelamento por token) apaga o evento.
      Comportamento atual preservado.
- [x] **AC4** — visita pelo **link público da imobiliária** espelha, com título prefixado `[IMOB]`.
- [x] **AC5** — visita **retroativa** (`visit-feedback`) espelha. É passado, mas "tudo que for pra
      agenda espelha" (decisão do Marcos).
- [x] **AC6** — **nenhum convidado** é adicionado ao evento em nenhum caminho: `attendeeEmail`
      deixa de existir na interface do lib.
- [x] **AC7** — falha do Google **não derruba** a criação do agendamento (fail-open preservado),
      **mas deixa de ser invisível**: fica registrada em `appointments.metadata.google_sync`.
- [x] **AC8** — com env var faltando, tudo segue funcionando sem evento e sem erro na tela
      (`isConfigured()` false → no-op).
- [x] **AC9** — script de **backfill** empurra as visitas **futuras** já marcadas que estão sem
      `google_event_id`, para a copa não abrir um calendário vazio no dia 1. Idempotente.
- [x] **AC10** — o kill-switch continua existindo e funcionando: `GOOGLE_CALENDAR_DISABLED = true`
      volta tudo a no-op, sem tocar em env var.

---

## Tasks / Subtasks

- [x] **T1** — `lib/google-calendar.ts`: liga o kill-switch; remove `attendeeEmail`; adiciona
      `updateCalendarEvent()`; título recebe `team` e prefixa `[IMOB]` **em um só lugar**.
- [x] **T2** — **NOVO** `lib/appointments/google-mirror.ts`: helper que os caminhos web usam —
      monta título/descrição, chama o lib, persiste `google_event_id` **ou**
      `metadata.google_sync` na falha (AC7). Evita repetir 3× a mesma sequência.
- [x] **T3** — `api/appointments/route.ts` (POST) passa a usar o helper; sai o `attendeeEmail`.
- [x] **T4** — `api/appointments/[id]/route.ts` (PATCH): remarcação **move** o evento (AC2).
- [x] **T5** — `api/agendar/[token]/route.ts` e `api/leads/[id]/visit-feedback/route.ts` passam a
      espelhar (AC4/AC5).
- [x] **T6** — `packages/ai/src/chat/pipeline.ts`: sai o `attendeeEmail` da chamada da Nicole (o
      campo deixa de existir no tipo injetado).
- [x] **T7** — `scripts/backfill-google-calendar.ts` (AC9).
- [x] **T8** — testes do helper e do título com `[IMOB]`; type-check, lint, suíte.

---

## Dev Notes

**Por que um helper novo (T2) e não copiar a chamada:** hoje o POST faz
`createCalendarEvent` → `if (id) update appointments`. Repetir isso em 3 rotas é 3 lugares para
esquecer o `[IMOB]`, esquecer de persistir o id, ou esquecer o registro da falha. O helper carrega
a sequência inteira; a rota só diz "espelha este appointment".

**Fail-open com rastro (AC7):** o padrão fail-open é correto aqui — Google fora do ar não pode
impedir uma visita de ser marcada. O que estava errado era ser **cego**: `console.error` e mais
nada. Mesma cegueira que escondeu a queda do motor de imagem da Lídia
([[project-lidia-motor-imagem]]). Passa a gravar em `metadata.google_sync`.

**`updateCalendarEvent` usa PATCH** (`events.patch`), não delete+create: preserva o id do evento,
então quem já viu a visita no Google não perde a referência. A Nicole segue com delete+create — o
fluxo dela já está em produção e testado, mudar não faz parte desta story.

**Fuso:** o lib já manda `timeZone: "America/Sao_Paulo"` em `start`/`end`. Nada a fazer.

**Backfill (T7):** só visitas **futuras** com `status` em (`scheduled`,`confirmed`), sem
`google_event_id`. Idempotente: grava o id, então rodar duas vezes não duplica.


### ✅ Verificação feita (05/08)

**Smoke test REAL contra o calendário, antes de escrever código** (script descartável em
`node`, com a chave da service account): token ok · leitura ok (`CRM - VISITAS - NICOLE`,
fuso `America/Sao_Paulo`) · criar evento ok · **PATCH ok** (prova que a remarcação move) ·
delete ok. O evento de teste foi criado e apagado; o calendário voltou vazio. Isso matou as
3 incógnitas do setup: chave válida, compartilhamento ativo (o "Pendente" do Google não
atrapalha) e Calendar API ativada.

**Variáveis na Vercel:** as 3 já existiam, sobreviventes da integração desligada em julho, e
eram `type: sensitive` — ilegíveis. Apagadas e recriadas como `encrypted` (só `production`),
depois de conferir por grep que **só** `lib/google-calendar.ts` as consome. O motivo de sair
de `sensitive`: write-only significa gravar sem poder provar que gravou, que é exatamente o
modo de falha dos 2 incidentes de valor vazio silencioso deste projeto. Conferidas por
`vercel env pull` e comparadas byte a byte com o arquivo da service account.

**Testes:** 1.750 verdes (12 novos em `google-mirror.test.ts`), type-check limpo em `web`
**e** em `ai`, lint 0 erros.

🔥 **O type-check pagou o próprio custo:** eu havia removido `attendeeEmail` só do caminho de
CRIAÇÃO da Nicole; ele continuava no de REMARCAÇÃO (`pipeline.ts:1241`). Como remarcar era
justamente o fluxo mais quebrado, teria ficado o único caminho ainda derrubando o evento.

🔥 **Rodar o backfill de verdade revelou um defeito no próprio script:** ele importa
`google-mirror`, que usa alias `@web/*` — alias que só existe no tsconfig do pacote web.
Rodando da raiz, `tsx` morria com `Cannot find module '@web/lib/google-calendar'`. Corrigido
na documentação de uso (`--tsconfig packages/web/tsconfig.json`). **Se eu tivesse só escrito
o script sem executar, isso apareceria no dia do deploy.**

⚠️ **O que NÃO foi executado:** o backfill não rodou de verdade. A chave que ele precisa
(`SUPABASE_SERVICE_ROLE_KEY`) vem **vazia** no `vercel env pull` (é `sensitive`), e as chaves
que a Management API devolve não autenticam (as legadas estão desabilitadas no projeto e a
`sb_secret_*` deu "Invalid API key"). Não fui atrás — é ambiente local, não defeito de
código. O recorte dele foi validado por SQL: **5 visitas futuras sem espelho** (4 house,
1 imob, de 05/08 a 08/08). É esse o número que o backfill deve espelhar.

### ⏳ Depende do Marcos (não bloqueia o código)
✅ **Feito nesta sessão** — service account, chave, calendário, compartilhamento e as 3
variáveis na Vercel. Não precisou de `vercel login`: o token já estava válido.
Resta só o merge + deploy, e depois rodar o backfill. Ver [[project-google-calendar-religar]].

## Change Log
| Data | Mudança |
|---|---|
| 2026-08-05 | Story criada. Inverte a decisão 4 do Epic 81; escopo e opção A decididos pelo Marcos |
| 2026-08-05 | @dev implementou as 8 tasks. Setup do Google concluído e testado antes do código. 2 defeitos achados por execução real (attendeeEmail sobrevivente na remarcação da Nicole; alias @web/* no backfill) |
