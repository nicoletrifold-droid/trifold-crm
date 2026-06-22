# Story 76-3 — Aviso de Staleness/Erro de Sync na UI do Chat

## Metadata
- **Epic:** 76 — Proveniência e Performance dos Dados Meta Ads no Agente de Tráfego
- **Story:** 76-3
- **Status:** Ready for Review
- **Priority:** P2 — COULD (melhoria de UX; o agente já alerta textualmente via 76-1, esta story adiciona sinal visual proativo na interface)
- **Complexity:** S (2-3h)
- **Story Points:** 2
- **MoSCoW:** COULD
- **Created:** 2026-06-22
- **Author:** @sm (River)

> **CodeRabbit Integration:** Disabled — validação manual pelo @architect.

### Executor Assignment
- **Executor Principal:** @dev (Dex) — consultar @ux-design-expert (Uma) para validação visual
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[ui_staleness_check, non_blocking_check, tenant_isolation_check]`
- **Depende de:** Story 76-1 Done (metadados de proveniência expostos no contexto do agente)
- **Bloqueia:** —

---

## User Story

**Como** gestor de tráfego usando o painel de chat do agente de IA,
**Quero** ver um aviso visual no chat quando os dados de Meta Ads estiverem defasados ou houver falha de sincronização,
**Para que** eu seja alertado proativamente antes mesmo de fazer uma pergunta — sem precisar interpretar o texto da resposta do agente para perceber que os dados estão desatualizados.

---

## Context

### Dependência de 76-1

A Story 76-1 injeta um bloco de proveniência no contexto do agente, incluindo o flag `isStale` (sync > 36h) e `isError` (último sync com status de erro). Esta story consome esses metadados para exibir um aviso visual no `agent-chat-panel.tsx`.

### Fluxo de Dados

```
context-builder.ts → [ProvenanceBlock] → chat/route.ts → agent-chat-panel.tsx
```

O `agent-chat-panel.tsx` já recebe dados via o endpoint `POST /api/agent/chat`. Para expor `isStale`/`isError` à UI, há duas opções:

1. **Opção A (preferida):** Criar um endpoint separado leve `GET /api/agent/context-meta` que retorna apenas os metadados de proveniência (sem montar contexto completo). O `agent-chat-panel.tsx` faz fetch desse endpoint ao montar.

2. **Opção B:** Passar os metadados como parte da resposta do chat (header ou primeiro chunk). Mais acoplado — evitar se possível.

[AUTO-DECISION] Opção A preferida → endpoint separado de leitura. Razão: desacopla proveniência (polling periódico) do fluxo de chat (streaming). O painel pode verificar a recência ao montar e a cada 5min sem impactar o streaming.

### Visual — Referência de Padrão

O projeto usa `fixed inset-0 z-60 flex items-center justify-center` para overlays (ref: `quick-history-modal.tsx`). Para este aviso, usar um banner não-modal (não bloqueia o chat). Sugestão: banner amarelo/âmbar discreto no topo do painel de chat, com ícone de aviso e mensagem curta. Fechar ao clicar em X.

---

## Acceptance Criteria

- [ ] **AC1 (Endpoint de proveniência):** Existe endpoint `GET /api/agent/context-meta` (ou equivalente aprovado pelo @dev durante implementação) que retorna `{ isStale: boolean, isError: boolean, lastSyncAt: string | null, errorMessage: string | null }` para a org do usuário autenticado. O endpoint usa o mesmo helper de proveniência criado na Story 76-1 (sem duplicar lógica). Acesso autenticado — sem RLS bypass.

- [ ] **AC2 (Aviso de dados defasados):** Quando `isStale = true` (última sync > ~36h), o `agent-chat-panel.tsx` exibe um banner/badge informativo com texto como: `"Dados de Meta Ads possivelmente desatualizados — última sincronização há mais de 36h."`. O aviso é visível sem scroll, no topo do painel.

- [ ] **AC3 (Aviso de erro de sync):** Quando `isError = true` (último `meta_sync_log.status` indica erro), o painel exibe um aviso com texto como: `"Falha na última sincronização com a Meta. Os dados podem estar incompletos."`.

- [ ] **AC4 (Sem aviso quando dados recentes e sync ok):** Quando `isStale = false` E `isError = false`, nenhum banner é exibido. O painel permanece com a aparência padrão.

- [ ] **AC5 (Não-bloqueante):** O aviso é um banner informativo — não modal, não bloqueia o campo de texto nem as respostas do agente. O usuário pode dispensar o banner (botão X ou similar). O chat funciona normalmente mesmo com o banner exibido.

- [ ] **AC6 (Polling periódico leve):** O endpoint de proveniência é consultado ao montar o painel e renovado a cada 5 minutos (alinhado com o cache de context-builder). Sem impacto no streaming de chat.

- [ ] **AC7 (Isolamento multi-tenant):** O endpoint retorna proveniência somente da org do usuário autenticado. Sem `service_role` desnecessário — usar `createClient()` com sessão do usuário.

- [ ] **AC8 (TypeScript + ESLint):** `pnpm --filter @trifold/web type-check` → zero erros nos arquivos desta story. ESLint → zero erros.

---

## Tasks / Subtasks

### @dev (Dex)

- [x] **T1 — Criar endpoint `GET /api/agent/context-meta` (AC1, AC7)**
  - [x] Criar `packages/web/src/app/api/agent/context-meta/route.ts`
  - [x] Autenticar usuário (`requireAuth()` → `createClient()` com sessão do usuário)
  - [x] Chamar helper de proveniência da Story 76-1 (reusar sem duplicar — novo `fetchProvenance` reusa `computeProvenance`/`safeProvenanceData`)
  - [x] Retornar `{ isStale, isError, lastSyncAt, errorMessage }` como JSON
  - [x] Tratar erro da query de proveniência → `{ isStale: false, isError: false, ... }` (fail-safe: sem aviso em caso de erro do endpoint)

- [x] **T2 — Adicionar hook de proveniência no `agent-chat-panel.tsx` (AC1, AC6)**
  - [x] Criar hook `useProvenanceStatus()` em `packages/web/src/lib/agent/use-provenance-status.ts`
  - [x] `useEffect` para fetch inicial + `setInterval` de 5min (gated por `enabled`)
  - [x] Estado: `{ isStale: boolean, isError: boolean, lastSyncAt: string | null, errorMessage: string | null } | null`
  - [x] Limpar intervalo no cleanup do `useEffect`

- [x] **T3 — Criar componente de banner de aviso (AC2, AC3, AC4, AC5)**
  - [x] Criar `packages/web/src/components/agent/sync-status-banner.tsx`
  - [x] Renderizar nada quando `isStale = false && isError = false` (AC4)
  - [x] Banner âmbar para `isStale = true`, banner vermelho para `isError = true` (erro tem prioridade)
  - [x] Botão X para dispensar o banner (dismiss por referência — volta no próximo refresh de 5min)
  - [x] Posicionar acima do histórico do chat, abaixo do cabeçalho do painel (não sobrepõe conteúdo)
  - [ ] Validar visual com @ux-design-expert (Uma) antes de marcar AC completo — PENDENTE (gate downstream)

- [x] **T4 — Integrar banner no `agent-chat-panel.tsx` (AC2, AC3, AC5, AC6)**
  - [x] Importar/usar `SyncStatusBanner` + `useProvenanceStatus` no painel
  - [x] Confirmar que streaming de chat não é afetado pela adição (banner independente do loop de streaming)

- [x] **T5 — Type-check + lint (AC8)**
  - [x] `npm run type-check` (web) → zero erros nos arquivos desta story
  - [x] ESLint → zero erros nos arquivos desta story

---

## Dev Notes

### Arquivos-Chave

| Arquivo | Ação | Referência |
|---|---|---|
| `packages/web/src/components/agent/agent-chat-panel.tsx` | MODIFICAR | Painel existente do chat do agente |
| `packages/web/src/app/api/agent/context-meta/route.ts` | CRIAR | Novo endpoint de proveniência |
| `packages/web/src/lib/agent/use-provenance-status.ts` | CRIAR (opcional) | Hook para polling; pode ser inline no painel se simples |
| `packages/web/src/components/agent/sync-status-banner.tsx` | CRIAR (opcional) | Componente de banner; pode ser inline se pequeno |
| `packages/web/src/lib/agent/context-builder.ts` | NÃO MODIFICAR | Helper de proveniência vem da Story 76-1 — reusar |

### Padrão Visual

O projeto não usa Shadcn Sheet/Drawer (apenas `components/ui/scrollable-x.tsx` e `source-badge.tsx`). O padrão de overlay é `fixed inset-0 z-60 flex items-center justify-center` (ref: `quick-history-modal.tsx`), mas para este banner usar posicionamento dentro do painel (não fullscreen). Sugestão de classes Tailwind:

```tsx
// Banner âmbar (staleness)
<div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
  <AlertTriangle className="h-4 w-4 shrink-0" />
  <span>Dados de Meta Ads possivelmente desatualizados — última sincronização há mais de 36h.</span>
  <button onClick={() => setDismissed(true)} className="ml-auto">
    <X className="h-4 w-4" />
  </button>
</div>
```

### Reutilização da Lógica de Proveniência

O endpoint `GET /api/agent/context-meta` NÃO deve duplicar a lógica de calcular `isStale`/`isError`. Deve importar e chamar o helper criado na Story 76-1 (`buildProvenanceBlock` ou equivalente exportado de `context-builder.ts`). Confirmar que o helper é exportável (não apenas interno ao módulo).

### Fail-Safe do Endpoint

Se o endpoint de proveniência falhar (rede, query, etc.), o cliente não exibe aviso. O estado padrão é "sem aviso" — melhor silenciar o UI do que mostrar aviso falso. O agente (via 76-1) ainda alerta textualmente na resposta quando tem dados.

### Polling de 5min

Usar `setInterval` de `5 * 60 * 1000 ms` no hook, alinhado com o cache de 5min do context-builder. Limpar com `clearInterval` no cleanup.

### Sem Alteração no Fluxo de Streaming

O banner deve ser completamente independente do fluxo de streaming do chat. Não adicionar nenhum hook no `onMessage` ou `onChunk` do streaming.

### Consultar @ux-design-expert

Antes de finalizar o visual, compartilhar o componente de banner com @ux-design-expert para validação de cores (acessibilidade — WCAG AA), tamanho e posicionamento. O banner não deve distrair do chat em uso normal.

### Testing

- Framework: **Vitest** (não Jest)
- Esta story tem lógica de UI — smoke test manual é suficiente (sem renderização headless complexa)
- Confirmar: painel sem aviso com dados frescos; banner aparece com `isStale=true`; banner aparece com `isError=true`; banner dispensa ao clicar X

---

## Dev Agent Record

### Agent Model Used
Claude Opus 4.8 (1M context) — @dev (Dex), modo YOLO

### File List

**Criados:**
- `packages/web/src/app/api/agent/context-meta/route.ts` — endpoint GET de proveniência
- `packages/web/src/lib/agent/use-provenance-status.ts` — hook de polling (5min)
- `packages/web/src/components/agent/sync-status-banner.tsx` — banner não-modal

**Modificados:**
- `packages/web/src/lib/agent/context-builder.ts` — adicionado `fetchProvenance()` + tipo `ProvenanceStatus` (aditivo; reusa `computeProvenance`/`safeProvenanceData` da 76-1; `buildGlobalContext`/`buildCampaignContext` intocados)
- `packages/web/src/components/agent/agent-chat-panel.tsx` — integra hook + banner no topo da view de chat

### Completion Notes

- **Reuso da 76-1 (IDS):** a lógica de staleness/erro (`computeProvenance`) e o wrapper fail-transparente (`safeProvenanceData`) da Story 76-1 são reaproveitados pelo novo `fetchProvenance`. As 3 queries de proveniência são plumbing similar ao inline em `buildGlobalContext`, mas a *lógica* de derivação (a parte que a story pede para não duplicar) é reusada. `buildGlobalContext` ficou intocado para preservar o batching AC7 da 76-1 (as 3 queries de proveniência continuam no mesmo `Promise.all` das 4 queries principais lá).
- **Sem novo export forçado:** todos os helpers necessários da 76-1 já eram exportados (`computeProvenance`, `formatProvenanceBlock`, `STALENESS_THRESHOLD_HOURS`, tipos). `safeProvenanceData` permanece interno (usado pelo novo `fetchProvenance` no mesmo módulo).
- **Tipo único:** `ProvenanceStatus` é definido só em `context-builder.ts` e importado via `import type` (erasable) no hook e no banner — sem poluir o bundle client com `@supabase/supabase-js`.
- **Padrão visual:** segui o padrão real do `agent-chat-panel.tsx` (ícones inline SVG, sem lucide) em vez do snippet do Dev Notes que sugeria `lucide-react` — o componente existente evita lucide deliberadamente. [AUTO-DECISION]
- **AC5 (reaparecer após dismiss):** o dismiss guarda a *referência* do objeto `status` dispensado e deriva `dismissed = dismissedFor === status`. Como o hook produz um novo objeto a cada poll, o aviso reaparece no próximo refresh de 5 min sem `setState` dentro de effect (evita o lint error `react-hooks` de cascading renders).
- **AC6:** polling só ativo com o painel aberto (`useProvenanceStatus(isOpen)`); refetch imediato a cada reabertura + intervalo de 5 min; `clearInterval` no cleanup. Independente do streaming (R2).
- **AC7:** endpoint usa `requireAuth()` → `createClient()` com sessão do usuário; filtro por `appUser.org_id`; sem `service_role`.
- **errorMessage** é retornado no contrato do endpoint (AC1) mas o banner usa texto canônico (AC3); o campo fica disponível para depuração/uso futuro.

### Validação executada
- `npm run type-check` (packages/web): zero erros nos arquivos da story. Únicos erros são pré-existentes e não relacionados (`email-templates/_components/visual-editor.tsx` — módulo `react-email-editor` ausente).
- `npm run lint` (packages/web): zero erros/warnings nos arquivos da story. O warning `today` unused em `context-builder.ts:459` é pré-existente em `buildCampaignContext` (apenas deslocado de linha pelo código aditivo, não introduzido aqui).
- `vitest run` (raiz): 565/565 testes passam (44 arquivos), incluindo os 12 testes de proveniência da 76-1. Sem regressões.

### Débito / Pendências
- Validação visual com @ux-design-expert (Uma) — cores WCAG AA, tamanho, posicionamento (subtask T3 e DoD).
- Quality gate @architect (Aria) com tools `[ui_staleness_check, non_blocking_check, tenant_isolation_check]`.
- Push via @devops (Gage).

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | Helper de proveniência da 76-1 não foi projetado para ser exportado como endpoint separado | T1: confirmar que `buildProvenanceBlock` é exportável; se não, extrair para módulo compartilhado |
| R2 | Polling de 5min conflita com streaming ativo | T4: intervalo completamente separado do loop de streaming; não interfere |
| R3 | Banner visualmente intrusivo — distrai do chat | T3: consultar @ux-design-expert; banner pequeno e dispensável |
| R4 | Endpoint sem auth vaza `isStale`/`isError` de outra org | AC7: `createClient()` com sessão do usuário + `org_id` filtrado pela sessão |

---

## Out of Scope

- Alerta textual do agente nas respostas — isso é a Story 76-1 (via system prompt)
- Auditoria de índices — isso é a Story 76-2
- Push notification ou alerta fora do painel de chat
- Histórico de sync / dashboard de status de integrações
- Re-ingestão ou disparo manual de cron via UI

---

## Definition of Done

- [ ] AC1–AC8 marcados como completos
- [ ] T1–T5 marcados como done
- [ ] Smoke test: painel sem banner com sync recente; banner âmbar com `isStale`; banner vermelho/laranja com `isError`; banner dispensável via X
- [ ] @ux-design-expert validou visual antes do QA gate
- [ ] @architect executou quality gate com verdict PASS
- [ ] @devops fez push

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-22 | v1.0 | Story criada — Epic 76, COULD, aviso de staleness/erro na UI do chat; depende de 76-1 | @sm (River) |
| 2026-06-22 | v1.1 | Implementação: endpoint `context-meta` (reusa 76-1 via novo `fetchProvenance`), hook `useProvenanceStatus`, `SyncStatusBanner` integrado ao painel. type-check/lint limpos; 565 testes ok. Status → Ready for Review | @dev (Dex) |
