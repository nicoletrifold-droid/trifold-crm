# Story 15.7 — CRUD Campanhas: API Routes + Auto-discovery de Campos

## Status
Draft

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["code-review", "test-validation"]

## Story
**As a** admin da Trifold,
**I want** criar, listar, editar, ativar e pausar campanhas via API,
**so that** o painel de acoes consiga gerenciar campanhas sem depender de insercao manual no banco.

## Contexto

**Epic 15 — Campaign Engine (Fase 2 — Painel + Tracking)**

API REST para o CRUD de campanhas. Inclui endpoint de auto-discovery que consulta a Google Forms API para listar perguntas e sugerir mapeamento de campos.

**Referencia:** Arquitetura secoes 4.6.2 (Nova Campanha) e 4.2.3 (auto-discovery)

**Dependencias:** Stories 15.1 (tabelas) e 15.2 (Google OAuth2/Forms API)

## Acceptance Criteria

### CRUD Basico

1. [ ] AC1: `POST /api/campaigns` — cria campanha com: name, description, property_id, starts_at, ends_at, form_url, whatsapp_template_name, email_enabled, email_subject, email_body_html, field_mapping. Gera slug automaticamente a partir do nome. Extrai google_form_id da URL. Status inicial: 'draft'. Requer role admin/supervisor.
2. [ ] AC2: `GET /api/campaigns` — lista campanhas da org com metricas agregadas: total_entries (COUNT campaign_entries), valid_entries (COUNT WHERE is_valid_phone=true AND is_valid_email=true), taxa_validacao (valid/total * 100). Inclui join com properties(name). Ordenado por created_at DESC.
3. [ ] AC3: `GET /api/campaigns/[id]` — retorna campanha completa com metricas detalhadas: total_entries, whatsapp_sent/delivered/read/failed, email_sent/delivered/opened/bounced, valid_entries, responded_entries
4. [ ] AC4: `PATCH /api/campaigns/[id]` — atualiza campos editaveis: name, description, starts_at, ends_at, whatsapp_template_name, email_enabled, email_subject, email_body_html, field_mapping. NAO permite alterar slug.
5. [ ] AC5: `POST /api/campaigns/[id]/activate` — muda status de draft/paused para active. Valida que google_form_id e field_mapping existem antes de ativar.
6. [ ] AC6: `POST /api/campaigns/[id]/pause` — muda status de active para paused.

### Auto-discovery de Campos

7. [ ] AC7: `POST /api/campaigns/discover-fields` — recebe `{ form_url }`, extrai google_form_id da URL, consulta Google Forms API `forms.get(formId)`, retorna lista de perguntas com sugestao de mapeamento baseado em keywords (nome→name, whatsapp/telefone→phone, email→email, demais→custom:slug)
8. [ ] AC8: Se Google nao esta conectado (sem tokens OAuth2), retorna 400 com mensagem "Google nao conectado"

### Metricas

9. [ ] AC9: Endpoint GET /api/campaigns/[id]/entries — lista campaign_entries da campanha com paginacao (limit/offset), filtros por: status (valid/invalid/responded), e ordenacao por created_at DESC

### Qualidade

10. [ ] AC10: Todas as rotas protegidas com `requireAuth()` + `requireRole(["admin", "supervisor"])`
11. [ ] AC11: `pnpm run type-check` passa sem erros
12. [ ] AC12: Nenhum secret hardcoded

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled

## Tasks / Subtasks

- [ ] Task 1: Criar rotas CRUD basico (AC1-AC6)
  - [ ] 1.1: `packages/web/src/app/api/campaigns/route.ts` — POST (create) + GET (list)
  - [ ] 1.2: `packages/web/src/app/api/campaigns/[id]/route.ts` — GET (detail) + PATCH (update)
  - [ ] 1.3: `packages/web/src/app/api/campaigns/[id]/activate/route.ts` — POST
  - [ ] 1.4: `packages/web/src/app/api/campaigns/[id]/pause/route.ts` — POST
  - [ ] 1.5: Helper `slugify()` para gerar slug a partir do nome
  - [ ] 1.6: Helper `extractFormId(url)` para extrair google_form_id da URL do Forms

- [ ] Task 2: Auto-discovery de campos (AC7, AC8)
  - [ ] 2.1: `packages/web/src/app/api/campaigns/discover-fields/route.ts` — POST
  - [ ] 2.2: Consultar Forms API `forms.forms.get({ formId })` para listar perguntas
  - [ ] 2.3: Algoritmo de sugestao por keywords: nome→name, whatsapp/telefone/celular→phone, email→email, demais→custom:slugified_title

- [ ] Task 3: Endpoint de entries (AC9)
  - [ ] 3.1: `packages/web/src/app/api/campaigns/[id]/entries/route.ts` — GET com paginacao e filtros

- [ ] Task 4: Validacao (AC10, AC11, AC12)
  - [ ] 4.1: Auth + role check em todas as rotas
  - [ ] 4.2: type-check

## Dev Notes

### Source Tree Relevante

- `packages/web/src/lib/api-auth.ts` — `requireAuth()`, `requireRole()`
- `packages/web/src/lib/google.ts` — `getFormsClient()`, `OAuthTokens`
- `packages/web/src/app/api/leads/route.ts` — referencia de padrao CRUD
- `packages/web/src/app/api/webhooks/meta-ads/route.ts` — referencia de padrao com service_role
- `supabase/migrations/013_campaign_engine.sql` — schema das tabelas

### Slugify

```typescript
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
```

### Extrair Form ID da URL

```typescript
// https://docs.google.com/forms/d/1ABC123xyz/viewform → 1ABC123xyz
function extractFormId(url: string): string | null {
  const match = url.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/)
  return match?.[1] ?? null
}
```

### Metricas Agregadas (GET list)

Usar subquery ou RPC para contar entries por campanha eficientemente. Alternativa: fazer COUNT no app layer com query separada.

### Testing

- `pnpm run type-check`
- Testar CRUD completo: create → list → detail → update → activate → pause
- Testar discover-fields com URL valida e sem Google conectado

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-16 | 1.0 | Story criada | @sm (River) |
