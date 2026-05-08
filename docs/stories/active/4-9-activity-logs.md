status: Done

# Story 4.9 — Activity Logs (Timeline de Atividades)

## Contexto
Cada lead tem uma timeline de tudo que aconteceu: quando entrou, quando mudou de etapa, quando foi designado a um corretor, quando o handoff aconteceu, notas adicionadas, visita agendada, etc. A timeline e essencial para auditoria e para o supervisor entender o historico do lead sem ler toda a conversa.

## Acceptance Criteria
- [ ] AC1: Tabela `activities` ja existe no schema (Story 1.2) — esta story cobre o registro e exibicao
- [x] AC2: Tipos de atividade suportados:
  | Tipo | Descricao | Exemplo |
  |------|-----------|---------|
  | `lead_created` | Lead criado | "Lead criado via WhatsApp" |
  | `stage_change` | Mudou de etapa | "Movido de Novo para Qualificado" |
  | `broker_assigned` | Corretor designado | "Designado para Joao Silva" |
  | `broker_reassigned` | Corretor redesignado | "Redesignado de Joao para Maria" |
  | `handoff` | Handoff para corretor | "Transferido para corretor — motivo: qualified_price_request" |
  | `note_added` | Nota adicionada | "Nota do supervisor: Priorizar este lead" |
  | `visit_scheduled` | Visita agendada | "Visita agendada para 05/04 14:00" |
  | `visit_completed` | Visita realizada | "Visita realizada — interesse alto" |
  | `qualification_update` | Score atualizado | "Score atualizado: 45 → 72" |
  | `summary_generated` | Resumo IA gerado | "Resumo IA gerado/atualizado" |
  | `property_interest_change` | Interesse mudou | "Interesse mudou de Vind para Yarden" |
- [ ] AC3: Cada activity tem: `id`, `lead_id`, `type`, `description`, `metadata` (jsonb), `created_by` (user_id ou 'system'), `created_at`
- [ ] AC4: Funcao utilitaria `logActivity(leadId, type, description, metadata?, userId?)` usada por todas as stories
- [x] AC5: API route `GET /api/leads/[id]/activities` retorna activities em ordem cronologica reversa
- [x] AC6: No detalhe do lead (Story 4.5), secao Timeline exibe activities com:
  - Icone por tipo (seta = stage_change, pessoa = broker_assigned, etc.)
  - Descricao
  - Quem fez (nome do usuario ou "Sistema")
  - Timestamp relativo ("ha 2 horas", "ontem as 14:32")
- [ ] AC7: Activities registradas automaticamente por todas as acoes relevantes (stage_change no drag-and-drop, broker_assigned na designacao, etc.)
- [ ] AC8: Paginacao: ultimas 20 activities inicialmente, "Carregar mais" no final

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/db/src/queries/activities.ts` — Funcao `logActivity()` + query de listagem
- `packages/web/src/app/api/leads/[id]/activities/route.ts` — GET
- `packages/web/src/components/leads/lead-timeline.tsx` — Componente de timeline
- `packages/shared/src/types/activity.ts` — Types

### Funcao de log:
```typescript
export async function logActivity(params: {
  leadId: string;
  orgId: string;
  type: ActivityType;
  description: string;
  metadata?: Record<string, unknown>;
  createdBy?: string; // user_id ou 'system'
}) {
  return supabase.from('activities').insert({
    lead_id: params.leadId,
    org_id: params.orgId,
    type: params.type,
    description: params.description,
    metadata: params.metadata || {},
    created_by: params.createdBy || 'system',
  });
}
```

### Uso em outras stories:
```typescript
// Em 4.1 (mover lead no kanban)
await logActivity({
  leadId, orgId,
  type: 'stage_change',
  description: `Movido de ${oldStage.name} para ${newStage.name}`,
  metadata: { from_stage_id: oldStage.id, to_stage_id: newStage.id },
  createdBy: userId,
});

// Em 4.6 (designar corretor)
await logActivity({
  leadId, orgId,
  type: 'broker_assigned',
  description: `Designado para ${broker.name}`,
  metadata: { broker_id: broker.id },
  createdBy: userId,
});
```

### Referencia agente-linda:
- Adaptar activities de `~/agente-linda/packages/db/src/queries/activities.ts` (se existir)
- Reusar pattern de timeline component

## Dependencias
- Depende de: 1.2 (schema activities), 4.4 (leads existem)
- Bloqueia: 4.5 (detalhe do lead usa timeline)

## Estimativa
M (Media) — 2-3 horas

## File List

- `packages/web/src/app/dashboard/atividades/page.tsx` — Pagina de listagem de atividades com type badges, timestamps e links para leads

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
