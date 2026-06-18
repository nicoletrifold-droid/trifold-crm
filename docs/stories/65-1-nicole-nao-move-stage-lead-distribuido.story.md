# Story 65-1 — Nicole não reposiciona no kanban lead já distribuído

## Metadata
- **Status:** Done
- **Epic:** 65 — Roleta: Integridade do Stage Pós-Distribuição
- **Branch:** feature/65-1-nicole-nao-move-stage-lead-distribuido
- **Complexidade:** S (2 pontos) — 1 guard + helper testável + export

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, unit-tests]

## Story

**As a** gestor da imobiliária,
**I want** que um lead já distribuído a um corretor permaneça em "Aguardando atendimento",
**so that** a regra interna seja respeitada e o corretor não perca o lead da sua fila por movimentação automática da Nicole.

## Contexto

A Story 62-1 fez a **distribuição** (`distributeLeadToNextBroker`) colocar o lead em
`STAGE_IDS.novo` = **"Aguardando atendimento"**. Correto.

Porém a 62-1 deixou o **pipeline da Nicole fora de escopo**. O pipeline
(`packages/ai/src/chat/pipeline.ts`) reposiciona o lead no kanban em 3 pontos:

1. **Qualificação por score** (linhas ~663-669): `novo → em_qualificacao` quando `score > 0`,
   `em_qualificacao → qualificado` quando `score >= 70`.
2. **Visita agendada** (linha ~736): `→ visita_agendada`.
3. **Handoff** (linhas ~760-762): `→ qualificado` ou `visita_agendada`.

**Caso real (18/06/2026):** lead "João Paulo Marzola Massaroni" foi distribuído à corretora
Ana (stage = "Aguardando atendimento"), conversou com a Nicole, ganhou `score 10`, e o
pipeline o moveu para `em_qualificacao` = **"1º Contato"** — saindo de "Aguardando atendimento",
violando a regra interna.

**Decisão do usuário (escopo):** TRAVAR TUDO — um lead com `assigned_broker_id` preenchido
permanece em "Aguardando atendimento". A Nicole NÃO move o stage por qualificação, visita
ou handoff. Apenas o corretor humano muda de coluna.

**Nota:** o estado em que o lead foi distribuído é a referência — o guard usa
`currentLead.assigned_broker_id` (valor já existente no banco antes desta execução). Leads
ainda não atribuídos seguem com o comportamento normal da Nicole.

**Arquivos alvo:**
- `packages/ai/src/flows/stage-rules.ts` (NOVO — helper puro testável)
- `packages/ai/src/flows/index.ts` (export)
- `packages/ai/src/chat/pipeline.ts` (~linha 786, antes do `update(leadPatch)`)

## Escopo

**IN (esta story):**
- Helper puro `guardStageForAssignedLead(leadPatch, assignedBrokerId)` que remove `stage_id`
  do patch quando o lead já tem corretor.
- Aplicar o guard no pipeline imediatamente antes do `update(leadPatch)` único.
- A Nicole continua: respondendo, atualizando score/dados, criando appointment e disparando
  notificações — só NÃO muda o `stage_id` de um lead já atribuído.
- Testes unitários do helper.

**OUT (fora desta story):**
- Mudanças na `distributeLeadToNextBroker` (já correta via 62-1).
- Correção retroativa de leads antigos já movidos (data migration) — tratar à parte.
- Comportamento para leads NÃO atribuídos (mantém qualificação/visita/handoff como hoje).
- Reverter o caso específico do Massaroni (não-lead) — decisão manual do usuário.

## Acceptance Criteria

1. **Dado** um `leadPatch` com `stage_id` e um `assignedBrokerId` não-nulo, **quando** aplicado
   o guard, **então** `stage_id` é removido do patch.
2. **Dado** um `leadPatch` com `stage_id` e `assignedBrokerId` nulo/undefined, **quando** aplicado
   o guard, **então** `stage_id` permanece (comportamento normal para lead sem dono).
3. **Dado** um `leadPatch` sem `stage_id`, **quando** aplicado o guard, **então** o patch fica
   inalterado (não cria a chave).
4. No pipeline, um lead com `assigned_broker_id` preenchido nunca tem o `stage_id` alterado por
   qualificação, visita ou handoff.
5. Demais campos do `leadPatch` (score, dados, ai_summary) continuam sendo aplicados normalmente
   para leads atribuídos.
6. Testes unitários do helper passam; typecheck do pacote `ai` sem erros; suíte AI verde.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Guard remove stage de lead sem dono (regressão) | Baixa | Guard só age quando `assignedBrokerId` truthy; teste AC2 cobre |
| Appointment criado mas stage não muda confunde corretor | Média | É a regra pedida; o appointment + notificação ainda ocorrem |
| Lead atribuído pelo próprio pipeline na mesma execução | Baixa | Guard usa `currentLead.assigned_broker_id` (estado pré-execução), não o valor que o pipeline acabou de setar |

## Tasks / Subtasks

- [x] **Task 1 — Helper `stage-rules.ts`** (AC: 1, 2, 3)
  - [x] 1.1 `guardStageForAssignedLead(leadPatch, assignedBrokerId)` — remove `stage_id` se atribuído
  - [x] 1.2 Export em `flows/index.ts`

- [x] **Task 2 — Aplicar no pipeline** (AC: 4, 5)
  - [x] 2.1 Guard chamado antes do `update(leadPatch)`, com `currentLead?.assigned_broker_id`

- [x] **Task 3 — Testes + typecheck** (AC: 6)
  - [x] 3.1 `stage-rules.test.ts` — 5 testes passando
  - [x] 3.2 `tsc --noEmit` no pacote ai limpo + suíte AI 292 verde

## Dev Notes

### Guard puro (cobre as 3 fontes de uma vez)
Em vez de gatear cada um dos 3 pontos de stage change, um único guard antes do update remove
`stage_id` quando o lead já tem dono. Mais simples e à prova de novas fontes futuras.

```ts
export function guardStageForAssignedLead(
  leadPatch: Record<string, unknown>,
  assignedBrokerId: string | null | undefined
): void {
  if (assignedBrokerId && "stage_id" in leadPatch) {
    delete leadPatch.stage_id
  }
}
```

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-18 | 1.0 | Story criada | River (@sm) |
| 2026-06-18 | 1.1 | Validação 10/10 GO — Status → Ready | Pax (@po) |
| 2026-06-18 | 1.2 | Início da implementação — Status → InProgress | Dex (@dev) |
| 2026-06-18 | 1.3 | Implementação concluída — 5 testes helper / 292 AI / typecheck 0 — Status → InReview | Dex (@dev) |
| 2026-06-18 | 1.4 | QA Gate PASS 7/7 — Status → Done | Quinn (@qa) |
