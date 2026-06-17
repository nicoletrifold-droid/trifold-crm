# Story 62-1 — Roleta: mover lead para "aguardando atendimento" ao distribuir

## Metadata
- **Status:** Done
- **Epic:** 62 — Roleta: Stage Pipeline ao Distribuir
- **Branch:** feature/62-1-roleta-stage-aguardando-atendimento

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, unit tests]

## Story

**As a** corretor que recebeu um lead via roleta,
**I want** ver o lead no estágio "aguardando atendimento" assim que ele me for atribuído,
**so that** meu pipeline Kanban reflita a política interna corretamente sem precisar mover manualmente.

## Contexto

Quando a roleta distribui um lead para um corretor via `distributeLeadToNextBroker()`, a função
atualiza apenas `assigned_broker_id` mas **nunca atualiza `stage_id`**. O lead fica no estágio
em que estava antes da distribuição ("novo", "em_qualificacao", etc.).

Por política interna, qualquer lead recém-atribuído a um corretor deve entrar
no estágio **"aguardando atendimento"** no pipeline Kanban.

Arquivos afetados:
- `packages/web/src/lib/roleta/distributor.ts` — dois caminhos: priorizar lead ativo e roleta normal
- `packages/shared/src/constants/stages.ts` — adicionar slug `aguardando_atendimento`

O UUID do estágio precisa ser consultado no banco (`select id, name from stages where name ilike '%aguardando%'`).

## Escopo

**IN (esta story):**
- Adicionar `aguardando_atendimento` ao `STAGE_IDS` em `packages/shared/src/constants/stages.ts`
- Em `distributor.ts`, nos dois pontos de distribuição bem-sucedida:
  1. Caminho **priorizar lead ativo** (linha 135): `update({ assigned_broker_id, stage_id })`
  2. Caminho **roleta normal** (após log de distribuição, ~linha 248): `update({ stage_id })` na tabela `leads`
- Testes unitários: verificar que `stage_id` é incluído no update após distribuição bem-sucedida

**OUT (fora desta story):**
- Mudanças no cron `roleta-retry`
- Mudanças no pipeline da Nicole
- Mudanças no frontend Kanban

## Acceptance Criteria

1. Após `distributeLeadToNextBroker()` retornar `{ status: "distributed" }`, o lead na tabela `leads`
   tem `stage_id = STAGE_IDS.aguardando_atendimento`.
2. Isso acontece em AMBOS os caminhos: priorizar lead ativo E roleta normal.
3. Quando `status !== "distributed"` (ex: `fora_horario`, `sem_corretor_disponivel`), `stage_id` NÃO é alterado.
4. `STAGE_IDS.aguardando_atendimento` aponta para o UUID correto consultado no banco.
5. Testes unitários verificam que `update` inclui `stage_id` no caminho de distribuição bem-sucedida.
6. Todos os testes existentes continuam passando (typecheck + vitest).

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| UUID do estágio não encontrado no banco | Baixa | Consultar `stages` table antes de implementar |
| `stages` são por `org_id` (multi-tenant) | Média | Verificar se estágios são globais ou por org; se por org, adicionar como constante pode ser incorreto |
| Caminho de priorização já em produção | Baixa | Mudança mínima: adicionar `stage_id` ao objeto do update existente |

## 🤖 CodeRabbit Integration

**Primary Type:** Bug Fix (P1)
**Complexity:** Low

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): typecheck + vitest run
- [ ] Pre-PR (@devops): rodar antes de criar PR

**Self-Healing:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Severity Filter: CRITICAL, HIGH

## Tasks / Subtasks

- [x] **Task 1 — Consultar UUID do estágio no banco** (AC: 4)
  - [x] 1.1 Migration 091 confirma: "Aguardando atendimento" = `00000000-0000-0000-0001-000000000001`
  - [x] 1.2 UUID é o mesmo que `STAGE_IDS.novo` — nenhuma nova constante necessária

- [x] **Task 2 — Adicionar `aguardando_atendimento` ao STAGE_IDS** (AC: 4)
  - [x] 2.1 Não necessário: `STAGE_IDS.novo` já aponta para o UUID correto

- [x] **Task 3 — Atualizar `stage_id` no distributor** (AC: 1, 2, 3)
  - [x] 3.1 Caminho **priorizar lead ativo**: `update({ assigned_broker_id, stage_id: STAGE_IDS.novo })`
  - [x] 3.2 Caminho **roleta normal**: `update({ stage_id: STAGE_IDS.novo })` após log de distribuição

- [x] **Task 4 — Testes unitários** (AC: 5, 6)
  - [x] 4.1 `distributor.test.ts` criado com 4 testes — verifica `stage_id` no update "distributed"
  - [x] 4.2 Testa que "roleta_inativa" e "sem_corretor" NÃO atualizam `stage_id`

## Dev Notes

### Localização dos dois pontos de update em distributor.ts

**Caminho 1 — priorizar lead ativo (~linha 135):**
```typescript
// ANTES:
await admin.from("leads").update({ assigned_broker_id: assignedUserId }).eq("id", leadId)

// DEPOIS:
await admin.from("leads").update({
  assigned_broker_id: assignedUserId,
  stage_id: STAGE_IDS.aguardando_atendimento,
}).eq("id", leadId)
```

**Caminho 2 — roleta normal (após linha ~248, após log de distribuição):**
```typescript
// ADICIONAR após o await de lead_distribution_log.insert:
await admin.from("leads").update({ stage_id: STAGE_IDS.aguardando_atendimento }).eq("id", leadId)
```

### Import necessário em distributor.ts
```typescript
import { STAGE_IDS } from "@trifold/shared"
```

### Atenção: stages multi-tenant

Se a tabela `stages` for por `org_id`, o UUID pode variar por organização.
Neste caso, @dev deve investigar e, se necessário, buscar o estágio dinamicamente por slug/name.
Verificar com: `SELECT DISTINCT org_id, id, name FROM stages WHERE name ILIKE '%aguard%' LIMIT 10`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-17 | 1.0 | Story criada | River (@sm) |
| 2026-06-17 | 1.1 | Validação 10/10 GO — atenção ao risco multi-tenant antes de fixar UUID — Status → Ready | Pax (@po) |
| 2026-06-17 | 1.2 | Implementação concluída — UUID confirmado via migration 091 = STAGE_IDS.novo — 392/392 testes — Status → InReview | Dex (@dev) |
| 2026-06-17 | 1.3 | QA Gate PASS 7/7 — Status → Done | Quinn (@qa) |
