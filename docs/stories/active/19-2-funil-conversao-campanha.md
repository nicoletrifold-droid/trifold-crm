# Story 19.2 — Funil de Conversão por Campanha

## Status
Ready

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["funnel_logic", "ui_accessibility", "chart_rendering", "api_contract"]

## Story
**As a** gestor de tráfego do Trifold,
**I want** visualizar um funil de conversão com 6 estágios na página de detalhe de cada campanha Meta,
**so that** eu identifique exatamente onde os leads estão sendo perdidos — se o problema é na atração, no bot, na qualificação, ou no agendamento — e tome ações cirúrgicas para melhorar a conversão.

## Contexto

**Epic 19 — Meta Ads Intelligence**
**Depende de:** Story 19.1 (lógica de join leads × campanhas, `leads_responderam`, `leads_qualificados`)

A página de detalhe de campanha (`/dashboard/campaigns/meta/[campaign_id]`) já existe com:
- Header: nome, objetivo, status, orçamento
- Gráfico de série temporal (spend + leads)
- Tabela de AdSets
- Lista de leads associados

Esta story **adiciona uma nova seção** "Funil de Conversão" nessa página, sem remover nada existente.

**Arquivos relevantes:**
- `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/route.ts` — API de detalhe (adicionar endpoint `/funnel`)
- `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx` — componente de detalhe (adicionar seção de funil)
- `packages/shared/src/types/` — tipos compartilhados

**Estágios do funil (em ordem):**
1. **Leads Meta** — form submissions reportados pela Meta API (`meta_insights_daily.leads`)
2. **Leads CRM** — criados no CRM com `utm_campaign` ou `metadata.campaign_id` correspondente
3. **Responderam** — `last_response_at IS NOT NULL`
4. **Qualificados** — `status NOT IN ('new', 'unqualified')` E `last_response_at IS NOT NULL`
5. **Visita Agendada** — `status IN ('visit_scheduled', 'visited', 'proposal', 'closed')`
6. **Proposta/Fechamento** — `status IN ('proposal', 'closed')`

**Gargalo principal:** estágio com maior queda percentual em relação ao estágio anterior.

## Acceptance Criteria

1. Existe endpoint `GET /api/meta-ads/campaigns/[campaign_id]/funnel?period=30d` retornando:
   ```typescript
   interface CampaignFunnelResponse {
     stages: {
       leads_meta: number
       leads_crm: number
       responderam: number
       qualificados: number
       visita_agendada: number
       proposta: number
     }
     gargalo: 'leads_crm' | 'responderam' | 'qualificados' | 'visita_agendada' | 'proposta' | null
     cpl_real: number | null
     taxa_qualificacao: number | null
     taxa_visita: number | null   // % de qualificados que agendaram visita
   }
   ```

2. O endpoint aceita query param `period` (7d, 30d, 90d) para filtrar `meta_insights_daily`.

3. Na página de detalhe, nova seção "Funil de Conversão" renderiza abaixo da série temporal:
   - 6 barras horizontais proporcionais ao topo do funil (100% = leads_meta)
   - Cada barra exibe: label do estágio + contagem absoluta + "% do topo" + "% do anterior"
   - Barra do gargalo destacada com borda amarela e ícone ⚠️

4. Card de insight abaixo do funil exibe em linguagem natural:
   - Exemplo: "O maior gargalo está entre **Leads CRM → Responderam**: apenas 42% avançam. Considere revisar a abordagem inicial do bot."
   - Mensagens pré-definidas por tipo de gargalo (ver Dev Notes)

5. Estado vazio: se `leads_meta < 5` no período, exibe mensagem "Volume insuficiente para análise de funil neste período (mínimo 5 leads Meta)."

6. O filtro de período da página (7d/30d/90d) sincroniza com o funil — mudança no filtro recarrega os dados do funil.

7. Responsivo: funil legível em viewport de 375px (mobile).

8. `pnpm run type-check` passa sem erros.

9. `pnpm run lint` passa sem erros.

## Estimativa
**Complexidade:** G (Grande) — 5h. Novo endpoint + componente de funil visual.

## Fora do Escopo (OUT)
- Comparação de funil entre campanhas
- Funil animado ou com transições (estático é suficiente)
- Exportar funil como imagem/PDF
- Funil por AdSet (apenas por campanha)

## Riscos
- **Dados insuficientes na estreia:** Campanha nova pode ter poucos leads no CRM; mitigado pelo estado vazio (AC5)
- **Dupla contagem no join:** Já resolvida na Story 19.1 com deduplicação via `Set<string>` — reusar a mesma lógica
- **`leads_meta` = 0 quando insights ainda não sincronizaram:** Exibir funil apenas com dados CRM nesses casos (não bloquear)

## Tasks / Subtasks

- [ ] **Task 1 — Criar endpoint `GET /api/meta-ads/campaigns/[campaign_id]/funnel/route.ts`** (AC: 1, 2)
  - [ ] 1.1 Criar pasta `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/funnel/`
  - [ ] 1.2 Criar `route.ts` com GET handler autenticado (padrão `requireAuth()`)
  - [ ] 1.3 Buscar `meta_campaign_id` da campanha via `meta_campaigns` (join pelo UUID interno)
  - [ ] 1.4 Buscar `leads_meta` de `meta_insights_daily` somando `leads` pelo período
  - [ ] 1.5 Buscar leads do CRM com join duplo (utm_campaign + metadata.campaign_id), selecionando `id`, `last_response_at`, `status`
  - [ ] 1.6 Calcular cada estágio do funil por contagem de Sets (dedup por lead.id)
  - [ ] 1.7 Identificar gargalo: comparar taxa de cada estágio em relação ao anterior, retornar o de menor taxa
  - [ ] 1.8 Calcular `cpl_real`, `taxa_qualificacao`, `taxa_visita`
  - [ ] 1.9 Retornar `CampaignFunnelResponse`

- [ ] **Task 2 — Criar componente `<CampaignFunnel />`** (AC: 3, 4, 5, 7)
  - [ ] 2.1 Criar `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-funnel.tsx`
  - [ ] 2.2 Implementar barras horizontais com largura proporcional ao topo (`width: ${pct}%`)
  - [ ] 2.3 Destacar barra do gargalo com `border border-yellow-400` e ícone ⚠️
  - [ ] 2.4 Exibir contagem absoluta + "% do topo" + "% do anterior" em cada barra
  - [ ] 2.5 Implementar card de insight com mensagem por tipo de gargalo
  - [ ] 2.6 Implementar estado vazio (leads_meta < 5)
  - [ ] 2.7 Garantir responsividade: labels abreviam em mobile (`leads_responderam` → `Responderam`)

- [ ] **Task 3 — Integrar funil na página de detalhe** (AC: 6)
  - [ ] 3.1 Em `campaign-detail-client.tsx`, adicionar fetch para `/api/meta-ads/campaigns/[id]/funnel?period=${period}`
  - [ ] 3.2 Sincronizar o `period` state existente com o fetch do funil
  - [ ] 3.3 Renderizar `<CampaignFunnel />` abaixo da série temporal, antes da tabela de AdSets

- [ ] **Task 4 — Tipos compartilhados** (AC: 1)
  - [ ] 4.1 Adicionar `CampaignFunnelResponse` em `packages/shared/src/types/` ou definir localmente em `route.ts` se não for reutilizado

- [ ] **Task 5 — Verificação de qualidade** (AC: 8, 9)
  - [ ] 5.1 `pnpm run type-check` — corrigir todos os erros
  - [ ] 5.2 `pnpm run lint` — corrigir todos os warnings

## Dev Notes

**Estrutura de diretórios a criar:**
```
packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/funnel/
  route.ts                  ← novo
packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/
  campaign-funnel.tsx       ← novo
  campaign-detail-client.tsx ← modificar (adicionar seção)
```

**Labels dos estágios (PT-BR):**
```typescript
const STAGE_LABELS = {
  leads_meta:      'Leads Meta',
  leads_crm:       'Leads CRM',
  responderam:     'Responderam',
  qualificados:    'Qualificados',
  visita_agendada: 'Visita Agendada',
  proposta:        'Proposta',
}
```

**Mensagens de insight por gargalo:**
```typescript
const GARGALO_MESSAGES: Record<string, string> = {
  leads_crm:       'Poucos leads chegam ao CRM. Verifique se o webhook Meta está funcionando ou se há problema no formulário.',
  responderam:     'Muitos leads não respondem o bot. Considere revisar a mensagem de abordagem inicial.',
  qualificados:    'Muitos leads respondem mas não se qualificam. Revise as perguntas de qualificação da Nicole.',
  visita_agendada: 'Leads qualificados não estão agendando visita. Verifique a oferta de visita e disponibilidade de horários.',
  proposta:        'Visitas acontecem mas poucas chegam à proposta. Foco em preparação da visita e follow-up pós-visita.',
}
```

**Lógica de cálculo do gargalo:**
```typescript
// Gargalo = estágio com menor taxa de avanço (em relação ao anterior)
const transitions = [
  { key: 'leads_crm',       from: stages.leads_meta,      to: stages.leads_crm },
  { key: 'responderam',     from: stages.leads_crm,       to: stages.responderam },
  { key: 'qualificados',    from: stages.responderam,     to: stages.qualificados },
  { key: 'visita_agendada', from: stages.qualificados,    to: stages.visita_agendada },
  { key: 'proposta',        from: stages.visita_agendada, to: stages.proposta },
]
const gargalo = transitions
  .filter(t => t.from > 0)
  .sort((a, b) => (a.to / a.from) - (b.to / b.from))[0]?.key ?? null
```

**Padrão de autenticação e Supabase:**
```typescript
// Copiar exatamente de packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/route.ts
const auth = await requireAuth()
if (auth.error) return auth.error
const { supabase, appUser } = auth
```

**Padrão de barra horizontal proporcional (Tailwind):**
```tsx
<div className="relative h-8 bg-gray-100 rounded overflow-hidden">
  <div
    className={`h-full bg-blue-500 transition-all ${isGargalo ? 'ring-2 ring-yellow-400' : ''}`}
    style={{ width: `${pctOfTop}%` }}
  />
  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-medium text-white">
    {label}: {count} ({pctOfTop.toFixed(0)}%)
  </span>
</div>
```

**Testing:**
- Sem suite de testes automatizados no projeto para rotas de API
- Validar manualmente: criar campanha com leads em diferentes estágios e verificar funil
- Testar estado vazio com campanha que tenha < 5 leads Meta no período

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled — quality validation via manual review + type-check + lint.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-01 | 1.0 | Story criada | River (@sm) |
