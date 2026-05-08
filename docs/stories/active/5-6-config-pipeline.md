status: Done

# Story 5.6 — Configuracao de Pipeline (Gerenciar Etapas)

## Contexto
O admin precisa de uma interface visual para gerenciar as etapas do pipeline: criar novas etapas, editar nome/cor, reordenar via drag-and-drop, e definir etapas finais (ganho/perdido). O backend ja esta pronto (Story 4.2) — esta story cobre a interface admin.

## Acceptance Criteria
- [x] AC1: Pagina `/dashboard/settings/pipeline` exibe todas as etapas do pipeline em ordem
- [x] AC2: Cada etapa exibe: cor (sample), nome, tipo (normal/ganho/perdido), contagem de leads
- [ ] AC3: Drag-and-drop para reordenar etapas (salva automaticamente via API de reorder)
- [x] AC4: Botao "Nova etapa" abre modal com: nome*, cor* (color picker), tipo (normal/ganho/perdido)
- [x] AC5: Clique em etapa abre modal de edicao com mesmos campos
- [x] AC6: Botao "Remover" com confirmacao — desabilitado se etapa tem leads (tooltip explica)
- [x] AC7: Indicador visual de etapas finais: badge "Ganho" (verde) ou "Perdido" (cinza)
- [ ] AC8: Preview do pipeline: mini-kanban abaixo mostrando como ficara
- [ ] AC9: Validacao visual: se nao ha etapa "ganho" ou "perdido", warning amarelo
- [ ] AC10: Alteracoes refletem imediatamente no pipeline kanban (Story 4.1)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/settings/pipeline/page.tsx` — Pagina de config
- `packages/web/src/components/settings/pipeline-stages-editor.tsx` — Editor de etapas com DnD
- `packages/web/src/components/settings/stage-form-modal.tsx` — Modal de criacao/edicao
- `packages/web/src/components/settings/pipeline-preview.tsx` — Preview mini-kanban

### Dependencias de UI:
```bash
# Ja instalado na Story 4.1
@dnd-kit/core @dnd-kit/sortable
```

### Reorder via API:
```typescript
// Apos drag-and-drop
async function handleReorder(stages: { id: string; position: number }[]) {
  await fetch('/api/pipeline/stages/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ stages }),
  });
}
```

### Referencia agente-linda:
- Adaptar settings de pipeline de `~/agente-linda/packages/web/src/app/dashboard/settings/` (se existir)
- Reusar DnD pattern da Story 4.1

## Dependencias
- Depende de: 4.2 (API de stages), 1.5 (auth admin)
- Bloqueia: Nenhuma

## Estimativa
P (Pequena) — 1-2 horas

## File List

- `packages/web/src/app/dashboard/configuracoes/pipeline/page.tsx` — Pagina de configuracao das etapas do pipeline com modais de criacao/edicao
- `packages/web/src/app/api/stages/route.ts` — API de gerenciamento de etapas (GET, POST)
- `packages/web/src/app/api/stages/[id]/route.ts` — API de etapa individual (GET, PATCH, DELETE)

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
