# Story 15.9 — UI: Detalhe da Campanha + Metricas + Tabela Participantes

## Status
Draft

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["code-review", "ui-review"]

## Story
**As a** admin da Trifold,
**I want** visualizar os indicadores de performance e a lista de participantes de cada campanha,
**so that** eu consiga avaliar a efetividade da acao e validar quais dados sao reais.

## Contexto

**Epic 15 — Campaign Engine (Fase 2 — Painel + Tracking)**

Tela de detalhe da campanha com cards de metricas e tabela de participantes. Inclui edicao e exportacao CSV.

**Referencia:** Arquitetura secao 4.6.2 (Detalhe da Campanha)

**Dependencias:** Stories 15.7 (API) e 15.8 (lista/criacao)

## Acceptance Criteria

### Detalhe (`/dashboard/campaigns/[id]`)

1. [ ] AC1: Header com: nome da campanha, status badge, botoes [Editar] [Pausar/Ativar] [Ver no Pipeline]
2. [ ] AC2: 5 cards de metricas no topo: Cadastros (total), WhatsApp Entregues (entregues/total + %), E-mail Abertos (abertos/total + %), Leads Validos (validos count + %), Responderam WhatsApp (responderam count + %)
3. [ ] AC3: Secao detalhamento WhatsApp: enviados / entregues / lidos / falhados
4. [ ] AC4: Secao detalhamento E-mail: enviados / entregues / abertos / bounced
5. [ ] AC5: Tabela de participantes com colunas: Nome, WhatsApp, E-mail, Dados custom (palpite etc), WhatsApp status (badge), E-mail status (badge), Valido? (check verde), Respondeu? (check verde), Data
6. [ ] AC6: Filtros na tabela: Todos / Validos / Invalidos / Responderam / Sem resposta
7. [ ] AC7: Botao "Ver no Pipeline" navega para `/dashboard/pipeline?campaign_id={id}`
8. [ ] AC8: Botao "Exportar CSV" gera download com todos os dados da tabela de participantes

### Edicao (`/dashboard/campaigns/[id]/editar`)

9. [ ] AC9: Formulario preenchido com dados atuais da campanha
10. [ ] AC10: Permite alterar: name, description, starts_at, ends_at, whatsapp_template_name, email_enabled, email_subject, email_body_html, field_mapping
11. [ ] AC11: NAO permite alterar slug
12. [ ] AC12: Salvar chama `PATCH /api/campaigns/[id]` e redireciona para detalhe

### Qualidade

13. [ ] AC13: `pnpm run type-check` passa sem erros
14. [ ] AC14: Design consistente com o dashboard existente

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled

## Tasks / Subtasks

- [ ] Task 1: Pagina detalhe (AC1-AC7)
  - [ ] 1.1: Criar `packages/web/src/app/dashboard/campaigns/[id]/page.tsx`
  - [ ] 1.2: Header com nome, status badge, botoes de acao
  - [ ] 1.3: Cards de metricas (query campaign_entries com agregacoes)
  - [ ] 1.4: Secoes detalhamento WhatsApp e E-mail
  - [ ] 1.5: Tabela de participantes com dados de campaign_entries
  - [ ] 1.6: Filtros client-side (Todos/Validos/Invalidos/Responderam)
  - [ ] 1.7: Link "Ver no Pipeline"

- [ ] Task 2: Exportar CSV (AC8)
  - [ ] 2.1: Botao que gera CSV client-side a partir dos dados carregados
  - [ ] 2.2: Incluir todas as colunas relevantes: nome, phone, email, custom_data, whatsapp_status, email_status, is_valid_phone, is_valid_email, has_responded, created_at

- [ ] Task 3: Pagina edicao (AC9-AC12)
  - [ ] 3.1: Criar `packages/web/src/app/dashboard/campaigns/[id]/editar/page.tsx`
  - [ ] 3.2: Formulario preenchido com dados atuais
  - [ ] 3.3: Slug como campo readonly
  - [ ] 3.4: Submit → PATCH /api/campaigns/[id] → redirect

- [ ] Task 4: Validacao (AC13, AC14)
  - [ ] 4.1: type-check
  - [ ] 4.2: Consistencia visual

## Dev Notes

### Source Tree Relevante

- `packages/web/src/app/dashboard/analytics/page.tsx` — referencia de pagina com cards de metricas
- `packages/web/src/app/dashboard/leads/page.tsx` — referencia de tabela com dados
- `packages/web/src/app/api/campaigns/[id]/route.ts` — API detail (story 15.7)
- `packages/web/src/app/api/campaigns/[id]/entries/route.ts` — API entries (story 15.7)

### Metricas — Queries

As metricas vem de campaign_entries. Para performance, fazer uma unica query com contagens:

```typescript
const { data: entries } = await supabase
  .from("campaign_entries")
  .select("whatsapp_status, email_status, is_valid_phone, is_valid_email, has_responded")
  .eq("campaign_id", id)

const metrics = {
  total: entries.length,
  wa_sent: entries.filter(e => e.whatsapp_status !== 'pending').length,
  wa_delivered: entries.filter(e => ['delivered','read'].includes(e.whatsapp_status)).length,
  wa_read: entries.filter(e => e.whatsapp_status === 'read').length,
  wa_failed: entries.filter(e => e.whatsapp_status === 'failed').length,
  email_sent: entries.filter(e => e.email_status !== 'pending').length,
  email_delivered: entries.filter(e => ['delivered','opened'].includes(e.email_status)).length,
  email_opened: entries.filter(e => e.email_status === 'opened').length,
  email_bounced: entries.filter(e => e.email_status === 'bounced').length,
  valid: entries.filter(e => e.is_valid_phone && e.is_valid_email).length,
  responded: entries.filter(e => e.has_responded).length,
}
```

### CSV Export

```typescript
function downloadCSV(entries, filename) {
  const headers = ["Nome", "WhatsApp", "Email", "Palpite", "WA Status", "Email Status", "Valido", "Respondeu", "Data"]
  const rows = entries.map(e => [e.name, e.phone, e.email, e.custom_data?.palpite ?? "", e.whatsapp_status, e.email_status, e.is_valid_phone ? "Sim" : "Nao", e.has_responded ? "Sim" : "Nao", e.created_at])
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n")
  // trigger download via blob URL
}
```

### Testing

- `pnpm run type-check`
- Navegar: lista → detalhe → ver metricas → filtrar → exportar CSV → editar → salvar

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-16 | 1.0 | Story criada | @sm (River) |
