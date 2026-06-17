# Story 60-1 — Roleta Retry: corrigir filtro de stage para distribuir leads sem corretor

## Metadata
- **Status:** Done
- **Epic:** 60 — Roleta: Retry de Distribuição para Leads Sem Corretor
- **Branch:** feature/60-1-roleta-retry-fix-stage-filter

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, unit tests]

## Story

**As a** lead que entrou fora do horário de atendimento (ou com fila de corretores no limite),
**I want** ser automaticamente distribuído a um corretor na próxima janela de horário válida,
**so that** não fique permanentemente sem corretor por um problema de timing na entrada.

## Contexto

O cron `/api/cron/roleta-retry` JÁ EXISTE e está agendado a cada 30 minutos em `vercel.json`.
O problema é um bug no filtro: o cron usa `stage_id = "00000000-0000-0000-0001-000000000001"` —
um UUID sequencial/placeholder que não existe nas tabelas `kanban_stages` reais do banco.
Por isso, a query retorna 0 leads em toda execução e **nunca redistribui ninguém**.

Caso real: lead Arnaldo (559391777273) entrou em 14/jun, ficou com `assigned_broker_id = null`
e permaneceu assim por dias apesar do cron existir.

## Escopo

**IN (esta story):**
- Remover o filtro `stage_id` da query do cron `roleta-retry`, fazendo o cron buscar TODOS os leads ativos sem corretor
- Adicionar filtro de idade: apenas leads dos últimos 30 dias (evitar retry de leads muito antigos)
- Adicionar log do motivo do retry ignorado quando `fora_horario` (para diagnóstico)

**OUT (fora desta story):**
- Mudar a lógica de `distributeLeadToNextBroker` (permanece intacta)
- Criar nova tabela ou coluna de tracking de retry
- Alterações no `vercel.json` (o agendamento já está correto)
- Notificações para corretores ao ser redistribuído

## Acceptance Criteria

1. O cron `/api/cron/roleta-retry` busca leads com `is_active = true`, `assigned_broker_id IS NULL`, e `created_at >= now() - interval '30 days'` — **sem filtro de `stage_id`**.
2. Para cada lead encontrado, chama `distributeLeadToNextBroker(lead.id, lead.org_id)` e acumula os resultados.
3. A constante `NOVO_STAGE_ID` e o filtro `.eq("stage_id", NOVO_STAGE_ID)` são removidos completamente do arquivo.
4. O log final inclui: `{ processed: N, distributed: N, fora_horario: N, sem_corretor: N, outros: N }`.
5. Testes unitários cobrem: (a) leads sem broker são encontrados e passados para `distributeLeadToNextBroker`; (b) nenhum filtro de stage_id é aplicado.
6. Typecheck e testes existentes continuam passando.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Cron tentar redistribuir leads que já foram atribuídos manualmente | Baixa | A query filtra `assigned_broker_id IS NULL` — se atribuído, não aparece |
| Volume alto de leads sem broker atingir o `MAX_PER_RUN=50` | Baixa | Limite já existe; processar 50 por vez é seguro |
| Lead em stage avançado (ex: "Vendido") ser redistribuído | Baixa | A roleta respeita regras de negócio via `distributeLeadToNextBroker` |

## 🤖 CodeRabbit Integration

**Primary Type:** Cron / Bug Fix
**Secondary Type:** Database Query
**Complexity:** Low

**Primary Agents:**
- @dev: implementação e pre-commit review

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): rodar antes de marcar story como completa
- [ ] Pre-PR (@devops): rodar antes de criar PR

**Self-Healing:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Severity Filter: CRITICAL, HIGH

**Focus Areas:**
- Não alterar `distributeLeadToNextBroker` (fora de escopo)
- Garantir que o filtro de 30 dias usa `created_at`, não `updated_at`

## Tasks / Subtasks

- [x] **Task 1 — Corrigir query do cron** (AC: 1, 2, 3)
  - [x] 1.1 Abrir `packages/web/src/app/api/cron/roleta-retry/route.ts`
  - [x] 1.2 Remover a constante `NOVO_STAGE_ID`
  - [x] 1.3 Remover `.eq("stage_id", NOVO_STAGE_ID)` da query
  - [x] 1.4 Adicionar `.gte("created_at", thirtyDaysAgo)` onde `thirtyDaysAgo` é calculado com `RETRY_WINDOW_DAYS = 30`
  - [x] 1.5 Mover leitura do `CRON_SECRET` para dentro do handler (necessário para testabilidade)

- [x] **Task 2 — Testes unitários** (AC: 5, 6)
  - [x] 2.1 Criar `packages/web/src/app/api/cron/roleta-retry/route.test.ts`
  - [x] 2.2 Testar que a query não inclui filtro de `stage_id`
  - [x] 2.3 Testar que leads com `assigned_broker_id = null` nos últimos 30 dias são processados
  - [x] 2.4 Testar que `distributeLeadToNextBroker` é chamado para cada lead encontrado

## Dev Notes

### Arquivo alvo

| Arquivo | Mudança |
|---------|---------|
| `packages/web/src/app/api/cron/roleta-retry/route.ts` | Remover `NOVO_STAGE_ID` + `.eq("stage_id", ...)` + adicionar filtro de 30 dias |

### Estado atual (bugado)

```typescript
const NOVO_STAGE_ID = "00000000-0000-0000-0001-000000000001" // ← placeholder UUID inexistente

const { data: leads } = await admin
  .from("leads")
  .select("id, org_id, name")
  .eq("is_active", true)
  .eq("stage_id", NOVO_STAGE_ID)   // ← sempre retorna 0 resultados
  .is("assigned_broker_id", null)
  .order("created_at", { ascending: true })
  .limit(MAX_PER_RUN)
```

### Estado esperado após fix

```typescript
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

const { data: leads } = await admin
  .from("leads")
  .select("id, org_id, name")
  .eq("is_active", true)
  .is("assigned_broker_id", null)
  .gte("created_at", thirtyDaysAgo)
  .order("created_at", { ascending: true })
  .limit(MAX_PER_RUN)
```

### Por que remover o filtro de stage?

O stage inicial ("novo") varia por org e por configuração. Usar um UUID hardcoded é frágil
e quebra para qualquer instância do sistema. Além disso, leads podem perder o broker
em qualquer stage — limitar o retry ao stage inicial desperdiça o mecanismo de recovery.
O filtro correto é simplesmente `assigned_broker_id IS NULL`.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-17 | 1.0 | Story criada | River (@sm) |
| 2026-06-17 | 1.1 | Validação 10/10 GO — Status → Ready | Pax (@po) |
| 2026-06-17 | 1.2 | Implementação concluída — 374/374 testes — Status → InReview | Dex (@dev) |
| 2026-06-17 | 1.3 | QA Gate PASS 7/7 — Status → Done (pending push) | Quinn (@qa) |
